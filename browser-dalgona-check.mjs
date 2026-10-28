import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cp=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const spawn=cp.spawn;cp.spawn=(cmd,args,opts={})=>{if(opts.shell||/\.(cmd|bat)$/i.test(cmd))throw Error('Shell blocked');return spawn(cmd,args,{...opts,windowsHide:true})};require('node:module').syncBuiltinESMExports();
const {chromium}=require('playwright'),base=process.argv[2]||'http://127.0.0.1:4198',out='dist/qa/dalgona-'+(process.argv[2]?'public':'local');
let server,browser;const checks=[],errors=[];fs.mkdirSync(out,{recursive:true});const record=s=>{checks.push(s);console.log(s)};
const korean=el=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);const rows=[];while(w.nextNode()){const n=w.currentNode;if(!n.parentElement.closest('[translate="no"],script,style,textarea')&&n.parentElement.getBoundingClientRect().width&&/[가-힣]/.test(n.textContent))rows.push(n.textContent)}return rows};
try{
 if(!process.argv[2]){server=cp.spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'4198'},stdio:['ignore','pipe','pipe']});for(let i=0;i<50;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100))}}}
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const ctx=await browser.newContext({viewport:{width:390,height:760},recordVideo:{dir:out+'/video',size:{width:390,height:760}}});
 const p=await ctx.newPage();p.setDefaultTimeout(60000);p.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR '+e.message)});
 const game=p.locator('#game'),data=async k=>p.evaluate(k=>document.querySelector('#game').dataset[k],k);
 const unpause=async()=>{if(await data('phase')==='paused')await p.locator('[data-action="pause"]').click()};
 await p.goto(base+'/game/dalgona/');await p.locator('#game[data-phase="pick"]').waitFor();await p.waitForTimeout(600);await p.screenshot({path:out+'/pick.png'});
 assert.equal(await p.locator('[data-shape]').count(),4);
 for(const id of ['star','bear','flower','heart']){await p.locator(`[data-shape="${id}"]`).click();assert.equal(await p.locator(`[data-shape="${id}"]`).getAttribute('aria-pressed'),'true')}
 record('four shapes selectable');
 await p.locator('#dal-next').click();await p.locator('#game[data-phase="melt"]').waitFor();await p.waitForTimeout(500);await p.screenshot({path:out+'/melt-intro.png'});
 const b=await game.boundingBox(),cx=b.x+b.width/2,cy=b.y+b.height*.5;
 // circles with the real mouse while it is held down
 const circle=async(stop,shot)=>{let a=0;const end=Date.now()+40000;while(Date.now()<end){if(await data('phase')==='paused'){await unpause();await p.mouse.move(cx+70,cy);await p.mouse.down()}if(await stop())break;a+=.5;await p.mouse.move(cx+Math.cos(a)*70,cy+Math.sin(a)*70);if(shot&&a>12&&a<12.6)await p.screenshot({path:out+'/'+shot+'.png'});await p.waitForTimeout(16)}};
 await p.waitForTimeout(400);await p.mouse.move(cx+70,cy);await p.mouse.down();
 for(let i=0;i<40&&await data('state')!=='play';i++){await p.mouse.up();await p.waitForTimeout(120);await p.mouse.down()}
 await circle(async()=>Number(await data('melt'))>=84,'melt');await p.mouse.up();await p.waitForTimeout(100);console.log('MELT',await p.evaluate(()=>{const c=document.querySelector('#game').__dalgona;return JSON.stringify({phase:c.g.phase,state:c.g.state,melt:c.g.make.melt,fire:c.g.make.onFire,ptr:c.pointer})}));
 assert.equal(await data('state'),'done');record('stir-to-melt reaches golden sugar');
 await p.locator('#game[data-phase="soda"]').waitFor();await p.waitForTimeout(600);
 await p.mouse.move(cx+70,cy);for(let i=0;i<40&&await data('state')!=='play';i++){await p.mouse.down();await p.waitForTimeout(60);await p.mouse.up();await p.waitForTimeout(100)}
 await p.mouse.down();await circle(async()=>Number(await data('puff'))>=72,'soda');await p.mouse.up();
 await p.locator('#game[data-phase="press"]').waitFor();record('soda puffs the toffee');
 await p.waitForTimeout(2200);await p.screenshot({path:out+'/pour.png'});
 const y0=b.y+b.height*.35;await p.mouse.move(cx,y0);
 for(let i=0;i<40&&await data('state')!=='play';i++){await p.mouse.down();await p.mouse.up();await p.waitForTimeout(150)}
 await p.mouse.down();await p.mouse.move(cx,y0+b.height*.32*.7,{steps:12});await p.waitForTimeout(300);await p.screenshot({path:out+'/press.png'});await p.mouse.up();
 await p.locator('#game[data-phase="carve"]').waitFor();await p.waitForTimeout(700);await p.screenshot({path:out+'/stamp.png'});
 record('press and stamp');
 // carve: trace the projected outline at a calm pace
 for(let i=0;i<40&&await data('state')!=='play';i++){await p.mouse.move(cx,cy);await p.mouse.down();await p.mouse.up();await p.waitForTimeout(150)}
 const pts=await p.evaluate(()=>{const c=document.querySelector('#game').__dalgona;return c.g.path.map(q=>c.view.project(q.x,q.y))});
 await p.mouse.move(pts[0].x,pts[0].y);await p.mouse.down();
 let k=0,shot=0;const carveEnd=Date.now()+150000;
 while(Date.now()<carveEnd&&['carve','paused'].includes(await data('phase'))){
  if(await data('phase')==='paused'){await p.mouse.up();await unpause();await p.mouse.down()}
  k=(k+1)%pts.length;await p.mouse.move(pts[k].x,pts[k].y);await p.waitForTimeout(18);
  if(!shot&&Number(await data('progress'))>45){shot=1;await p.screenshot({path:out+'/carve.png'})}
 }
 await p.mouse.up();
 await p.locator('#game[data-phase="result"]').waitFor();await p.locator('#result').waitFor({state:'visible'});await p.waitForTimeout(1500);await p.screenshot({path:out+'/result.png'});
 const text=await p.locator('#result').innerText();console.log('RESULT',text.replace(/\n/g,' | '),'cracks',await data('cracks'));
 assert.match(text,/성공|하나 더/);record('needle trace frees the heart');
 for(const [w,h] of [[844,390],[1280,800]]){await p.setViewportSize({width:w,height:h});await p.waitForTimeout(900);await p.screenshot({path:out+`/result-${w}x${h}.png`});assert.ok(await p.locator('#result .primary').isVisible())}
 await p.setViewportSize({width:390,height:760});
 for(const lang of ['en','ja','zh-Hant','es']){await p.locator('#language-select').selectOption(lang);await p.waitForTimeout(150);assert.deepEqual(await p.locator('body').evaluate(korean),[],lang);await p.screenshot({path:out+'/result-'+lang+'.png'})}
 record('result translated in four languages');
 await p.locator('#language-select').selectOption('ko');
 // quick mode: straight to the needle, and a finger a few pixels off the groove still scratches it
 await p.goto(base+'/game/dalgona/');await p.locator('#game[data-phase="pick"]').waitFor();await p.locator('#dal-quick').click();
 await p.locator('#game[data-phase="carve"]').waitFor({timeout:3000});await p.waitForTimeout(1400);await p.screenshot({path:out+'/quick-intro.png'});
 const qp=await p.evaluate(()=>{const c=document.querySelector('#game').__dalgona;return c.g.path.map(q=>{const r=Math.hypot(q.x,q.y),f=(r+.07)/r;return c.view.project(q.x*f,q.y*f)})});
 for(let i=0;i<40&&await data('state')!=='play';i++){await p.mouse.move(qp[0].x,qp[0].y);await p.mouse.down();await p.waitForTimeout(80);if(await data('state')==='play')break;await p.mouse.up();await p.waitForTimeout(120)}
 // the tap that dismisses the intro card doesn't reach the candy, so touch again
 await p.mouse.up();await p.mouse.down();await p.waitForTimeout(50);
 assert.equal(await p.evaluate(()=>document.querySelector('#game').__dalgona.g.carve.where),'line');
 for(let k=0;k<qp.length;k++){await p.mouse.move(qp[k].x,qp[k].y);await p.waitForTimeout(16);if(k===40)await p.screenshot({path:out+'/quick-touch.png'})}
 await p.mouse.up();const qprog=Number(await data('progress'));assert.ok(qprog>=25,'quick progress '+qprog);
 record('quick mode skips making; an off-line finger snaps to the groove ('+qprog+'% in one lap)');
 // hands: a well-dug outside snaps off with a tap, a cut-through piece flies off with a swipe
 const outer=async s=>p.evaluate(s=>{const c=document.querySelector('#game').__dalgona,a=(s+.5)/12*Math.PI*2,r=c.g.radial(a)+.18;return c.view.project(Math.cos(a)*r,Math.sin(a)*r)},s);
 const dig=async(s,v)=>p.evaluate(([s,v])=>{const g=document.querySelector('#game').__dalgona.g;g.path.forEach((_,k)=>{if(g.sectors[k]===s)g.carve.progress[k]=v})},[s,v]);
 const popped=async s=>p.evaluate(s=>document.querySelector('#game').__dalgona.g.carve.popped[s],s);
 let tgt=-1;for(let s=0;s<12;s++)if(!await popped(s)&&!await p.evaluate(s=>document.querySelector('#game').__dalgona.g.carve.loose[s],s)){tgt=s;break}
 assert.ok(tgt>=0);await dig(tgt,.9);let o=await outer(tgt);await p.mouse.click(o.x,o.y);await p.waitForTimeout(100);
 assert.ok(await popped(tgt),'tap snaps a deep sector');assert.equal(await data('chips'),'0');
 let fl=-1;for(let s=0;s<12;s++)if(!await popped(s)){fl=s;break}
 await dig(fl,1);await p.waitForFunction(s=>document.querySelector('#game').__dalgona.g.carve.loose[s],fl,{timeout:5000});assert.equal(await popped(fl),false,'loose pieces wait for the hand');
 o=await outer(fl);await p.mouse.move(o.x,o.y);await p.mouse.down();await p.mouse.move(o.x+90,o.y-40,{steps:4});await p.waitForTimeout(60);await p.mouse.up();await p.waitForTimeout(250);await p.screenshot({path:out+'/flick.png'});
 assert.ok(await popped(fl),'swipe flings the loose piece');assert.ok(await p.evaluate(()=>document.querySelector('#game').__dalgona.view.flying.some(f=>f.flung)));
 record('tap snaps a deep outside clean; a swipe flings a loose piece');
 await p.goto(base+'/');await p.locator('#preview-dalgona[data-renderer]').waitFor({state:'attached'});assert.equal(await p.locator('.game-card').count(),5);await p.waitForTimeout(600);await p.screenshot({path:out+'/home.png',fullPage:true});record('home lists five games');
 const untranslated=[];for(const g of ['dalgona','pasta','beer','curling','drive','']){await p.goto(base+(g?'/game/'+g+'/':'/'));await p.waitForTimeout(300);for(const lang of ['en','ja','zh-Hant','es']){await p.locator('#language-select').selectOption(lang);await p.waitForTimeout(100);const raw=await p.locator('body').evaluate(korean);if(raw.length)untranslated.push({game:g||'home',lang,raw});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}await p.locator('#language-select').selectOption('ko')}
 for(const [width,height] of [[320,568],[844,390],[1280,800]]){await p.setViewportSize({width,height});await p.goto(base+'/game/dalgona/');await p.locator('#game[data-phase="pick"]').waitFor();const nb=await p.locator('#dal-next').boundingBox();assert.ok(nb.y>=0&&nb.y+nb.height<=height+1);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.waitForTimeout(300);await p.screenshot({path:out+`/layout-${width}x${height}.png`});record('dalgona fits '+width+'x'+height)}
 fs.writeFileSync(out+'/untranslated.json',JSON.stringify(untranslated,null,2));assert.deepEqual(untranslated,[]);assert.deepEqual(errors,[]);
 fs.writeFileSync(out+'/report.json',JSON.stringify({status:'passed',checks,errors},null,2));await ctx.close();
}finally{await browser?.close();server?.kill()}
