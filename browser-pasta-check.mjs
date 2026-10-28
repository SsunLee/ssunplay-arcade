import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cp=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const spawn=cp.spawn;cp.spawn=(cmd,args,opts={})=>{if(opts.shell||/\.(cmd|bat)$/i.test(cmd))throw Error('Shell blocked');return spawn(cmd,args,{...opts,windowsHide:true})};require('node:module').syncBuiltinESMExports();
const {chromium}=require('playwright'),base=process.argv[2]||'http://127.0.0.1:4199',out='dist/qa/pasta-'+(process.argv[2]?'public':'local');
let server,browser;const checks=[],errors=[];fs.mkdirSync(out,{recursive:true});const record=s=>{checks.push(s);console.log(s)};
const korean=el=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);const rows=[];while(w.nextNode()){const n=w.currentNode;if(!n.parentElement.closest('[translate="no"],script,style,textarea')&&n.parentElement.getBoundingClientRect().width&&/[가-힣]/.test(n.textContent))rows.push(n.textContent)}return rows};
try{
 if(!process.argv[2]){server=cp.spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'4199'},stdio:['ignore','pipe','pipe']});for(let i=0;i<50;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100))}}}
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const ctx=await browser.newContext({viewport:{width:390,height:760},permissions:['clipboard-read','clipboard-write'],recordVideo:{dir:out+'/video',size:{width:390,height:760}}});
 const p=await ctx.newPage();p.setDefaultTimeout(60000);p.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR '+e.message)});
 const game=p.locator('#game'),data=async k=>p.evaluate(k=>document.querySelector('#game').dataset[k],k);
 const box=async()=>game.boundingBox();
 // intro cards ignore taps for a moment so a carried-over tap can't start a station
 const begin=async(x,y)=>{for(let i=0;i<60&&await data('state')!=='play';i++){await p.mouse.click(x,y);await p.waitForTimeout(150)}assert.equal(await data('state'),'play')};
 // keep the run going if the headless page reports itself hidden
 const unpause=async()=>{if(await data('phase')==='paused')await p.locator('[data-action="pause"]').click()};
 await p.goto(base+'/game/pasta/');await p.locator('#game[data-phase="recipe"]').waitFor();await p.waitForTimeout(500);await p.screenshot({path:out+'/recipe.png'});
 assert.equal(await p.locator('[data-sauce]').count(),4);
 for(const id of ['cream','pesto','rose','tomato']){await p.locator(`[data-sauce="${id}"]`).click();assert.equal(await p.locator(`[data-sauce="${id}"]`).getAttribute('aria-pressed'),'true')}
 record('four sauces selectable');
 // 1. chop: tap as the guide reaches the knife
 await p.locator('#pasta-next').click();await p.locator('#game[data-phase="chop"]').waitFor();await p.waitForTimeout(700);await p.screenshot({path:out+'/chop-intro.png'});
 let b=await box();const cx=b.x+b.width/2,cy=b.y+b.height*.45;
 await begin(cx,cy);
 let shot=false,switched=false;
 const chopEnd=Date.now()+180000;for(let i=0;Date.now()<chopEnd&&['chop','paused'].includes(await data('phase'));i++){
  await unpause();
  // wait in the page for the guide to reach the knife, then tap with the real mouse
  const ready=await p.evaluate(()=>new Promise(res=>{const c=document.querySelector('#game'),t0=performance.now();const f=()=>{if(c.dataset.phase!=='chop')return res(false);if(c.dataset.cut!==''&&Number(c.dataset.cut)>=.98)return res(true);if(performance.now()-t0>3000)return res(false);requestAnimationFrame(f)};f()}));
  if(ready){await p.mouse.click(cx,cy);if(!shot&&Number(await data('slices'))===3){await p.waitForTimeout(250);await p.screenshot({path:out+'/chop.png'});shot=true}}
  if(!switched&&Number(await data('slices'))>=5){switched=true;await p.locator('#language-select').selectOption('en');assert.equal(await data('phase'),'chop');assert.match(await p.locator('#pasta-stage-title').innerText(),/Chop/);await p.screenshot({path:out+'/chop-en.png'})}
 }
 const slices=Number(await data('slices')),perfects=Number(await data('perfects'));console.log('CHOP',slices,perfects);
 assert.ok(slices>=10,'slices '+slices);assert.ok(perfects>=8,'perfects '+perfects+'/'+slices);assert.ok(switched);
 record(`rhythm chopping with real taps: ${perfects}/${slices} perfect, language switch kept progress`);
 // 2. stove: hold the pan for heat, let go to tap the pot, drag the pasta across at al dente
 await p.locator('#game[data-phase="stove"]').waitFor();await p.waitForTimeout(600);
 const at=w=>p.evaluate(w=>document.querySelector('#game').__pasta.view.screenOf(w),w);
 let pan=await at('pan'),pot=await at('pot');
 assert.ok(pan.x<pot.x,'pan sits left of the pot');assert.equal(await p.evaluate(([x,y])=>document.querySelector('#game').__pasta.view.burnerAt(x,y),[pot.x,pot.y]),'pot');
 await begin(pan.x,pan.y);await p.waitForTimeout(1200);pan=await at('pan');pot=await at('pot');
 let down=false,taps=0;
 const stoveEnd=Date.now()+120000;for(let i=0;Date.now()<stoveEnd&&['stove','paused'].includes(await data('phase'));i++){
  if(await data('phase')==='paused'){if(down){await p.mouse.up();down=false}await unpause()}
  if(Number(await data('done'))>=74)break;
  if(Number(await data('foam'))>66){if(down){await p.mouse.up();down=false}await p.mouse.click(pot.x,pot.y);taps++;await p.waitForTimeout(40);continue}
  const want=Number(await data('temp'))<57;
  if(want!==down){down=want;if(want){await p.mouse.move(pan.x,pan.y);await p.mouse.down()}else await p.mouse.up()}
  if(i===60)await p.screenshot({path:out+'/stove.png'});
  await p.waitForTimeout(25);
 }
 if(down)await p.mouse.up();
 assert.ok(taps>=1,'pot taps '+taps);
 pan=await at('pan');pot=await at('pot');await p.screenshot({path:out+'/stove-ready.png'});
 await p.mouse.move(pot.x,pot.y);await p.mouse.down();await p.mouse.move(pan.x,pan.y,{steps:10});await p.mouse.up();
 console.log('DRAIN',await data('phase'),await data('state'),await data('done'));
 await p.locator('#game[data-phase="toss"]').waitFor({timeout:5000});
 record(`two burners at once: ${taps} pot taps while holding the pan, drag-to-drain at al dente`);
 // 4. toss: drag up to the band height
 await p.locator('#game[data-phase="toss"]').waitFor();await p.waitForTimeout(700);
 b=await box();const y0=b.y+b.height*.85;
 for(let n=0;n<3;n++){
  await p.waitForFunction(()=>document.querySelector('#game').dataset.flight==='0');await unpause();
  const [lo,hi]=(await data('band')).split(',').map(Number),power=(lo+hi)/2;
  await p.mouse.move(cx,y0);await p.mouse.down();await p.mouse.move(cx,y0-power*b.height*.42,{steps:8});await p.mouse.up();
  if(n===0){await p.waitForTimeout(250);await p.screenshot({path:out+'/toss.png'})}
  await p.waitForTimeout(1300);
 }
 await p.locator('#game[data-phase="result"]').waitFor();await p.locator('#result').waitFor({state:'visible'});await p.waitForTimeout(800);
 await p.screenshot({path:out+'/result.png'});
 for(const [w,h] of [[844,390],[1280,800]]){await p.setViewportSize({width:w,height:h});await p.waitForTimeout(900);await p.screenshot({path:out+`/result-${w}x${h}.png`});assert.ok(await p.locator('#result .primary').isVisible())}
 await p.setViewportSize({width:390,height:760});await p.waitForTimeout(500);
 const text=await p.locator('#result').innerText();assert.match(text,/pasta is ready/);
 const value=Number(text.match(/(\d+)\s*pts/)?.[1]);assert.ok(value>=75,'score '+value);
 assert.deepEqual(await p.locator('body').evaluate(korean),[]);
 record('full meal scored '+value+' with no untranslated English UI');
 await p.locator('[data-action="boast"]').click();assert.match(await p.locator('#share-url').inputValue(),/Tomato/);await p.locator('[data-action="copy-link"]').click();assert.match(await p.evaluate(()=>navigator.clipboard.readText()),/Chopping/);await p.keyboard.press('Escape');
 record('result sharing includes station scores');
 for(const lang of ['ja','zh-Hant','ko']){await p.locator('#language-select').selectOption(lang);assert.equal(await p.locator('html').getAttribute('lang'),lang);if(lang!=='ko')assert.deepEqual(await p.locator('body').evaluate(korean),[]);await p.screenshot({path:out+'/result-'+lang+'.png'})}
 // keyboard-only meal
 await p.goto(base+'/game/pasta/');await p.locator('#game[data-phase="recipe"]').waitFor();await game.focus();await p.keyboard.press('Enter');await p.locator('#game[data-phase="chop"]').waitFor();await p.waitForTimeout(600);for(let i=0;i<60&&await data('state')!=='play';i++){await p.keyboard.press('Space');await p.waitForTimeout(150)}
 for(let i=0;i<20;i++){await p.keyboard.press('Space');await p.waitForTimeout(400)}
 assert.ok(Number(await data('slices'))>3);record('keyboard chopping works');
 await p.goto(base+'/game/beer/');await p.locator('#game[data-phase="ready"]').waitFor();assert.ok(await p.locator('#beer-drag-guide').isVisible());const beer=await game.boundingBox();await p.mouse.move(beer.x+beer.width*.5,beer.y+beer.height*.5);await p.mouse.down();await p.mouse.move(beer.x+beer.width*.7,beer.y+beer.height*.5,{steps:8});await p.mouse.up();await p.waitForTimeout(300);assert.match(await p.locator('#beer-drag-guide').getAttribute('class'),/learned/);record('beer guide still dismisses after a real gesture');
 const untranslated=[];for(const g of ['beer','curling','drive','pasta']){await p.goto(base+'/game/'+g+'/');await game.waitFor();for(const lang of ['en','ja','zh-Hant']){await p.locator('#language-select').selectOption(lang);await p.waitForTimeout(100);const raw=await p.locator('body').evaluate(korean);if(raw.length)untranslated.push({game:g,lang,raw});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}record(g+' language selector works')}
 await p.locator('#language-select').selectOption('ko');
 await p.goto(base+'/');await p.locator('#preview-pasta[data-renderer]').waitFor({state:'attached'});assert.equal(await p.locator('.game-card').count(),5);await p.waitForTimeout(600);await p.screenshot({path:out+'/home.png',fullPage:true});record('home lists all five games');
 for(const [width,height] of [[320,568],[844,390],[1280,800]]){await p.setViewportSize({width,height});await p.goto(base+'/game/pasta/');await p.locator('#game[data-phase="recipe"]').waitFor();const nb=await p.locator('#pasta-next').boundingBox();assert.ok(nb.y>=0&&nb.y+nb.height<=height+1);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.waitForTimeout(300);await p.screenshot({path:out+`/layout-${width}x${height}.png`});await p.locator('#pasta-next').click();await p.locator('#game[data-phase="chop"]').waitFor();await p.waitForTimeout(700);await p.screenshot({path:out+`/layout-${width}x${height}-chop.png`});record('pasta fits '+width+'x'+height)}
 fs.writeFileSync(out+'/untranslated.json',JSON.stringify(untranslated,null,2));assert.deepEqual(untranslated,[]);assert.deepEqual(errors,[]);
 fs.writeFileSync(out+'/report.json',JSON.stringify({status:'passed',checks,errors,untranslated},null,2));await ctx.close();
}finally{await browser?.close();server?.kill()}
