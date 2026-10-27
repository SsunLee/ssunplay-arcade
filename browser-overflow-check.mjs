import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const original=cp.spawn;cp.spawn=function(cmd,args,opts={}){if(opts.shell||/\.(cmd|bat)$/i.test(cmd))throw Error('Shell blocked');return original.call(this,cmd,args,{...opts,windowsHide:true});};require('node:module').syncBuiltinESMExports();
const {chromium}=require('playwright');
const url=process.env.BASE_URL||process.argv[2];
const base=url||'http://127.0.0.1:4198',mode=url?'public':'local';
const out='dist/qa/taproom-'+mode;fs.mkdirSync(out,{recursive:true});
let server,browser;const checks=[],errors=[];const record=(name,detail={})=>{checks.push({name,...detail});console.log(JSON.stringify(checks.at(-1)))};
(async()=>{
 if(mode==='local'){server=cp.spawn(process.execPath,['server.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:'4198'},stdio:['ignore','pipe','pipe']});for(let i=0;i<50;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100))}}}
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const mobile of [false,true]){
  const label=mobile?'mobile':'desktop';
  const ctx=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,recordVideo:{dir:out+'/video',size:{width:390,height:844}}}:{viewport:{width:1280,height:800}});
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',e=>{if(e.type()==='error')errors.push(e.text())});
  await p.goto(base+'/game/beer/');await p.locator('#game[data-phase="ready"]').waitFor();await p.screenshot({path:out+'/'+label+'-ready.png'});
  assert.ok(await p.getByRole('button',{name:'서빙',exact:true}).isDisabled());record(label+' empty glass cannot be served');
  const controls=await p.locator('.beer-actions button').evaluateAll(bs=>bs.filter(b=>b.id==='beer-pour'||b.dataset.action==='beer-serve'||b.dataset.action?.startsWith('beer-')).map(b=>({name:b.textContent.trim(),height:b.getBoundingClientRect().height,width:b.getBoundingClientRect().width})));
  assert.ok(controls.every(b=>b.height>=44&&b.width>=44));record(label+' touch targets at least 44px');
  const hold=async()=>{if(mobile){const cd=await ctx.newCDPSession(p);const r=await p.locator('#game').boundingBox();await cd.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width/2,y:r.y+r.height/2}]});return async()=>{await cd.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cd.detach()}}await p.locator('#game').focus();await p.keyboard.down('Space');return ()=>p.keyboard.up('Space')};
  let release=await hold();await p.waitForTimeout(1600);await release();await p.waitForTimeout(700);assert.equal(await p.locator('#game').getAttribute('data-spilled-ml'),'0');record(label+' short controlled pour does not spill');
  await p.screenshot({path:out+'/'+label+'-normal.png'});
  await p.getByRole('button',{name:'잔 세우기 ↑',exact:true}).click();
  release=await hold();await p.waitForFunction(()=>Number(document.querySelector('#game').dataset.spilledMl)>=35,{},{timeout:60000});
  assert.equal(await p.locator('#game').getAttribute('data-overflow-visible'),'true');await p.screenshot({path:out+'/'+label+'-overflow-a.png'});
  await p.waitForTimeout(350);await p.screenshot({path:out+'/'+label+'-overflow-b.png'});record(label+' irregular overflow renders during real pour');
  await p.waitForFunction(()=>Number(document.querySelector('#game').dataset.spilledMl)>=200,{},{timeout:60000});
  const text=await p.locator('#beer-spill').innerText();assert.match(text,/−[4-9]\d/);await p.screenshot({path:out+'/'+label+'-over30.png'});record(label+' spill penalty exceeds 30', {readout:text});
  await release();await p.waitForFunction(()=>document.querySelector('#game').dataset.overflowVisible==='false');
  const amount=await p.locator('#game').getAttribute('data-spilled-ml');await p.waitForTimeout(700);assert.equal(await p.locator('#game').getAttribute('data-spilled-ml'),amount);record(label+' releasing stops flow and penalty');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.getByRole('button',{name:'서빙',exact:true}).click();await p.locator('#result').waitFor({state:'visible'});assert.match(await p.locator('#result').innerText(),/넘침 감점/);record(label+' result shows penalty');
  await p.screenshot({path:out+'/'+label+'-result.png'});
  await p.getByRole('button',{name:'다음 손님 →',exact:true}).click();await p.locator('#game[data-phase="ready"]').waitFor();assert.equal(await p.locator('#game').getAttribute('data-spilled-ml'),'0');assert.ok(await p.locator('#beer-spill').isHidden());record(label+' next order resets spill');
  await p.getByRole('button',{name:'일시 정지',exact:true}).click();await p.locator('#game[data-phase="paused"]').waitFor();assert.ok(await p.getByRole('button',{name:'서빙',exact:true}).isDisabled());record(label+' pause disables serving');
  await ctx.close();
 }
 // Compact/landscape layout still fits around the playable glass.
 for(const [width,height] of [[375,667],[390,650],[320,568],[844,390]]){const p=await browser.newPage({viewport:{width,height}});p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/game/beer/');await p.locator('#game[data-phase="ready"]').waitFor();const box=await p.locator('.beer-actions').boundingBox();assert.ok(box.y>=0&&box.x>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);const scene=await p.locator('#game').boundingBox(),ticket=await p.locator('#beer-order').boundingBox();assert.ok(ticket.y+ticket.height<=scene.y || ticket.x+ticket.width<=scene.x,'order must not cover scene');assert.equal(await p.locator('#beer-pour').count(),0);await p.screenshot({path:out+`/layout-${width}x${height}.png`});record('controls fit '+width+'x'+height);await p.close()}
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({base,testedAt:new Date().toISOString(),checks,errors,status:'passed'},null,2));
})().catch(e=>{console.error(e);fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors,error:String(e)},null,2));process.exitCode=1}).finally(async()=>{await browser?.close();server?.kill()});
