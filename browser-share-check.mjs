import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cp=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const spawn=cp.spawn;cp.spawn=function(cmd,args,opts={}){if(opts.shell||/\.(cmd|bat)$/i.test(cmd))throw Error('Shell blocked');return spawn.call(this,cmd,args,{...opts,windowsHide:true})};require('node:module').syncBuiltinESMExports();
const {chromium}=require('playwright'),base=process.argv[2]||'http://127.0.0.1:4199',out='dist/qa/share-'+(process.argv[2]?'public':'local');
let server,browser;const checks=[],errors=[];fs.mkdirSync(out,{recursive:true});
try {
 if(!process.argv[2]){server=cp.spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'4199'},stdio:['ignore','pipe','pipe']});for(let i=0;i<50;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100))}}}
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const ctx=await browser.newContext({permissions:['clipboard-read','clipboard-write']});
 for(const [width,height] of [[390,650],[320,568],[844,390],[1280,800]]){
  const p=await ctx.newPage();await p.setViewportSize({width,height});p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'/game/beer/');await p.locator('#game[data-phase="ready"]').waitFor();
  const share=p.getByRole('button',{name:'게임 공유',exact:true});const b=await share.boundingBox(),left=await p.locator('.hud-left').boundingBox();assert.ok(b.width>=44&&b.height>=44&&b.x+b.width<=width);assert.ok(left.x+left.width<= (await p.locator('.controls').boundingBox()).x);
  await p.locator('#game').focus();await p.keyboard.down('Space');await p.waitForTimeout(400);await p.keyboard.up('Space');
  await p.screenshot({path:`${out}/game-${width}x${height}.png`});
  await share.click();await p.getByRole('dialog',{name:'게임 공유'}).waitFor();const time=await p.locator('#main-value').innerText();await p.waitForTimeout(1100);assert.equal(await p.locator('#main-value').innerText(),time);
  await p.getByRole('button',{name:'링크 복사',exact:true}).click();assert.equal(await p.evaluate(()=>navigator.clipboard.readText()),base+'/game/beer/');assert.match(await p.locator('#share-feedback').innerText(),/복사했습니다/);
  const x=p.getByRole('link',{name:'X 공유',exact:true}),url=new URL(await x.getAttribute('href'));assert.equal(url.origin,'https://x.com');assert.equal(url.pathname,'/intent/tweet');assert.equal(url.searchParams.get('url'),base+'/game/beer/');assert.match(url.searchParams.get('text'),/맥주 잘 따르기/);assert.doesNotMatch(url.searchParams.get('text'),/0점/);
  await ctx.route('https://x.com/**',r=>r.fulfill({status:200,contentType:'text/html',body:'<title>X intent test</title>'}));const popupPromise=p.waitForEvent('popup');await x.click();const popup=await popupPromise;await popup.waitForLoadState();assert.equal(popup.url(),url.href);await popup.close();
  await p.screenshot({path:`${out}/dialog-${width}x${height}.png`});await p.keyboard.press('Escape');assert.ok(await p.locator('#dialog').isHidden());assert.ok(await share.evaluate(e=>e===document.activeElement));
  await share.click();await p.evaluate(()=>Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async()=>{throw new DOMException('denied','NotAllowedError')}}));await p.getByRole('button',{name:'링크 복사',exact:true}).click();assert.match(await p.locator('#share-feedback').innerText(),/자동 복사가 제한/);assert.equal(await p.locator('#share-url').inputValue(),base+'/game/beer/');await p.screenshot({path:`${out}/fallback-${width}x${height}.png`});
  checks.push(`${width}x${height}: layout, clipboard, X handoff, paused timer, Escape focus, denied clipboard`);console.log(checks.at(-1));await p.close();
 }
 for(const game of ['curling','drive']){const p=await ctx.newPage();await p.goto(base+'/game/'+game+'/');await p.getByRole('button',{name:'게임 공유',exact:true}).click();assert.equal(await p.locator('#share-url').inputValue(),base+'/game/'+game+'/');checks.push(game+' current game link');await p.close()}
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({status:'passed',base,checks,errors},null,2));
}finally{await browser?.close();server?.kill()}
