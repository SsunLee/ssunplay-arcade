import {clamp,STAGES} from './engine.js';
const PI=Math.PI;
function poly(c,pts,fill,stroke){c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}}
function line(c,pts,color,width=3){c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();}
function rr(c,x,y,w,h,r,fill){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();}
function ellipse(c,x,y,rx,ry,color){c.beginPath();c.ellipse(x,y,rx,ry,0,0,PI*2);c.fillStyle=color;c.fill();}
function isoBox(c,x,y,w,d,h,color,side='#b5c0ad',top='#e2e5d6'){
poly(c,[[x,y-h],[x+w,y-h+d*.45],[x+w-d*.6,y-h+d],[x-d*.6,y-h+d*.55]],top);
poly(c,[[x,y-h],[x+w,y-h+d*.45],[x+w,y+d*.45],[x,y]],color);
poly(c,[[x+w,y-h+d*.45],[x+w-d*.6,y-h+d],[x+w-d*.6,y+d],[x+w,y+d*.45]],side);
}
export function chair(c,x,y,s=1,tilt=0){c.save();c.translate(x,y);c.scale(s,s);c.rotate(tilt);ellipse(c,1,14,47,12,'#243c3430');line(c,[[0,0],[0,17]],'#35433c',8);for(const [dx,dy]of [[-34,12],[35,14],[1,27],[-20,-5],[23,-4]]){line(c,[[0,13],[dx,dy+13]],'#35433c',5);ellipse(c,dx,dy+16,6,6,'#27352f');}rr(c,-35,-53,70,22,9,'#de6c31');rr(c,-35,-61,70,22,8,'#fa9951');rr(c,-34,-130,68,78,12,'#d86a2f');rr(c,-30,-130,60,70,10,'#f7a354');line(c,[[-43,-59],[-43,-43],[-34,-40]],'#38453d',5);line(c,[[43,-59],[43,-43],[34,-40]],'#38453d',5);line(c,[[-15,-116],[15,-116]],'#ffd5a1',2);c.restore();}
function person(c,x,y,s,t,seated=false){c.save();c.translate(x,y);c.scale(s,s);c.rotate(seated?0:Math.sin(t*2)*.065);ellipse(c,0,5,23,7,'#243c3425');if(seated){line(c,[[-10,-50],[-27,-41],[-28,-9]],'#303b45',13);line(c,[[10,-50],[26,-41],[27,-9]],'#303b45',13);}else{line(c,[[-11,-46],[-15,-20],[-20,0]],'#303b45',13);line(c,[[10,-46],[13,-19],[21,0]],'#303b45',13);}line(c,[[-22,1],[-10,1]],'#202931',9);line(c,[[14,1],[26,1]],'#202931',9);rr(c,-22,-106,44,63,12,'#729b9b');line(c,[[-24,-95],[-34,-68],[-29,-46]],'#89b0ab',11);line(c,[[24,-95],[32,-71],[23,-47]],'#89b0ab',11);ellipse(c,0,-123,18,21,'#f0bd96');ellipse(c,-2,-135,18,11,'#394340');rr(c,-4,-116,3,3,1,'#37403b');rr(c,7,-116,3,3,1,'#37403b');c.restore();}
export class Scene{
constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.w=800;this.h=560;this.resize();}
resize(){const r=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);this.w=r.width||800;this.h=r.height||560;this.canvas.width=Math.round(this.w*dpr);this.canvas.height=Math.round(this.h*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0);}
draw(g,preview=false){const c=this.ctx,w=this.w,h=this.h;c.clearRect(0,0,w,h);c.save();const scale=Math.max(w/800,h/560);c.translate((w-800*scale)/2,(h-560*scale)/2);c.scale(scale,scale);if(g.kind==='curling')this.office(c,g,preview);else this.road(c,g,preview);c.restore();}
office(c,g,preview){c.fillStyle='#dbe5d7';c.fillRect(0,0,800,560);c.fillStyle='#eff2e7';c.fillRect(0,0,800,165);poly(c,[[0,0],[215,0],[280,165],[0,340]],'#cadacb');poly(c,[[800,0],[650,0],[560,165],[800,330]],'#d1dfd0');
for(let i=0;i<4;i++){let x=22+i*47;poly(c,[[x,15],[x+32,15],[x+57,145-i*13],[x+25,165-i*13]],'#b8d8da');line(c,[[x+16,18],[x+41,155-i*13]],'#eef6ed',3);}
for(let i=0;i<15;i++){const z=i*.8,yy=180+Math.pow(i/14,1.65)*380;line(c,[[0,yy],[800,yy]],'#c5d3c220',1);}
for(let i=-5;i<7;i++)line(c,[[400+i*28,170],[400+i*160,560]],'#b8cbb340',1);
const table=(x,y,s)=>{c.save();c.translate(x,y);c.scale(s,s);line(c,[[-65,0],[-65,65]],'#9cae98',5);line(c,[[35,13],[35,77]],'#9cae98',5);isoBox(c,-60,0,130,75,8,'#dbb98c','#c8a475','#edd4b1');isoBox(c,-10,-15,47,8,43,'#4d6868','#3b5456','#627c7b');line(c,[[3,-13],[3,-5]],'#82928b',4);rr(c,30,-14,15,7,2,'#f5e5cf');c.restore();};
for(let i=3;i>=0;i--){let s=.4+(3-i)*.18;table(80-i*15,190+(3-i)*74,s);table(695+i*7,173+(3-i)*72,s);}
for(const [x,y,s]of [[105,430,1],[698,388,.8]]){isoBox(c,x,y,33,35,42,'#eee8cf','#cfccb7','#f4eddb');ellipse(c,x+5,y-72,34*s,42*s,'#7b9c69');ellipse(c,x-10,y-88,24*s,31*s,'#9ab77b');}
rr(c,334,65,132,44,7,'#3d5546');c.fillStyle='#e8efdc';c.font='bold 15px sans-serif';c.textAlign='center';c.fillText('MEETING? NO.',400,93);
const max=Math.max(g.target.z+4,10),project=(x,z)=>{const depth=clamp(z/max,0,1);return[400+x*(72-depth*35),485-depth*265,1-depth*.55];};
const [tx,ty,ts]=project(g.target.x,g.target.z);ellipse(c,tx,ty,48*ts,18*ts,g.phase==='success'?'#f1cd43aa':'#8aa36e33');c.save();c.setLineDash([5,6]);c.strokeStyle='#6f8e6b';c.lineWidth=2;c.beginPath();c.ellipse(tx,ty,48*ts,18*ts,0,0,PI*2);c.stroke();c.restore();
if(!preview){rr(c,tx-33,ty-151*ts,66,27,13,'#fffef2');c.fillStyle='#375443';c.font='bold 14px sans-serif';c.fillText(`${g.target.z} m`,tx,ty-133*ts);}
if(g.phase==='success'){chair(c,tx,ty,ts);person(c,tx,ty-7,ts,g.time,true);}else person(c,tx,ty-7,ts,g.time,false);
let [cx,cy,cs]=project(g.body.x,g.body.z);if(preview){cx=418;cy=482;cs=1.05;}if(g.phase!=='success')chair(c,cx,cy,cs,g.phase==='moving'?Math.sin(g.time*17)*.02:0);
if(g.phase==='aiming'&&g.aim){const dx=g.aim.dx,dy=g.aim.dy;c.save();c.setLineDash([5,7]);line(c,[[cx,cy-60],[cx+dx*.55,cy-70-dy*.65]],'#fff9d8',5);c.restore();}
if(preview){c.save();c.translate(530,295);c.rotate(-.12);rr(c,0,0,130,41,20,'#f6d54c');c.fillStyle='#26382c';c.font='bold 18px sans-serif';c.fillText('퇴근은 과학이다',65,27);c.restore();}}
road(c,g,preview){const st=STAGES[g.stage],night=g.stage===2;c.fillStyle=st.sky;c.fillRect(0,0,800,560);ellipse(c,650,82,34,34,night?'#ffedb2':'#fff5cb');if(night){for(let i=0;i<25;i++)ellipse(c,(i*97)%800,20+(i*31)%150,1.5,1.5,'#e5eed5');}
poly(c,[[0,190],[110,145],[245,198],[361,153],[515,202],[685,155],[800,187],[800,560],[0,560]],st.color);
if(g.stage===1){poly(c,[[0,230],[90,170],[154,235],[183,210],[300,560],[0,560]],'#c57e5e');poly(c,[[800,230],[720,170],[640,250],[540,560],[800,560]],'#bf755e');}
else{c.fillStyle=night?'#203a52':'#73b8bd';c.fillRect(0,305,800,255);for(let i=0;i<9;i++)line(c,[[0,330+i*28],[800,330+i*28]],night?'#49657830':'#d3eddd35',2);}
const z=preview?10:g.body.z,dist=STAGES[g.stage].length-z;
const endY=clamp(160+220/(1+Math.max(0,dist)*.028),180,410);
poly(c,[[290,endY+24],[509,endY+24],[730,560],[70,560]],night?'#394454':'#b7b7a1');
poly(c,[[290,endY],[509,endY],[700,560],[100,560]],night?'#4c5968':'#747e79');
poly(c,[[290,endY],[509,endY],[509,endY+24],[290,endY+24]],'#d7d1b5');
for(let i=0;i<11;i++){let a=((i*35+z*13)%400)/400;let y=190+a*370;if(y<endY+5)continue;let s=(y-145)/415;poly(c,[[398-3*s,y],[402+3*s,y],[405+3*s,y+20*s],[395-3*s,y+20*s]],'#f5d879');}
line(c,[[289,endY],[99,560]],'#ecdfb6',6);line(c,[[510,endY],[701,560]],'#ecdfb6',6);
for(let i=0;i<6;i++){let y=220+i*66;if(y<endY+12)continue;let s=(y-160)/400,x1=290-190*s,x2=510+190*s;line(c,[[x1,y],[x1,y-32*s]],'#dae2d3',5);line(c,[[x2,y],[x2,y-32*s]],'#dae2d3',5);}
line(c,[[290,endY-4],[509,endY-4]],'#f6d04d',8);
if(!preview){rr(c,344,endY-39,112,27,5,night?'#253c50':'#fff7db');c.fillStyle=night?'#f8e0a5':'#3b5148';c.font='bold 12px sans-serif';c.textAlign='center';c.fillText('여기서 멈추세요',400,endY-21);}
const fallen=g.phase==='result'&&!g.result?.ok,cy=fallen?480:454;this.car(c,400,cy,preview?1.08:1,fallen?-.26:0,night);
if(g.braking){line(c,[[361,470],[351,543]],'#26312e90',7);line(c,[[441,470],[453,543]],'#26312e90',7);}
if(preview){c.save();c.translate(478,271);c.rotate(-.1);rr(c,0,0,158,41,20,'#fff3d5');c.fillStyle='#3c514b';c.textAlign='center';c.font='bold 18px sans-serif';c.fillText('0.01m의 승부',79,27);c.restore();}}
car(c,x,y,s=1,rot=0,night=false){c.save();c.translate(x,y);c.scale(s,s);c.rotate(rot);ellipse(c,4,25,75,22,'#18323338');rr(c,-65,-43,18,56,6,'#273a3b');rr(c,47,-43,18,56,6,'#273a3b');poly(c,[[-56,-43],[49,-43],[60,19],[-61,19]],'#d96141');rr(c,-55,-44,109,52,10,'#f28b60');poly(c,[[-41,-87],[35,-87],[48,-40],[-49,-40]],'#ffd3a2');poly(c,[[-33,-79],[28,-79],[38,-45],[-40,-45]],night?'#69828d':'#87b9bb');line(c,[[0,-78],[0,-47]],'#c9d9c4',3);rr(c,-40,0,22,8,3,'#fff0ac');rr(c,20,0,22,8,3,'#fff0ac');rr(c,-55,15,109,11,4,'#f3be8d');rr(c,-15,16,30,9,2,'#fff8dc');ellipse(c,4,-112,17,19,'#fffbe1');ellipse(c,6,-129,7,7,'#e86f4b');poly(c,[[18,-114],[29,-109],[18,-105]],'#f0b743');ellipse(c,10,-115,2,2,'#334b44');c.restore();}
}
