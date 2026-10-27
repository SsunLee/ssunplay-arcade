import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cp=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const spawn=cp.spawn;cp.spawn=(cmd,args,opts={})=>{if(opts.shell||/\.(cmd|bat)$/i.test(cmd))throw Error('Shell blocked');return spawn(cmd,args,{...opts,windowsHide:true})};require('node:module').syncBuiltinESMExports();
const {chromium}=require('playwright'),base=process.argv[2]||'http://127.0.0.1:4199',out='dist/qa/boast-'+(process.argv[2]?'public':'local');
let server,browser;const checks=[],errors=[];fs.mkdirSync(out,{recursive:true});
try{
 if(!process.argv[2]){server=cp.spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'4199'},stdio:['ignore','pipe','pipe']});for(let i=0;i<50;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100))}}}
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});const ctx=await browser.newContext({viewport:{width:390,height:650},permissions:['clipboard-read','clipboard-write']});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/game/beer/');await p.locator('#game[data-phase="ready"]').waitFor();
 let spilled;
 for(let round=0;round<3;round++){
  await p.locator('#game').focus();await p.keyboard.down('Space');
  if(round===0)await p.waitForFunction(()=>Number(document.querySelector('#game').dataset.spilledMl)>100,{},{timeout:60000});else await p.waitForTimeout(900);
  await p.keyboard.up('Space');await p.getByRole('button',{name:'서빙',exact:true}).click();await p.locator('#result').waitFor({state:'visible'});
  await p.screenshot({path:`${out}/result-${round+1}.png`});await p.getByRole('button',{name:'자랑하기 ↗',exact:true}).click();await p.getByRole('dialog',{name:'내 기록 자랑하기'}).waitFor();
  const stats=await p.locator('.boast-stats').innerText(),payload=await p.locator('#share-url').inputValue();assert.match(stats,/흘린 맥주/);assert.match(stats,/넘침 감점/);assert.match(payload,/mL/);assert.match(payload,/점/);if(round===0){spilled=Number((await p.locator('.boast-stats dd').first().innerText()).replace('mL',''));assert.ok(spilled>=100);assert.match(payload,/손님 1/)}if(round===1)assert.match(stats,/0mL/);if(round===2){assert.match(payload,/평균/);assert.match(payload,/누적/);assert.equal(Number((await p.locator('.boast-stats dd').first().innerText()).replace('mL','')),spilled)}
  await p.getByRole('button',{name:'기록·링크 복사',exact:true}).click();assert.equal((await p.evaluate(()=>navigator.clipboard.readText())).replaceAll("\r\n","\n"),payload);const x=new URL(await p.getByRole('link',{name:'X 공유',exact:true}).getAttribute('href'));assert.equal(x.searchParams.get('text')+'\n'+x.searchParams.get('url'),payload);
  await p.screenshot({path:`${out}/boast-${round+1}.png`});
  for(const [width,height] of [[320,568],[844,390]]){await p.setViewportSize({width,height});const d=await p.locator('#dialog').boundingBox();assert.ok(d.x>=0&&d.y>=0&&d.x+d.width<=width+1&&d.y+d.height<=height+1);await p.getByRole('link',{name:'X 공유',exact:true}).scrollIntoViewIfNeeded();await p.screenshot({path:`${out}/boast-${round+1}-${width}x${height}.png`})}await p.setViewportSize({width:390,height:650});await p.keyboard.press('Escape');assert.ok(await p.locator('#dialog').isHidden());assert.ok(await p.getByRole('button',{name:'자랑하기 ↗',exact:true}).evaluate(e=>e===document.activeElement));checks.push('customer '+(round+1)+' result, metrics, copy, X payload, compact layout, focus');console.log(checks.at(-1));
  if(round<2)await p.getByRole('button',{name:'다음 손님 →',exact:true}).click();
 }
 await p.getByRole('button',{name:'다시 도전 ↻',exact:true}).click();await p.getByRole('button',{name:'게임 공유',exact:true}).click();assert.equal(await p.locator('.boast-card').count(),0);assert.equal(await p.locator('#share-url').inputValue(),base+'/game/beer/');assert.ok(!(await p.locator('#dialog').getAttribute('class')).includes('boast-dialog'));checks.push('restart removes stale result');assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({status:'passed',base,checks,errors},null,2));
}finally{await browser?.close();server?.kill()}
