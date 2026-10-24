export const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
export const STAGES=[
{id:'coast',name:'해안 도로',sub:'바닷바람과 첫 도전',length:42,friction:3.8,color:'#7fccc9',sky:'#c2e6e8'},
{id:'desert',name:'붉은 협곡',sub:'더 멀리, 더 빠르게',length:60,friction:3.2,color:'#e5ab81',sky:'#f5d6ad'},
{id:'night',name:'달빛 부두',sub:'미끄러운 야간 주행',length:52,friction:2.7,color:'#344b68',sky:'#1d304e'}];
export function slide(body,dt,friction){
const v=Math.hypot(body.vx,body.vz);if(v<=0)return;
const elapsed=Math.min(dt,v/friction),travel=v*elapsed-.5*friction*elapsed*elapsed;
body.x+=body.vx/v*travel;body.z+=body.vz/v*travel;
const next=Math.max(0,v-friction*dt);body.vx*=next/v;body.vz*=next/v;}
export function curlingShot(dx,dy){const speed=clamp(dy,0,280)*.045,angle=clamp(dx*.0025,-.5,.5);return{x:0,z:0,vx:Math.sin(angle)*speed,vz:Math.cos(angle)*speed};}
export function curlingOutcome(body,target){
if(Math.abs(body.x-target.x)>.7)return{ok:false,reason:'방향이 조금 빗나갔어요'};
if(body.z<target.z-.75)return{ok:false,reason:'조금만 더 세게 밀어볼까요?'};
if(body.z>target.z+.75)return{ok:false,reason:'앗, 너무 힘이 넘쳤어요!'};
return{ok:true,reason:Math.abs(body.z-target.z)<.25?'완벽한 착석!':'무사히 착석!'};}
export function raceScore(remaining,fallen=false){return fallen||remaining<0?0:Math.round(clamp(10000-remaining*380,0,10000));}
export function validRecords(value){if(!value||value.version!==1||!Array.isArray(value.runs)||value.runs.length>500)return false;return value.runs.every(r=>r&&['curling','drive'].includes(r.game)&&Number.isFinite(r.score)&&r.score>=0&&r.score<=100000&&Number.isFinite(r.value)&&r.value>=0&&r.value<=10000&&typeof r.date==='string'&&Number.isFinite(Date.parse(r.date))&&typeof r.stage==='string'&&r.stage.length<40&&typeof r.ok==='boolean');}
export function seededTarget(round){return{z:4+round*2,x:round===0?0:Math.sin(round*2.41)*1.25};}
export class Game{
constructor(kind,stage=0){this.kind=kind;this.stage=stage;this.reset();}
reset(){this.phase='ready';this.beforePause=null;this.time=0;this.round=0;this.target=seededTarget(0);this.body={x:0,z:0,vx:0,vz:0};this.lastDistance=0;this.remaining=STAGES[this.stage].length;this.speed=0;this.charge=0;this.feedback='';this.elapsed=0;this.braking=false;this.result=null;this.roundTime=0;}
launch(dx,dy){if(!['ready','aiming'].includes(this.phase))return false;if(dy<8){this.phase='ready';return false;}this.elapsed=0;this.phase='moving';this.feedback='';if(this.kind==='curling')this.body=curlingShot(dx,dy);else{this.speed=clamp(dy*.085,5,25);this.body.z=0;this.braking=false;}return true;}
brake(){if(this.kind==='drive'&&this.phase==='moving'){this.braking=true;return true;}return false;}
pause(){if(['ready','aiming','moving','success'].includes(this.phase)){this.beforePause=this.phase==='aiming'?'ready':this.phase;this.phase='paused';return true;}return false;}
resume(){if(this.phase==='paused'){this.phase=this.beforePause||'ready';this.beforePause=null;}}
finish(ok,reason){if(this.phase==='result')return;this.phase='result';this.feedback=reason;this.result={ok,game:this.kind,stage:this.kind==='curling'?'office':STAGES[this.stage].id,value:this.kind==='curling'?this.lastDistance:Math.max(0,this.remaining),score:this.kind==='curling'?Math.round(this.lastDistance*100):raceScore(this.remaining,!ok)};}
update(dt){if(this.phase==='paused'||this.phase==='result')return;dt=clamp(dt,0,.05);this.time+=dt;
if(this.phase==='success'){this.elapsed+=dt;if(this.elapsed>1.4){if(this.round===19){this.finish(true,'20명 전원 퇴근! 사무실을 구했어요!');return;}this.round++;this.target=seededTarget(this.round);this.body={x:0,z:0,vx:0,vz:0};this.phase='ready';this.roundTime=0;this.feedback='';}return;}
if(this.kind==='curling'&&['ready','aiming'].includes(this.phase)&&this.round>0){this.roundTime+=dt;if(this.roundTime>15)this.finish(false,'앗, 기다리다 잠들었어요!');}
if(this.phase!=='moving')return;this.elapsed+=dt;
if(this.kind==='curling'){slide(this.body,dt,1.8);if(Math.hypot(this.body.vx,this.body.vz)<.001){const outcome=curlingOutcome(this.body,this.target);this.feedback=outcome.reason;if(outcome.ok){this.phase='success';this.lastDistance=this.target.z;this.elapsed=0;}else this.finish(false,outcome.reason);}}
else{const st=STAGES[this.stage];if(this.braking){const t=Math.min(dt,this.speed/st.friction);this.body.z+=this.speed*t-.5*st.friction*t*t;this.speed=Math.max(0,this.speed-st.friction*dt);}else this.body.z+=this.speed*dt;this.remaining=st.length-this.body.z;if(this.remaining<-.25){this.finish(false,'브레이크가 한발 늦었어요!');return;}if(this.braking&&this.speed===0)this.finish(this.remaining>=0,this.remaining<1?'이 정도면 브레이크 장인!':this.remaining<5?'간이 크시네요!':'안전 운전도 좋지만, 조금 더 가까이!');}}
}
