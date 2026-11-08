(function(){
'use strict';
const $ = s => document.querySelector(s);
function fatal(msg){ const el=$('#err'); el.textContent=msg; el.hidden=false; }
var booting=false, bootDone=false, failedOnce=false, mode2d=false, ctxLost=false, renderer=null, lite=false;
var ERRS = (window.__mapleErrors = window.__mapleErrors || []);
window.addEventListener('error', e => { const m=(e && e.message) ? e.message : String(e); ERRS.push('window.error: '+m);
  if(!bootDone) failStart('script'); else fatal('오류가 발생했어요: ' + m); });

// ---------- WebGL diagnosis ----------
function probeWebGL(){
  const r={gl2:false, gl1:false, caveat:null, gpu:'', vendor:''};
  function lose(g){ try{ const x=g.getExtension('WEBGL_lose_context'); if(x) x.loseContext(); }catch(_){} }
  try{ const g=document.createElement('canvas').getContext('webgl2'); r.gl2=!!g; if(g) lose(g); }catch(_){}
  try{ const cv=document.createElement('canvas'); const g=cv.getContext('webgl')||cv.getContext('experimental-webgl'); r.gl1=!!g;
    if(g){ try{ const ext=g.getExtension('WEBGL_debug_renderer_info');
      r.gpu=String(ext?g.getParameter(ext.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER));
      r.vendor=String(ext?g.getParameter(ext.UNMASKED_VENDOR_WEBGL):g.getParameter(g.VENDOR)); }catch(_){} lose(g); } }catch(_){}
  if(r.gl1){ try{ const g=document.createElement('canvas').getContext('webgl',{failIfMajorPerformanceCaveat:true}); r.caveat=!g; if(g) lose(g); }catch(_){} }
  return r;
}
function diagText(p){
  return ['UA: '+navigator.userAgent,
    'WebGL2: '+(p.gl2?'있음':'없음')+' · WebGL1: '+(p.gl1?'있음':'없음')+' · 성능 경고: '+(p.caveat===null?'-':(p.caveat?'예(소프트웨어 렌더링 가능성)':'아니오')),
    'GPU: '+(p.gpu||'-')+(p.vendor?' / '+p.vendor:''),
    '화면: '+innerWidth+'×'+innerHeight+' @'+(window.devicePixelRatio||1)+' · iframe: '+(window.self!==window.top?'예':'아니오'),
    'Three.js: '+(window.THREE?THREE.REVISION:'로드 안 됨'),
    '오류:', ...(ERRS.length?ERRS.slice(-8):['(없음)'])].join('\n');
}
function hideDiag(){ const d=$('#diag'); if(d){ d.classList.add('hidden'); d.innerHTML=''; } }
function failStart(kind){
  booting=false; $('#retry3d').disabled=false;
  document.body.dataset.renderer='unavailable';
  failedOnce=true;
  let p={}; try{ p=probeWebGL(); }catch(_){}
  const go=$('#go'); if(go){ go.disabled=true; go.textContent='3D를 시작하지 못했어요'; }
  const sh=$('#slowhint'); if(sh) sh.classList.add('hidden');
  const st=$('#start'); if(st) st.classList.remove('hidden');
  const hasThree=!!window.THREE, noGL=!p.gl1 && !p.gl2;
  let title, body;
  if(kind==='three'){ title='3D 엔진 스크립트를 실행하지 못했어요'; body='파일이 일부만 열렸거나 이 앱이 스크립트를 막고 있을 수 있어요. 새로고침하거나 일반 브라우저에서 파일을 열어 보세요.'; }
  else if(kind==='lost'){ title='그래픽 연결(WebGL 컨텍스트)이 끊겼어요'; body='메모리 부족, 앱 전환, GPU 재시작 때문에 생길 수 있어요. 저사양 모드로 다시 시작하면 대개 해결돼요.'; }
  else if(noGL){ title='이 브라우저·앱에서는 WebGL을 쓸 수 없어요'; body='이 환경에서 WebGL 자체가 꺼져 있거나 지원되지 않아요. 하드웨어 가속이 꺼져 있거나, GPU가 차단 목록에 있거나, GPU 없는 원격·클라우드 브라우저나 일부 앱 내장 뷰어일 때 그래요. 이건 HTML을 고쳐서 켤 수 없어요. 하드웨어 가속을 켜거나 Chrome·Safari·Edge로 열어 주세요. 그동안 2D 지도 모드는 바로 쓸 수 있어요.'; }
  else if(kind==='script'){ title='스크립트 오류로 시작하지 못했어요'; body='아래 진단 정보를 복사해 전달해 주시면 원인을 바로 찾을 수 있어요.'; }
  else if(kind==='timeout'){ title='시작이 너무 오래 걸리고 있어요'; body='기기 성능이나 메모리가 부족할 수 있어요. 저사양 모드나 2D 지도 모드를 써 보세요.'; }
  else { title='WebGL은 감지됐지만 3D 초기화에 실패했어요'; body='안티앨리어싱 끄기, 저전력 GPU, WebGL1 등 여러 설정 조합으로 시도했지만 모두 실패했어요. 저사양 모드로 다시 시도하거나 2D 지도 모드를 써 보세요.'+(p.caveat?' 이 환경은 성능 경고 상태라 소프트웨어 렌더링일 수 있어요.':''); }
  const d=$('#diag'); if(!d) return;
  d.innerHTML=''; d.classList.remove('hidden');
  const t=document.createElement('b'); t.className='t'; t.textContent=title; d.appendChild(t);
  const b=document.createElement('div'); b.textContent=body; d.appendChild(b);
  const btns=document.createElement('div'); btns.className='btns'; d.appendChild(btns);
  const add=(label,hot,fn)=>{ const x=document.createElement('button'); x.className='btn2'+(hot?' hot':''); x.textContent=label; x.addEventListener('click',fn); btns.appendChild(x); };
  if(!hasThree){ add('새로고침', true, ()=>location.reload()); }
  else {
    if(noGL) add('2D 지도 모드로 보기', true, start2D);
    add('저사양 모드로 3D 다시 시도', !noGL, ()=>boot3D(true));
    add('기본 설정으로 3D 다시 시도', false, ()=>boot3D(false));
    if(!noGL) add('2D 지도 모드로 보기', false, start2D);
  }
  const txt=diagText(p);
  const pre=document.createElement('pre'); pre.textContent=txt;
  add('진단 정보 복사', false, ()=>{
    const done=()=>toast('진단 정보를 복사했어요');
    const fallback=()=>{ try{ const r=document.createRange(); r.selectNodeContents(pre); const s=getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('copy'); done(); }catch(_){ toast('아래 상자의 내용을 길게 눌러 복사해 주세요'); } };
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallback); else fallback();
  });
  d.appendChild(pre);
}
if(!window.THREE){ ERRS.push('THREE 전역 객체 없음'); failStart('three'); return; }

const V = THREE.Vector3;
const isMobile = (window.matchMedia && matchMedia('(pointer:coarse)').matches) || Math.min(innerWidth, innerHeight) < 600;
const G = 9.81;

// ---------- deterministic random + noise ----------
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const R = mulberry32(20261107);
const perm = new Uint8Array(512);
(function(){ const p=[]; for(let i=0;i<256;i++)p.push(i); for(let i=255;i>0;i--){const j=Math.floor(R()*(i+1)); const t=p[i];p[i]=p[j];p[j]=t;} for(let i=0;i<512;i++)perm[i]=p[i&255]; })();
function hash2(ix,iz){ return perm[(perm[ix&255]+iz)&255]/255; }
function vnoise(x,z){ const ix=Math.floor(x), iz=Math.floor(z), fx=x-ix, fz=z-iz;
  const ux=fx*fx*(3-2*fx), uz=fz*fz*(3-2*fz);
  const a=hash2(ix,iz), b=hash2(ix+1,iz), c=hash2(ix,iz+1), d=hash2(ix+1,iz+1);
  return a+(b-a)*ux+(c-a)*uz+(a-b-c+d)*ux*uz; }
function fbm(x,z){ let s=0,a=0.5,f=1; for(let i=0;i<4;i++){ s+=a*vnoise(x*f,z*f); f*=2; a*=0.5; } return s/0.9375; }
function smoothstep(a,b,x){ const t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); }
function hash3(a,b,c){ const s=Math.sin(a*127.1+b*311.7+c*74.7)*43758.5453; return s-Math.floor(s); }
function approach(v,target,maxDelta){ return v<target ? Math.min(target, v+maxDelta) : Math.max(target, v-maxDelta); }

// ---------- renderer / scene ----------
const stage = $('#stage');
let canvas = $('#c');
let pixelRatio = 1;
let contextLossHandler=null;
function freshCanvas(){
  const cv=document.createElement('canvas'); cv.id='c'; cv.tabIndex=0; cv.setAttribute('aria-label','3D 놀이공원');
  const old=$('#c'); if(old && old.parentNode) old.parentNode.replaceChild(cv, old); else stage.appendChild(cv);
  canvas=cv; return cv;
}
function disposeRenderer(){
  if(!renderer) return;
  const old=renderer; renderer=null;
  if(contextLossHandler) old.domElement.removeEventListener('webglcontextlost', contextLossHandler);
  contextLossHandler=null;
  try{ old.dispose(); }catch(_){}
  try{ old.forceContextLoss(); }catch(_){}
}
// Tries several context settings in turn; each attempt uses a fresh canvas because a canvas keeps its first context type.
function createRenderer(liteMode){
  disposeRenderer();
  const tries = liteMode
    ? [{aa:false,pp:'low-power',v:1,prec:'mediump'},{aa:false,pp:'default',v:1,prec:'highp'},{aa:false,pp:'default'}]
    : [{aa:true,pp:'high-performance'},{aa:false,pp:'default'},{aa:false,pp:'default',v:1},{aa:false,pp:'low-power',v:1,prec:'mediump'}];
  for(let k=0;k<tries.length;k++){
    const t=tries[k], cv=freshCanvas();
    try{
      const opts={canvas:cv, antialias:t.aa, powerPreference:t.pp, precision:t.prec||'highp', stencil:false};
      if(t.v===1){
        const attrs={antialias:t.aa, powerPreference:t.pp, stencil:false, depth:true, alpha:false};
        const ctx=cv.getContext('webgl',attrs)||cv.getContext('experimental-webgl',attrs);
        if(!ctx) throw new Error('WebGL1 컨텍스트를 만들 수 없음');
        opts.context=ctx;
      }
      renderer=new THREE.WebGLRenderer(opts);
      lite = !!liteMode || k>=2;
      pixelRatio = lite ? 1 : Math.min(window.devicePixelRatio||1, isMobile?1.5:2);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(innerWidth, innerHeight);
      renderer.shadowMap.enabled = !lite;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      contextLossHandler=e=>{
        if(cv!==canvas || mode2d || !renderer || renderer.domElement!==cv) return;
        e.preventDefault(); ctxLost=true; ERRS.push('webglcontextlost'); failStart('lost');
      };
      cv.addEventListener('webglcontextlost', contextLossHandler, false);
      ERRS.push('3D 시작 성공: '+(t.v===1?'webgl1':(renderer.capabilities.isWebGL2?'webgl2':'webgl1'))+', aa='+t.aa+', '+t.pp+(lite?' (저사양)':''));
      return true;
    }catch(e){
      ERRS.push('['+(t.v===1?'webgl1':'auto')+', aa='+t.aa+', '+t.pp+'] '+((e&&e.message)||e));
      disposeRenderer();
    }
  }
  return false;
}

const scene = new THREE.Scene();
const FOG = new THREE.Color(0xfbcfa6);
scene.fog = new THREE.Fog(FOG, 130, 470);
const camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.1, 1600);
camera.position.set(110, 70, 110);

const sunDir = new V(-0.62, 0.52, 0.58).normalize();
scene.add(new THREE.HemisphereLight(0xffe6c8, 0x8c5c78, 0.62));
scene.add(new THREE.AmbientLight(0xffffff, 0.10));
const sun = new THREE.DirectionalLight(0xffd29c, 1.05);
sun.position.copy(sunDir).multiplyScalar(160);
sun.castShadow = true;
const SM = isMobile ? 1024 : 2048;
sun.shadow.mapSize.set(SM, SM);
Object.assign(sun.shadow.camera, {left:-78,right:78,top:78,bottom:-78,near:20,far:360});
sun.shadow.bias = -0.0007;
sun.shadow.normalBias = 0.04;
scene.add(sun); scene.add(sun.target);

// sky dome
const skyMat = new THREE.ShaderMaterial({
  uniforms:{ sunDir:{value:sunDir} },
  vertexShader:'varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader:[
    'varying vec3 vDir; uniform vec3 sunDir;',
    'void main(){',
    ' vec3 d=normalize(vDir); float h=d.y;',
    ' vec3 top=vec3(0.36,0.55,0.84); vec3 hor=vec3(0.985,0.81,0.65); vec3 low=vec3(0.88,0.70,0.78); vec3 band=vec3(1.0,0.66,0.46);',
    ' vec3 c = h>0.0 ? mix(hor, top, smoothstep(0.0,0.6,h)) : mix(hor, low, smoothstep(0.0,-0.45,h));',
    ' c = mix(c, band, (1.0-smoothstep(0.0,0.16,abs(h-0.05)))*0.35);',
    ' float s=max(dot(d,normalize(sunDir)),0.0);',
    ' c += vec3(1.0,0.72,0.42)*pow(s,7.0)*0.32 + vec3(1.0,0.93,0.78)*pow(s,500.0)*1.4;',
    ' gl_FragColor=vec4(c,1.0);',
    '}'].join('\n'),
  side:THREE.BackSide, depthWrite:false, fog:false
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyMat);
sky.renderOrder = -10; sky.frustumCulled = false;
scene.add(sky);

const BOX = new THREE.BoxGeometry(1,1,1);
const CYL = new THREE.CylinderGeometry(1,1,1,8);
const BULB = new THREE.SphereGeometry(1,8,6);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new V(), _p = new V(), _v = new V(), _v2=new V();
const UPY = new V(0,1,0);
function std(color, o){ return new THREE.MeshStandardMaterial(Object.assign({color, roughness:0.85, metalness:0}, o||{})); }
function instanced(geo, mat, count, opts){
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1,count));
  m.frustumCulled = false;
  m.castShadow = !(opts && opts.noShadow);
  m.receiveShadow = !(opts && opts.noReceive);
  return m;
}
function beamMatrix(a, b, r, m, box){
  _v.subVectors(b, a); const len = Math.max(0.001, _v.length()); _v.multiplyScalar(1/len);
  _q.setFromUnitVectors(UPY, _v);
  _p.addVectors(a, b).multiplyScalar(0.5);
  if(box) _s.set(r*2, len, r*2); else _s.set(r, len, r);
  return m.compose(_p, _q, _s);
}

// ---------- coaster layouts (plan x, plan z, height y) ----------
function loopPts(cx, z0, zoff, rx, ry, baseY, n){
  const out=[];
  for(let k=0;k<=n;k++){ const f=k/n*Math.PI*2;
    out.push([cx - rx*Math.sin(f), z0 + zoff*(1-Math.cos(f/2))/2, baseY + ry - ry*Math.cos(f)]); }
  return out;
}
function helixPts(cx, cz, r, a0deg, turnsDeg, y0, y1, stepDeg){
  const out=[]; const n=Math.round(Math.abs(turnsDeg)/stepDeg);
  for(let k=0;k<=n;k++){ const a=(a0deg + turnsDeg*k/n)*Math.PI/180;
    out.push([cx + r*Math.cos(a), cz + r*Math.sin(a), y0 + (y1-y0)*k/n]); }
  return out;
}
const A_PTS = [
  [-30,-12,3.4],[-20,-12,3.4],[-10,-12,3.6],[-1,-15,5],[3,-22,7],[1,-30,11],[-5,-36,17],[-12,-41,25],
  [-19,-45,32],[-25,-47,34],[-31,-47,31],[-37,-44,20],[-40,-38,7],[-38,-32,4.5],[-31,-30,10],[-24,-31,18],
  [-17,-33,11],[-10,-32,15],[-6.5,-27.5,19],[-10,-22.5,18],[-18,-24,15],[-26,-24,12],[-32,-23.5,12.5]
].concat(helixPts(-38,-17.5,6,-90,-540,12.5,4.2,30).slice(0));
const B_PTS = [
  [26,18,3.4],[26,10,3.4],[26,3,3.8],[26,-4,8],[26,-11,15],[26,-17,21.5],[27.5,-22,24],[30.5,-27,19],
  [35,-31,8],[41,-30,6],[44,-24,11],[44,-16,15],[44,-8,6],[44,0,12],[44,8,5],[44,16,9.5],[43,24,5],
  [40,31,6],[33,35,7],[27.5,32,5.5],[25.5,26,4]
];
const C_PTS = [[10,16,3.4],[2,16,3.4],[-4,16,3.4],[-14,16,3.4]]
  .concat(loopPts(-24,16,4.5,7.5,10,3.4,12))
  .concat([[-36,20.5,3.5],[-43,26,7],[-42,34,13],[-36,40.5,21],[-27,43.5,27],[-19,44.5,25],[-12,44.5,12],
    [-6,44,4.8],[2,42,5],[10,39,11],[16,33,9],[18.5,26,6],[18.5,20,4.5],[15.5,16.6,3.8]]);

const DEFS = [
  { name:'엠버 드롭', en:'EMBER DROP', tag:'34m 체인 리프트 · 급강하 · 헬릭스', color:'#e2382d', spine:'#a3202a', tie:'#4a2620',
    support:'#f3ece2', style:'steel', bank:5, type:'chain', liftSpeed:5, stationSpeed:3.5, roll:0.12, drag:0.0026, cars:5,
    pts:A_PTS, Lst:10, brakeLen:10, trims:[[20,21,11]] },
  { name:'메이플 호퍼', en:'MAPLE HOPPER', tag:'우든 코스터 · 연속 에어타임 언덕', color:'#f2a91a', spine:'#7b4a22', tie:'#6e4321',
    support:'#ead8b2', style:'wood', bank:3.2, type:'chain', liftSpeed:4.5, stationSpeed:3.5, roll:0.14, drag:0.0028, cars:5,
    pts:B_PTS, Lst:8, brakeLen:10, trims:[] },
  { name:'오로라 루프', en:'AURORA LOOP', tag:'발사형 0→94km/h · 수직 루프', color:'#16b8b0', spine:'#6a3fc4', tie:'#2e2850',
    support:'#3b3652', style:'steel', bank:5, type:'launch', launchSpeed:26, launchAccel:18, launchLen:16, stationSpeed:3.5,
    roll:0.1, drag:0.0012, cars:4, pts:C_PTS, Lst:8, brakeLen:10, trims:[] }
];

// ---------- build coaster paths ----------
function smoothVecs(arr, win, passes){
  const n=arr.length; let a=arr;
  for(let p=0;p<passes;p++){ const out=new Array(n);
    for(let i=0;i<n;i++){ const v=new V(); for(let k=-win;k<=win;k++) v.add(a[(i+k+n)%n]); out[i]=v.multiplyScalar(1/(2*win+1)); }
    a=out; }
  return a;
}
function buildPath(def){
  const pts = def.pts.map(p => new V(p[0], p[2], p[1]));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
  curve.arcLengthDivisions = 8000;
  const L = curve.getLength();
  const n = Math.round(L/0.5), ds = L/n;
  const P = curve.getSpacedPoints(n); P.pop();
  const T = new Array(n);
  for(let i=0;i<n;i++) T[i] = new V().subVectors(P[(i+1)%n], P[(i-1+n)%n]).normalize();
  let K = new Array(n);
  for(let i=0;i<n;i++) K[i] = new V().subVectors(T[(i+1)%n], T[(i-1+n)%n]).multiplyScalar(1/(2*ds));
  K = smoothVecs(K, 2, 2);
  const kh = smoothVecs(K.map(k => new V(k.x,0,k.z)), 6, 3);
  function desired(i){
    const t=T[i]; const d=new V(0,1,0).addScaledVector(t,-t.y);
    if(d.lengthSq()<1e-4) return null; d.normalize();
    const b=kh[i].clone().multiplyScalar(def.bank); if(b.length()>1.15) b.setLength(1.15);
    d.add(b); d.addScaledVector(t,-d.dot(t)); return d.normalize();
  }
  let U = new Array(n);
  let u = desired(0) || new V(0,1,0);
  for(let pass=0;pass<3;pass++){
    for(let i=0;i<n;i++){
      const t=T[i]; u.addScaledVector(t,-u.dot(t)).normalize();
      const d=desired(i);
      if(d && u.y>0.15 && Math.abs(t.y)<0.93){ u.lerp(d,0.22); u.addScaledVector(t,-u.dot(t)).normalize(); }
      U[i]=u.clone();
    }
  }
  for(let p=0;p<3;p++){
    const nu=new Array(n);
    for(let i=0;i<n;i++){ const v=new V().copy(U[(i-1+n)%n]).add(U[i]).add(U[i]).add(U[(i+1)%n]);
      v.addScaledVector(T[i],-v.dot(T[i])).normalize(); nu[i]=v; }
    U=nu;
  }
  const B = new Array(n);
  for(let i=0;i<n;i++) B[i] = new V().crossVectors(U[i], T[i]).normalize();
  // stats
  let maxY=-1e9, iTop=0; const ctr=new V();
  for(let i=0;i<n;i++){ if(P[i].y>maxY){maxY=P[i].y; iTop=i;} ctr.add(P[i]); }
  ctr.multiplyScalar(1/n);
  let rad=0; for(let i=0;i<n;i++) rad=Math.max(rad, Math.hypot(P[i].x-ctr.x, P[i].z-ctr.z));
  function nearestS(p){ const q=new V(p[0],p[2],p[1]); let best=1e9, bi=0; for(let i=0;i<n;i++){ const d=P[i].distanceToSquared(q); if(d<best){best=d;bi=i;} } return bi*ds; }
  const trims = def.trims.map(t => ({a:nearestS(def.pts[t[0]]), b:nearestS(def.pts[t[1]]), speed:t[2]}));
  return {def, P, T, U, B, K, n, ds, L, Lst:def.Lst, sTop:iTop*ds, maxY, center:ctr, radius:rad, trims};
}
const coasters = [];

// ---------- spatial grid of track samples ----------
const TG = new Map(), TGC = 4;
function tgKey(ix,iz){ return (ix+512)*2048 + (iz+512); }
function tgBuild(){
  coasters.forEach((c,ci) => { for(let i=0;i<c.n;i++){ const p=c.P[i]; const k=tgKey(Math.floor(p.x/TGC), Math.floor(p.z/TGC));
    let a=TG.get(k); if(!a){a=[];TG.set(k,a);} a.push(p.x,p.y,p.z,ci,i); } });
}
function tgEach(x,z,rad,fn){
  const r=Math.ceil(rad/TGC), cx=Math.floor(x/TGC), cz=Math.floor(z/TGC), r2=rad*rad;
  for(let dx=-r;dx<=r;dx++) for(let dz=-r;dz<=r;dz++){
    const a=TG.get(tgKey(cx+dx,cz+dz)); if(!a) continue;
    for(let j=0;j<a.length;j+=5){ const ex=a[j]-x, ez=a[j+2]-z; if(ex*ex+ez*ez<r2) fn(a[j+1],a[j+3],a[j+4]); }
  }
}
function minTrackY(x,z,rad){ let m=Infinity; tgEach(x,z,rad,(y)=>{ if(y<m) m=y; }); return m; }
function blocked(x,z,topY,ci,i,rad){
  let hit=false;
  tgEach(x,z,rad,(y,cj,j)=>{
    if(hit) return;
    if(cj===ci){ const n=coasters[ci].n; let d=Math.abs(j-i); d=Math.min(d,n-d); if(d<16) return; }
    if(y < topY-0.4) hit=true;
  });
  return hit;
}

// ---------- park layout ----------
const POND = {x:14, z:-38, r:6.5};
const FERRIS = {x:-42, z:-1};
const PATHS = [
  [[0,0],[-20,-8.5]], [[0,0],[22.5,14]], [[0,0],[6,13]], [[0,0],[-34,-1]],
  [[0,0],[12,-22],[14,-31]], [[0,0],[-6,24],[-14,30]]
];
const ZONES = [{x:0,z:0,r:10},{x:FERRIS.x,z:FERRIS.z,r:10.5},{x:POND.x,z:POND.z,r:9}];
function segDist(px,pz,ax,az,bx,bz){ const dx=bx-ax, dz=bz-az, l2=dx*dx+dz*dz;
  let t=l2?((px-ax)*dx+(pz-az)*dz)/l2:0; t=Math.max(0,Math.min(1,t)); return Math.hypot(px-ax-t*dx, pz-az-t*dz); }
function pathDist(x,z){ let d=1e9; for(const p of PATHS) for(let i=0;i<p.length-1;i++) d=Math.min(d, segDist(x,z,p[i][0],p[i][1],p[i+1][0],p[i+1][1])); return d; }
function inZone(x,z,pad){ for(const zn of ZONES) if(Math.hypot(x-zn.x,z-zn.z) < zn.r+(pad||0)) return true; return false; }

// ---------- voxel island ----------
const S=2, NB=34, W=NB*2;
const topL = new Int16Array(W*W).fill(-99), botL = new Int16Array(W*W), colType = new Uint8Array(W*W);
function colId(ix,iz){ return (ix+NB)*W + (iz+NB); }
function groundY(x,z){
  const ix=Math.floor(x/S), iz=Math.floor(z/S);
  if(ix<-NB||ix>=NB||iz<-NB||iz>=NB) return null;
  const t=topL[colId(ix,iz)]; return t===-99 ? null : t*S;
}
function solid(ix,j,iz){
  if(ix<-NB||ix>=NB||iz<-NB||iz>=NB) return false;
  const id=colId(ix,iz), t=topL[id];
  return t!==-99 && j<=t && j>botL[id];
}
function buildIsland(){
  for(let ix=-NB; ix<NB; ix++) for(let iz=-NB; iz<NB; iz++){
    const cx=(ix+0.5)*S, cz=(iz+0.5)*S, r=Math.hypot(cx,cz), ang=Math.atan2(cz,cx);
    const e = Math.max(59, 63 + (fbm(Math.cos(ang)*1.7+11, Math.sin(ang)*1.7+3)-0.5)*14);
    if(r>e) continue;
    const id=colId(ix,iz);
    let L=1, type=0;
    if(r<10) type=2; else if(pathDist(cx,cz)<2.1) type=1;
    if(Math.hypot(cx-POND.x, cz-POND.z) < POND.r){ L=0; type=3; }
    else if(type===0 && !inZone(cx,cz,0)){
      const h=fbm(cx*0.04+3.1, cz*0.04+7.7);
      const lift=Math.floor(Math.max(0,h-0.47)*10*smoothstep(28,50,r));
      L = 1 + Math.min(3, lift);
      const my=minTrackY(cx,cz,3.8);
      if(my<Infinity) L=Math.min(L, Math.max(1, Math.floor((my-1.3)/S)));
    }
    const depth = 2 + Math.floor(Math.pow(Math.max(0,1-r/e),0.7)*17 + fbm(cx*0.09+1, cz*0.09+9)*6);
    topL[id]=L; botL[id]=L-depth; colType[id]=type;
  }
  const FACES=[{d:[1,0,0],c:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]]},{d:[-1,0,0],c:[[0,0,0],[0,0,1],[0,1,1],[0,1,0]]},
    {d:[0,1,0],c:[[0,1,0],[0,1,1],[1,1,1],[1,1,0]]},{d:[0,-1,0],c:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]]},
    {d:[0,0,1],c:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]]},{d:[0,0,-1],c:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]]}];
  for(const f of FACES){ const a=f.c[0],b=f.c[1],c=f.c[2];
    const e1=[b[0]-a[0],b[1]-a[1],b[2]-a[2]], e2=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
    const cr=[e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]];
    if(cr[0]*f.d[0]+cr[1]*f.d[1]+cr[2]*f.d[2] < 0) f.c.reverse(); }
  const C = h => new THREE.Color(h);
  const grassA=C('#93a43a'), grassB=C('#b6a841'), litter=C('#cc8a33'), grassC=C('#7e963f');
  const grassSide=C('#8a7438'), dirt=C('#8b5a35'), dirt2=C('#7a4e31'), rockA=C('#94847a'), rockB=C('#574b56');
  const pathC=C('#dcc79e'), plazaA=C('#d8cab6'), plazaB=C('#c6b59f'), pondC=C('#5f6a58'), tmp=new THREE.Color();
  const pos=[], nor=[], col=[], idx=[];
  let vc=0;
  for(let ix=-NB; ix<NB; ix++) for(let iz=-NB; iz<NB; iz++){
    const id=colId(ix,iz), t=topL[id]; if(t===-99) continue;
    const type=colType[id];
    for(let j=botL[id]+1; j<=t; j++){
      for(const f of FACES){
        if(solid(ix+f.d[0], j+f.d[1], iz+f.d[2])) continue;
        const dft=t-j;
        if(dft===0){
          if(f.d[1]===1){
            if(type===1) tmp.copy(pathC);
            else if(type===2) tmp.copy(((ix+iz)&1)?plazaA:plazaB);
            else if(type===3) tmp.copy(pondC);
            else { const nz=fbm(ix*0.22+5, iz*0.22+2); tmp.copy(grassA).lerp(grassB, smoothstep(0.35,0.7,nz));
              const lt=fbm(ix*0.4+20, iz*0.4+1); if(lt>0.6) tmp.lerp(litter, smoothstep(0.6,0.78,lt)*0.85);
              if(nz<0.3) tmp.lerp(grassC,0.6); }
          } else if(f.d[1]===-1) tmp.copy(rockB);
          else tmp.copy(type===0?grassSide:(type===3?dirt:pathC)).multiplyScalar(type===0?1:0.85);
        } else if(dft<=2) tmp.copy(dft===1?dirt:dirt2);
        else { tmp.copy(rockA).lerp(rockB, Math.min(1,(dft-3)/14)); }
        if(f.d[1]===-1 && dft!==0) tmp.multiplyScalar(0.72);
        const jit = 0.93 + hash3(ix,j,iz)*0.12; tmp.multiplyScalar(jit);
        for(const c of f.c){ pos.push((ix+c[0])*S, (j-1+c[1])*S, (iz+c[2])*S); nor.push(f.d[0],f.d[1],f.d[2]); col.push(tmp.r,tmp.g,tmp.b); }
        idx.push(vc,vc+1,vc+2, vc,vc+2,vc+3); vc+=4;
      }
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col,3));
  g.setIndex(idx);
  const mesh=new THREE.Mesh(g, new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.95, metalness:0}));
  mesh.castShadow=true; mesh.receiveShadow=true; scene.add(mesh);
  // pond water
  const wp=[], wi=[]; let wv=0;
  for(let ix=-NB; ix<NB; ix++) for(let iz=-NB; iz<NB; iz++){ if(colType[colId(ix,iz)]!==3 || topL[colId(ix,iz)]===-99) continue;
    for(const c of FACES[2].c) wp.push((ix+c[0])*S, 1.45, (iz+c[2])*S);
    wi.push(wv,wv+1,wv+2, wv,wv+2,wv+3); wv+=4; }
  if(wv){ const wg=new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp,3)); wg.setIndex(wi); wg.computeVertexNormals();
    const water=new THREE.Mesh(wg, new THREE.MeshStandardMaterial({color:0x4fa6c8, roughness:0.15, metalness:0.1, transparent:true, opacity:0.82, emissive:0x1a4a66, emissiveIntensity:0.25}));
    water.receiveShadow=true; scene.add(water); }
}

// ---------- track geometry ----------
function tubeGeo(c, ox, oy, r, seg, rot0){
  const n=c.n, pos=new Float32Array(n*seg*3), nor=new Float32Array(n*seg*3), idx=[];
  const ctr=new V(), dir=new V();
  for(let i=0;i<n;i++){
    const P=c.P[i], U=c.U[i], B=c.B[i];
    ctr.copy(P).addScaledVector(B,ox).addScaledVector(U,oy);
    for(let k=0;k<seg;k++){
      const a=rot0 + k/seg*Math.PI*2;
      dir.set(0,0,0).addScaledVector(B,Math.cos(a)).addScaledVector(U,Math.sin(a));
      const o=(i*seg+k)*3;
      pos[o]=ctr.x+dir.x*r; pos[o+1]=ctr.y+dir.y*r; pos[o+2]=ctr.z+dir.z*r;
      nor[o]=dir.x; nor[o+1]=dir.y; nor[o+2]=dir.z;
    }
  }
  for(let i=0;i<n;i++){ const i2=(i+1)%n; for(let k=0;k<seg;k++){ const k2=(k+1)%seg;
    const a=i*seg+k, b=i2*seg+k, cc=i2*seg+k2, d=i*seg+k2; idx.push(a,d,b, b,d,cc); } }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos,3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor,3));
  g.setIndex(idx);
  return g;
}
function buildTrack(c){
  const d=c.def;
  const railMat=std(d.color,{roughness:0.38, metalness:0.35, side:THREE.DoubleSide});
  const spineMat=std(d.style==='wood'?d.tie:d.spine,{roughness:0.5, metalness:d.style==='wood'?0:0.3, side:THREE.DoubleSide});
  const add=(g,m)=>{ const mesh=new THREE.Mesh(g,m); mesh.castShadow=true; mesh.receiveShadow=true; scene.add(mesh); };
  add(tubeGeo(c, 0.6, 0, 0.1, 6, 0), railMat);
  add(tubeGeo(c,-0.6, 0, 0.1, 6, 0), railMat);
  if(d.style==='wood'){
    add(tubeGeo(c, 0.62,-0.24,0.16,4,Math.PI/4), spineMat);
    add(tubeGeo(c,-0.62,-0.24,0.16,4,Math.PI/4), spineMat);
  } else {
    add(tubeGeo(c, 0,-0.48,0.22,8,0), spineMat);
  }
  const step = 2, cnt=Math.floor(c.n/step);
  const tieMat=std(d.tie,{roughness:0.7});
  const ties=instanced(BOX, tieMat, cnt), webs=d.style==='wood'?null:instanced(BOX, spineMat, cnt);
  let k=0;
  for(let i=0;i<c.n;i+=step){ if(k>=cnt) break;
    _m.makeBasis(c.B[i], c.U[i], c.T[i]);
    if(d.style==='wood'){ _m.scale(_s.set(1.75,0.12,0.34)); _p.copy(c.P[i]).addScaledVector(c.U[i],-0.13); }
    else { _m.scale(_s.set(1.4,0.1,0.2)); _p.copy(c.P[i]).addScaledVector(c.U[i],-0.1); }
    _m.setPosition(_p); ties.setMatrixAt(k,_m);
    if(webs){ _m.makeBasis(c.B[i], c.U[i], c.T[i]); _m.scale(_s.set(0.14,0.42,0.14)); _p.copy(c.P[i]).addScaledVector(c.U[i],-0.3); _m.setPosition(_p); webs.setMatrixAt(k,_m); }
    k++;
  }
  ties.count=k; scene.add(ties); if(webs){ webs.count=k; scene.add(webs); }
}

// ---------- supports ----------
function buildSupports(c, ci){
  const d=c.def, beams=[], foots=[];
  const wood=d.style==='wood', step=wood?6:9;
  for(let i=0;i<c.n;i+=step){
    const p=c.P[i], u=c.U[i], t=c.T[i];
    const sH=new V(-t.z,0,t.x); if(sH.lengthSq()<1e-6) sH.set(1,0,0); sH.normalize();
    if(u.y>0.45){
      const top=p.clone().addScaledVector(u, wood?-0.3:-0.62);
      if(wood){ woodBent(ci, i, top, sH, beams); continue; }
      for(const off of [0,1.9,-1.9,3,-3]){
        const bx=top.x+sH.x*off, bz=top.z+sH.z*off, gy=groundY(bx,bz);
        if(gy===null) continue;
        const h=top.y-gy; if(h<0.7) break;
        if(blocked(bx,bz,top.y,ci,i,1.15)) continue;
        const colTop=new V(bx, top.y-(off?0.25:0), bz);
        if(h>12 && off===0){
          const spread=Math.min(h*0.17,4.2);
          for(const sg of [1,-1]){ const fx=bx+sH.x*spread*sg, fz=bz+sH.z*spread*sg, fgy=groundY(fx,fz);
            if(fgy===null) continue; beams.push([new V(fx,fgy,fz), colTop.clone(), 0.26]); foots.push([fx,fgy,fz]); }
          const midY=gy+h*0.42, sp=spread*0.58;
          beams.push([new V(bx+sH.x*sp,midY,bz+sH.z*sp), new V(bx-sH.x*sp,midY,bz-sH.z*sp), 0.13]);
        } else { beams.push([new V(bx,gy,bz), colTop.clone(), h>6?0.32:0.26]); foots.push([bx,gy,bz]); }
        if(off!==0) beams.push([colTop.clone(), top.clone(), 0.15]);
        break;
      }
    } else {
      const bH=new V(c.B[i].x,0,c.B[i].z); if(bH.lengthSq()<0.05) bH.copy(sH); bH.normalize();
      let done=false;
      for(const off of [2.4,3.6,4.6]){ if(done) break;
        for(const sg of [1,-1]){
          const bx=p.x+bH.x*off*sg, bz=p.z+bH.z*off*sg, gy=groundY(bx,bz);
          if(gy===null) continue;
          if(p.y-gy<1.2){ done=true; break; }
          if(blocked(bx,bz,p.y+0.6,ci,i,1.1)) continue;
          beams.push([new V(bx,gy,bz), new V(bx,p.y,bz), 0.3]); foots.push([bx,gy,bz]);
          beams.push([new V(bx,p.y,bz), p.clone().addScaledVector(u,-0.48), 0.16]);
          done=true; break;
        }
      }
    }
  }
  const mat=std(d.support,{roughness:wood?0.9:0.55, metalness:wood?0:0.2});
  const im=instanced(wood?BOX:CYL, mat, beams.length);
  beams.forEach((b,k)=> im.setMatrixAt(k, beamMatrix(b[0],b[1],b[2],_m,wood)));
  im.count=beams.length; scene.add(im);
  if(foots.length){
    const fm=instanced(BOX, std('#b9ada0'), foots.length);
    foots.forEach((f,k)=>{ _m.compose(_p.set(f[0],f[1]+0.15,f[2]), _q.identity(), _s.set(1.0,0.4,1.0)); fm.setMatrixAt(k,_m); });
    scene.add(fm);
  }
}
function woodBent(ci, i, top, sH, beams){
  const gy0=groundY(top.x,top.z); if(gy0===null) return;
  const h=top.y-gy0; if(h<0.6) return;
  const w=0.95+h*0.07;
  if(blocked(top.x,top.z,top.y,ci,i,w+0.35)) return;
  const lx=top.x+sH.x*w, lz=top.z+sH.z*w, rx=top.x-sH.x*w, rz=top.z-sH.z*w;
  let lg=groundY(lx,lz), rg=groundY(rx,rz); if(lg===null) lg=gy0; if(rg===null) rg=gy0;
  const tl=new V(top.x+sH.x*0.78, top.y, top.z+sH.z*0.78), tr=new V(top.x-sH.x*0.78, top.y, top.z-sH.z*0.78);
  const bl=new V(lx,lg,lz), br=new V(rx,rg,rz);
  beams.push([bl, tl, 0.13], [br, tr, 0.13], [tl.clone(), tr.clone(), 0.1]);
  let flip=false;
  for(let y=gy0+2.4; y<top.y-0.7; y+=2.7){
    const a=new V().lerpVectors(bl, tl, (y-lg)/Math.max(0.1,tl.y-lg));
    const b=new V().lerpVectors(br, tr, (y-rg)/Math.max(0.1,tr.y-rg));
    beams.push([a, b, 0.08]);
    const y2=Math.min(y+2.7, top.y);
    const a2=new V().lerpVectors(bl, tl, (y2-lg)/Math.max(0.1,tl.y-lg));
    const b2=new V().lerpVectors(br, tr, (y2-rg)/Math.max(0.1,tr.y-rg));
    beams.push(flip?[a, b2, 0.06]:[b, a2, 0.06]); flip=!flip;
  }
}

// ---------- text / pattern textures ----------
function signTex(text, color){
  const cv=document.createElement('canvas'); cv.width=512; cv.height=128; const g=cv.getContext('2d');
  g.fillStyle='#2a1a12'; g.fillRect(0,0,512,128);
  g.fillStyle=color; g.fillRect(0,0,512,14); g.fillRect(0,114,512,14);
  g.fillStyle='#fff6e6'; g.font='bold 58px system-ui, Arial, sans-serif'; g.textAlign='center'; g.textBaseline='middle';
  g.fillText(text, 256, 66);
  const t=new THREE.CanvasTexture(cv); t.anisotropy=4; return t;
}
function stripeTex(c1, c2, n, vertical){
  const cv=document.createElement('canvas'); cv.width=vertical?256:16; cv.height=vertical?16:256; const g=cv.getContext('2d');
  for(let i=0;i<n;i++){ g.fillStyle=i%2?c2:c1; if(vertical) g.fillRect(i*256/n,0,256/n+1,16); else g.fillRect(0,i*256/n,16,256/n+1); }
  return new THREE.CanvasTexture(cv);
}
const bulbMat = new THREE.MeshBasicMaterial({color:0xffe7a8});

// ---------- stations ----------
function buildStation(c){
  const d=c.def, nSt=Math.round(c.Lst/c.ds), mid=c.P[Math.floor(nSt/2)], t=c.T[Math.floor(nSt/2)];
  const sH=new V(-t.z,0,t.x).normalize(); if(sH.dot(new V(-mid.x,0,-mid.z))<0) sH.negate();
  const ang=Math.atan2(t.x,t.z);
  const grp=new THREE.Group(); grp.position.set(mid.x, 2, mid.z); grp.rotation.y=ang; scene.add(grp);
  const len=c.Lst+4;
  // local x axis = sH direction?  local +x after rotation = (cos ang, 0, -sin ang)
  const lx=new V(Math.cos(ang),0,-Math.sin(ang)); const side = lx.dot(sH)>0?1:-1;
  const plat=new THREE.Mesh(BOX, std('#cdbfa8')); plat.scale.set(2.6,1.15,len); plat.position.set(side*2.15,0.57,0);
  plat.castShadow=plat.receiveShadow=true; grp.add(plat);
  const railH=c.P[Math.floor(nSt/2)].y-2;
  const roofMat=std(d.color,{roughness:0.6});
  const roof=new THREE.Mesh(BOX, roofMat); roof.scale.set(5.8,0.35,len+1); roof.position.set(side*1.1, railH+3.9, 0);
  roof.castShadow=true; grp.add(roof);
  const trim=new THREE.Mesh(BOX, std('#fff3dc')); trim.scale.set(6.0,0.18,len+1.2); trim.position.set(side*1.1, railH+3.65, 0); grp.add(trim);
  const ridge=new THREE.Mesh(BOX, std(d.spine)); ridge.scale.set(2.2,0.5,len+0.6); ridge.position.set(side*1.1, railH+4.3, 0); ridge.castShadow=true; grp.add(ridge);
  const postMat=std('#4a3226');
  for(const sx of [side*3.6, -side*1.25]) for(const sz of [-len/2+0.6, 0, len/2-0.6]){
    const p=new THREE.Mesh(BOX, postMat); const ph=railH+3.7; p.scale.set(0.25,ph,0.25); p.position.set(sx, ph/2, sz); p.castShadow=true; grp.add(p); }
  const tex=signTex(d.en, d.color);
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(6,1.5), new THREE.MeshBasicMaterial({map:tex, side:THREE.DoubleSide}));
  sign.position.set(side*1.1, railH+5.3, 0); sign.rotation.y=Math.PI/2; grp.add(sign);
  const bulbs=instanced(BULB, bulbMat, 16, {noShadow:true});
  for(let k=0;k<16;k++){ const z=-len/2+0.5+(len-1)*k/15; _m.compose(_p.set(side*1.1+side*2.95, railH+3.55, z), _q.identity(), _s.set(0.09,0.09,0.09)); bulbs.setMatrixAt(k,_m); }
  grp.add(bulbs);
  ZONES.push({x:mid.x+sH.x*2.2, z:mid.z+sH.z*2.2, r:Math.max(4,len/2)});
}

// ---------- carousel ----------
const anim = {carousel:null, horses:[], wheel:null, gondolas:[], balloons:[], rocks:[], clouds:null};
function buildCarousel(){
  const g=new THREE.Group(); g.position.set(0,2,0); scene.add(g);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(5.4,5.7,0.6,24), std('#b9a58c')); base.position.y=0.3; base.receiveShadow=true; base.castShadow=true; g.add(base);
  const rot=new THREE.Group(); rot.position.y=0.6; g.add(rot); anim.carousel=rot;
  const deck=new THREE.Mesh(new THREE.CylinderGeometry(5,5,0.18,24), std('#8a3b25')); deck.position.y=0.09; deck.receiveShadow=true; rot.add(deck);
  const core=new THREE.Mesh(new THREE.CylinderGeometry(0.9,0.9,4,12), std('#f2c14e',{metalness:0.3,roughness:0.4})); core.position.y=2; rot.add(core);
  let cg=new THREE.ConeGeometry(5.9,2.6,16,1).toNonIndexed();
  const pa=cg.attributes.position, colArr=new Float32Array(pa.count*3), c1=new THREE.Color('#d9381e'), c2=new THREE.Color('#fff1d6');
  for(let tI=0;tI<pa.count;tI+=3){ let cx=0,cz=0; for(let q=0;q<3;q++){cx+=pa.getX(tI+q); cz+=pa.getZ(tI+q);}
    const a=Math.atan2(cz,cx), si=Math.floor((a+Math.PI)/(Math.PI*2)*16)%2, cc=si?c1:c2;
    for(let q=0;q<3;q++){ colArr[(tI+q)*3]=cc.r; colArr[(tI+q)*3+1]=cc.g; colArr[(tI+q)*3+2]=cc.b; } }
  cg.setAttribute('color', new THREE.BufferAttribute(colArr,3)); cg.computeVertexNormals();
  const roof=new THREE.Mesh(cg, new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.7})); roof.position.y=5.35; roof.castShadow=true; rot.add(roof);
  const val=new THREE.Mesh(new THREE.CylinderGeometry(5.9,5.9,0.55,24,1,true), std('#f2c14e',{side:THREE.DoubleSide})); val.position.y=3.85; rot.add(val);
  const fin=new THREE.Mesh(new THREE.SphereGeometry(0.4,10,8), std('#f2c14e',{metalness:0.5,roughness:0.3})); fin.position.y=6.85; rot.add(fin);
  const bl=instanced(BULB, bulbMat, 24, {noShadow:true});
  for(let k=0;k<24;k++){ const a=k/24*Math.PI*2; _m.compose(_p.set(Math.cos(a)*5.95,3.6,Math.sin(a)*5.95), _q.identity(), _s.set(0.11,0.11,0.11)); bl.setMatrixAt(k,_m); }
  rot.add(bl);
  const horseCols=['#fff7ec','#7b4a2e','#e9c08a','#3f2a20'];
  const poleMat=std('#f2c14e',{metalness:0.4,roughness:0.35});
  for(let k=0;k<8;k++){
    const a=k/8*Math.PI*2, r=3.6, hg=new THREE.Group(); hg.position.set(Math.cos(a)*r,0,Math.sin(a)*r); hg.rotation.y=-a; rot.add(hg);
    const pole=new THREE.Mesh(CYL, poleMat); pole.scale.set(0.06,3.6,0.06); pole.position.y=1.9; hg.add(pole);
    const horse=new THREE.Group(); hg.add(horse);
    const hm=std(horseCols[k%4],{roughness:0.6});
    const body=new THREE.Mesh(BOX,hm); body.scale.set(0.45,0.5,1.2); horse.add(body);
    const neck=new THREE.Mesh(BOX,hm); neck.scale.set(0.3,0.6,0.3); neck.position.set(0,0.45,0.55); neck.rotation.x=-0.4; horse.add(neck);
    const head=new THREE.Mesh(BOX,hm); head.scale.set(0.3,0.3,0.55); head.position.set(0,0.75,0.75); horse.add(head);
    for(const lx of [-0.15,0.15]) for(const lz of [-0.45,0.45]){ const leg=new THREE.Mesh(BOX,hm); leg.scale.set(0.12,0.55,0.12); leg.position.set(lx,-0.45,lz); horse.add(leg); }
    const saddle=new THREE.Mesh(BOX, std(['#d9381e','#2e7dbf','#3c9a4a','#8e44ad'][k%4])); saddle.scale.set(0.5,0.12,0.45); saddle.position.y=0.3; horse.add(saddle);
    horse.rotation.y=Math.PI/2;
    anim.horses.push({g:horse, ph:k*0.8});
    body.castShadow=true;
  }
}

// ---------- ferris wheel ----------
function buildFerris(){
  const gy=groundY(FERRIS.x,FERRIS.z)||2, cy=gy+11.6, Rw=9;
  const g=new THREE.Group(); g.position.set(FERRIS.x, 0, FERRIS.z); scene.add(g);
  const frameMat=std('#f6efe4',{metalness:0.2,roughness:0.5});
  const hub=new V(0,cy,0);
  for(const sz of [-1.6,1.6]) for(const sx of [-5.8,5.8]){
    const leg=new THREE.Mesh(CYL, frameMat); beamMatrix(new V(sx,gy,sz*1.6), new V(0,cy,sz*0.7), 0.28, _m, false);
    leg.applyMatrix4(_m); leg.castShadow=true; g.add(leg); }
  const axle=new THREE.Mesh(CYL, std('#5a4a40')); axle.scale.set(0.45,3.6,0.45); axle.rotation.x=Math.PI/2; axle.position.copy(hub); g.add(axle);
  const wheel=new THREE.Group(); wheel.position.copy(hub); g.add(wheel); anim.wheel=wheel;
  const rimMat=std('#e2382d',{metalness:0.3,roughness:0.45});
  for(const z of [-0.9,0.9]){
    const rim=new THREE.Mesh(new THREE.TorusGeometry(Rw,0.17,6,56), rimMat); rim.position.z=z; rim.castShadow=true; wheel.add(rim);
    const rim2=new THREE.Mesh(new THREE.TorusGeometry(Rw*0.55,0.1,6,40), frameMat); rim2.position.z=z; wheel.add(rim2);
    for(let k=0;k<16;k++){ const a=k/16*Math.PI*2; const sp=new THREE.Mesh(CYL, frameMat);
      beamMatrix(new V(0,0,z), new V(Math.cos(a)*Rw, Math.sin(a)*Rw, z), 0.07, _m, false); sp.applyMatrix4(_m); wheel.add(sp); }
  }
  const bl=instanced(BULB, bulbMat, 48, {noShadow:true});
  for(let k=0;k<48;k++){ const a=k/48*Math.PI*2; _m.compose(_p.set(Math.cos(a)*(Rw+0.2), Math.sin(a)*(Rw+0.2), k%2?0.95:-0.95), _q.identity(), _s.set(0.12,0.12,0.12)); bl.setMatrixAt(k,_m); }
  wheel.add(bl);
  const cols=['#e2382d','#f2a91a','#16b8b0','#6a3fc4','#ff7a33','#3c9a4a'];
  for(let k=0;k<12;k++){
    const gd=new THREE.Group(); g.add(gd);
    const cab=new THREE.Mesh(BOX, std(cols[k%6],{roughness:0.5})); cab.scale.set(1.5,1.1,1.3); cab.position.y=-1.15; cab.castShadow=true; gd.add(cab);
    const rf=new THREE.Mesh(BOX, std('#fff3dc')); rf.scale.set(1.7,0.18,1.5); rf.position.y=-0.5; gd.add(rf);
    const hang=new THREE.Mesh(BOX, frameMat); hang.scale.set(0.08,0.6,0.08); hang.position.y=-0.25; gd.add(hang);
    anim.gondolas.push({g:gd, a:k/12*Math.PI*2, hub, R:Rw});
  }
}

// ---------- trees, bushes, lamps, stalls ----------
const AUTUMN=['#e8542a','#f07a2a','#f5a623','#d9381e','#ffc93c','#c42f1d','#ee8f3a','#b8321a'];
const treeTops=[];
function trackClear(x,z,rad,height){ const gy=groundY(x,z); if(gy===null) return false; return minTrackY(x,z,rad) > gy+height; }
function buildFlora(){
  const trunkMat=std('#5b3a26',{roughness:0.95}), leafMat=std('#ffffff',{roughness:0.8});
  const trunks=instanced(BOX, trunkMat, 260), leaves=instanced(BOX, leafMat, 2600);
  let nt=0, nl=0; const col=new THREE.Color(), col2=new THREE.Color(); const placed=[];
  const addLeaf=(x,y,z,sx,sy,sz,c,yaw)=>{ if(nl>=2600) return; _q.setFromAxisAngle(UPY, yaw||0); _m.compose(_p.set(x,y,z), _q, _s.set(sx,sy,sz)); leaves.setMatrixAt(nl,_m); leaves.setColorAt(nl,c); nl++; };
  for(let tries=0; tries<1400 && nt<170; tries++){
    const a=R()*Math.PI*2, r=Math.sqrt(R())*56, x=Math.cos(a)*r, z=Math.sin(a)*r;
    const gy=groundY(x,z); if(gy===null || gy<1) continue;
    if(groundY(x+3,z)===null||groundY(x-3,z)===null||groundY(x,z+3)===null||groundY(x,z-3)===null) continue;
    if(pathDist(x,z)<3 || inZone(x,z,2) || r<12) continue;
    if(!trackClear(x,z,5.2,15)) continue;
    let ok=true; for(const p of placed){ if((p[0]-x)**2+(p[1]-z)**2 < 12){ ok=false; break; } } if(!ok) continue;
    placed.push([x,z]);
    const h=2.2+R()*2.6;
    _m.compose(_p.set(x,gy+h/2,z), _q.identity(), _s.set(0.7,h,0.7)); trunks.setMatrixAt(nt++,_m);
    if(R()<0.13){
      for(let k=0;k<4;k++){ const w=3.4-k*0.75; col.set('#3f6b3a').offsetHSL(0,0,(R()-0.5)*0.06); addLeaf(x, gy+h*0.55+k*1.15, z, w,1.2,w, col, R()); }
      treeTops.push(new V(x,gy+h+3,z));
    } else {
      const Rr=1.7+R()*1.3, cy=gy+h+Rr*0.5, base=AUTUMN[Math.floor(R()*AUTUMN.length)], other=AUTUMN[Math.floor(R()*AUTUMN.length)];
      col.set(base); addLeaf(x,cy,z,Rr*1.35,Rr*1.1,Rr*1.35,col,R());
      const cnt=7+Math.floor(R()*5);
      for(let k=0;k<cnt;k++){
        const sz=0.9+R()*1.1, ox=(R()-0.5)*2*Rr, oy=(R()-0.35)*1.5*Rr, oz=(R()-0.5)*2*Rr;
        col.set(base).lerp(col2.set(other), R()*0.45).offsetHSL(0,0,(R()-0.5)*0.08);
        addLeaf(x+ox, cy+oy, z+oz, sz,sz,sz, col, R());
      }
      treeTops.push(new V(x,cy+Rr*0.6,z));
    }
  }
  // bushes along paths
  for(const p of PATHS) for(let i=0;i<p.length-1;i++){
    const ax=p[i][0], az=p[i][1], bx=p[i+1][0], bz=p[i+1][1], len=Math.hypot(bx-ax,bz-az), nx=-(bz-az)/len, nz=(bx-ax)/len;
    for(let t=10; t<len; t+=4.5){ for(const sg of [1,-1]){
      if(R()<0.45) continue;
      const x=ax+(bx-ax)*t/len+nx*3.1*sg, z=az+(bz-az)*t/len+nz*3.1*sg, gy=groundY(x,z);
      if(gy===null||inZone(x,z,0)||!trackClear(x,z,2.4,3)) continue;
      const sz=0.8+R()*0.7; col.set(AUTUMN[Math.floor(R()*AUTUMN.length)]).offsetHSL(0,-0.1,-0.05);
      addLeaf(x, gy+sz/2, z, sz*1.3, sz, sz*1.3, col, R());
    } }
  }
  trunks.count=nt; leaves.count=nl; if(leaves.instanceColor) leaves.instanceColor.needsUpdate=true;
  scene.add(trunks); scene.add(leaves);
  // lamps
  const lampPos=[];
  for(const p of PATHS) for(let i=0;i<p.length-1;i++){
    const ax=p[i][0], az=p[i][1], bx=p[i+1][0], bz=p[i+1][1], len=Math.hypot(bx-ax,bz-az), nx=-(bz-az)/len, nz=(bx-ax)/len;
    let sg=1;
    for(let t=12; t<len-2; t+=7){ const x=ax+(bx-ax)*t/len+nx*2.2*sg, z=az+(bz-az)*t/len+nz*2.2*sg; sg=-sg;
      const gy=groundY(x,z); if(gy===null||!trackClear(x,z,1.6,4.5)) continue; lampPos.push([x,gy,z]); }
  }
  for(let k=0;k<10;k++){ const a=k/10*Math.PI*2+0.3; lampPos.push([Math.cos(a)*9.3, 2, Math.sin(a)*9.3]); }
  const posts=instanced(BOX, std('#3b2a22'), lampPos.length), heads=instanced(BOX, new THREE.MeshBasicMaterial({color:0xffe08a}), lampPos.length, {noShadow:true});
  lampPos.forEach((l,k)=>{ _m.compose(_p.set(l[0],l[1]+1.5,l[2]), _q.identity(), _s.set(0.16,3,0.16)); posts.setMatrixAt(k,_m);
    _m.compose(_p.set(l[0],l[1]+3.15,l[2]), _q.identity(), _s.set(0.42,0.42,0.42)); heads.setMatrixAt(k,_m); });
  scene.add(posts); scene.add(heads);
  // food stalls
  const awn=stripeTex('#d9381e','#fff1d6',8,true);
  const awnMat=new THREE.MeshStandardMaterial({map:awn, roughness:0.7});
  const stallCols=['#f2c14e','#7fb3d5','#a3d39c','#f4a7b9'];
  let ns=0;
  for(let k=0;k<16 && ns<5;k++){
    const a=k/16*Math.PI*2+0.2, x=Math.cos(a)*13.5, z=Math.sin(a)*13.5;
    if(pathDist(x,z)<3.2 || !trackClear(x,z,5,8)) continue;
    const gy=groundY(x,z); if(gy===null) continue;
    const g=new THREE.Group(); g.position.set(x,gy,z); g.rotation.y=Math.atan2(-x,-z); scene.add(g);
    const body=new THREE.Mesh(BOX, std(stallCols[ns%4])); body.scale.set(2.8,2.2,2.2); body.position.y=1.1; body.castShadow=body.receiveShadow=true; g.add(body);
    const counter=new THREE.Mesh(BOX, std('#fff3dc')); counter.scale.set(2.9,0.25,0.6); counter.position.set(0,1.1,1.2); g.add(counter);
    const aw=new THREE.Mesh(BOX, awnMat); aw.scale.set(3.2,0.12,1.4); aw.position.set(0,2.45,1.35); aw.rotation.x=0.35; aw.castShadow=true; g.add(aw);
    const rf=new THREE.Mesh(BOX, std('#5b3a26')); rf.scale.set(3,0.3,2.4); rf.position.y=2.35; g.add(rf);
    const ball=new THREE.Mesh(new THREE.SphereGeometry(0.35,10,8), std(AUTUMN[ns%AUTUMN.length])); ball.position.set(0,2.9,0); g.add(ball);
    ZONES.push({x,z,r:2.5}); ns++;
  }
}

// ---------- sky dressing: clouds, rocks, balloons ----------
function buildSkyDressing(){
  const cloudMat=new THREE.MeshLambertMaterial({color:0xffffff, emissive:0x9a6a5c, emissiveIntensity:0.32});
  const list=[];
  for(let c=0;c<64;c++){
    const a=R()*Math.PI*2, r=30+R()*290;
    let y = r<75 ? -50-R()*22 : (R()<0.72 ? -12-R()*48 : 22+R()*50);
    if(r<130 && y>0) y=-20-R()*30;
    const cx=Math.cos(a)*r, cz=Math.sin(a)*r, puffs=4+Math.floor(R()*6), sc=1+R()*1.4;
    for(let k=0;k<puffs;k++) list.push([cx+(R()-0.5)*14*sc, y+(R()-0.3)*3*sc, cz+(R()-0.5)*9*sc, (5+R()*7)*sc, (2.5+R()*3)*sc, (4+R()*6)*sc]);
  }
  const im=instanced(BOX, cloudMat, list.length, {noShadow:true, noReceive:true});
  list.forEach((l,k)=>{ _m.compose(_p.set(l[0],l[1],l[2]), _q.identity(), _s.set(l[3],l[4],l[5])); im.setMatrixAt(k,_m); });
  const cg=new THREE.Group(); cg.add(im); scene.add(cg); anim.clouds=cg;
  // floating rocks
  const rockMat=std('#8c7d73'), grassMat=std('#a39a3e');
  for(let k=0;k<8;k++){
    const a=k/8*Math.PI*2+R()*0.5, r=74+R()*24, g=new THREE.Group(); g.position.set(Math.cos(a)*r, -6+R()*18, Math.sin(a)*r); scene.add(g);
    const n=3+Math.floor(R()*4);
    for(let j=0;j<n;j++){ const b=new THREE.Mesh(BOX, rockMat); const s=1.6+R()*2.2; b.scale.set(s,s*(1+R()),s); b.position.set((R()-0.5)*3,-j*1.5-(R()*1.5),(R()-0.5)*3); g.add(b); }
    const top=new THREE.Mesh(BOX, grassMat); top.scale.set(3.6,0.8,3.2); top.position.y=1; g.add(top);
    if(R()<0.6){ const lf=new THREE.Mesh(BOX, std(AUTUMN[k%AUTUMN.length])); lf.scale.set(1.6,1.6,1.6); lf.position.set(0.4,2.6,0.2); g.add(lf);
      const tr=new THREE.Mesh(BOX, std('#5b3a26')); tr.scale.set(0.35,1.2,0.35); tr.position.set(0.4,1.7,0.2); g.add(tr); }
    anim.rocks.push({g, y0:g.position.y, ph:R()*6});
  }
  // hot-air balloons
  const bcols=[['#e2382d','#ffd36a'],['#16b8b0','#fff1d6'],['#6a3fc4','#f5a623']];
  bcols.forEach((bc,k)=>{
    const g=new THREE.Group(); scene.add(g);
    const tex=stripeTex(bc[0],bc[1],12,true);
    const env=new THREE.Mesh(new THREE.SphereGeometry(3.4,18,14), new THREE.MeshLambertMaterial({map:tex})); env.scale.y=1.18; g.add(env);
    const bot=new THREE.Mesh(new THREE.CylinderGeometry(1.2,0.6,1.2,12), new THREE.MeshLambertMaterial({color:bc[0]})); bot.position.y=-3.8; g.add(bot);
    const bk=new THREE.Mesh(BOX, std('#7a4a24')); bk.scale.set(1.1,0.8,1.1); bk.position.y=-5.9; g.add(bk);
    for(const sx of [-0.45,0.45]) for(const sz of [-0.45,0.45]){ const rp=new THREE.Mesh(BOX, std('#3b2a22')); rp.scale.set(0.04,1.4,0.04); rp.position.set(sx,-5,sz); g.add(rp); }
    anim.balloons.push({g, r:85+k*22, a:k*2.1, y:24+k*11, sp:0.018+k*0.006});
  });
}

// ---------- falling leaves ----------
let leafFx=null;
function buildLeafFx(){
  const N=isMobile?120:220;
  const m=new THREE.InstancedMesh(new THREE.PlaneGeometry(0.42,0.3), new THREE.MeshLambertMaterial({side:THREE.DoubleSide}), N);
  m.frustumCulled=false;
  const data=[]; const c=new THREE.Color();
  for(let i=0;i<N;i++){ c.set(AUTUMN[i%AUTUMN.length]); m.setColorAt(i,c); data.push(spawnLeaf({}, true)); }
  if(m.instanceColor) m.instanceColor.needsUpdate=true;
  scene.add(m); leafFx={m,data};
}
function spawnLeaf(o, init){
  const t=treeTops.length?treeTops[Math.floor(Math.random()*treeTops.length)]:new V(0,10,0);
  o.p=new V(t.x+(Math.random()-0.5)*3, init? t.y-Math.random()*(t.y-1) : t.y, t.z+(Math.random()-0.5)*3);
  o.vy=0.6+Math.random()*0.6; o.ph=Math.random()*10; o.sp=1+Math.random()*2; o.rot=new THREE.Euler(Math.random()*6,Math.random()*6,0);
  return o;
}
function updateLeaves(dt){
  if(!leafFx) return; const {m,data}=leafFx;
  for(let i=0;i<data.length;i++){ const o=data[i];
    o.ph+=dt*o.sp; o.p.y-=o.vy*dt; o.p.x+=Math.sin(o.ph)*dt*0.8+dt*0.35; o.p.z+=Math.cos(o.ph*0.7)*dt*0.6;
    o.rot.x+=dt*o.sp; o.rot.y+=dt*0.7;
    const gy=groundY(o.p.x,o.p.z);
    if(o.p.y < (gy===null?-40:gy+0.1)) spawnLeaf(o,false);
    _q.setFromEuler(o.rot); _m.compose(o.p, _q, _s.set(1,1,1)); m.setMatrixAt(i,_m);
  }
  m.instanceMatrix.needsUpdate=true;
}

// ---------- trains ----------
const SKIN=['#f1c9a5','#e0ac7e','#c68a5a','#8d5a3b','#f6d7bd'], SHIRT=['#2e7dbf','#3c9a4a','#f2c14e','#8e44ad','#ffffff','#2b2b2b','#e86f9a','#ff7a33'], HAIR=['#2a1a12','#5b3a26','#c9902c','#1a1a1a','#a0522d'];
function makeRider(){
  const g=new THREE.Group();
  const torso=new THREE.Mesh(BOX, std(SHIRT[Math.floor(R()*SHIRT.length)])); torso.scale.set(0.44,0.5,0.28); torso.position.y=0.25; g.add(torso);
  const head=new THREE.Mesh(BOX, std(SKIN[Math.floor(R()*SKIN.length)])); head.scale.set(0.3,0.3,0.3); head.position.y=0.68; g.add(head);
  const hair=new THREE.Mesh(BOX, std(HAIR[Math.floor(R()*HAIR.length)])); hair.scale.set(0.33,0.12,0.33); hair.position.set(0,0.86,-0.02); g.add(hair);
  const arms=[]; const am=torso.material;
  for(const sx of [-0.28,0.28]){ const pv=new THREE.Group(); pv.position.set(sx,0.46,0); const arm=new THREE.Mesh(BOX, am); arm.scale.set(0.11,0.46,0.11); arm.position.y=-0.21; pv.add(arm); pv.rotation.x=-1.25; g.add(pv); arms.push(pv); }
  return {g, arms, up:0};
}
function buildTrain(c){
  const d=c.def;
  const body=std(d.color,{roughness:0.35, metalness:0.25}), accent=std(d.spine,{roughness:0.4, metalness:0.2}), dark=std('#2a2226',{roughness:0.6, metalness:0.3}), seat=std('#3a2a2a');
  c.cars=[]; c.frontRiders=[];
  for(let k=0;k<d.cars;k++){
    const car=new THREE.Group(); scene.add(car);
    const bog=new THREE.Mesh(BOX, dark); bog.scale.set(1.25,0.28,1.9); bog.position.y=0.12; car.add(bog);
    const tub=new THREE.Mesh(BOX, body); tub.scale.set(1.6,0.6,2.3); tub.position.y=0.58; tub.castShadow=true; car.add(tub);
    const stripe=new THREE.Mesh(BOX, accent); stripe.scale.set(1.63,0.13,2.33); stripe.position.y=0.66; car.add(stripe);
    for(const rz of [0.45,-0.6]){ const sb=new THREE.Mesh(BOX, seat); sb.scale.set(1.36,0.75,0.14); sb.position.set(0,1.1,rz-0.36); car.add(sb); }
    if(k===0){
      const nose=new THREE.Mesh(BOX, body); nose.scale.set(1.5,0.5,0.9); nose.position.set(0,0.48,1.45); nose.rotation.x=0.38; nose.castShadow=true; car.add(nose);
      for(const sx of [-0.45,0.45]){ const hl=new THREE.Mesh(BULB, bulbMat); hl.scale.set(0.12,0.12,0.06); hl.position.set(sx,0.6,1.88); car.add(hl); }
      const num=new THREE.Mesh(BOX, accent); num.scale.set(0.6,0.08,0.6); num.position.set(0,0.78,1.35); num.rotation.x=0.38; car.add(num);
    }
    car.userData.riders=[];
    for(const rz of [0.45,-0.6]) for(const rx of [-0.36,0.36]){
      if(!(k===0 && rz>0) && R()<0.22) continue;
      const rd=makeRider(); rd.g.position.set(rx,0.86,rz); car.add(rd.g); car.userData.riders.push(rd);
      if(k===0 && rz>0) c.frontRiders.push(rd);
    }
    c.cars.push(car);
  }
}
function makeFrame(){ return {p:new V(), t:new V(), u:new V(), b:new V(), k:new V(), i:0}; }
function sampleAt(c, s, F){
  let ss=s % c.L; if(ss<0) ss+=c.L;
  const f=ss/c.ds; let i0=Math.floor(f); const a=f-i0; i0=i0%c.n; const i1=(i0+1)%c.n;
  F.i=i0;
  F.p.copy(c.P[i0]).lerp(c.P[i1],a);
  F.t.copy(c.T[i0]).lerp(c.T[i1],a).normalize();
  F.u.copy(c.U[i0]).lerp(c.U[i1],a); F.u.addScaledVector(F.t,-F.u.dot(F.t)).normalize();
  F.b.crossVectors(F.u,F.t).normalize();
  F.k.copy(c.K[i0]).lerp(c.K[i1],a);
  return F;
}
const SPACING=2.75;
function stepTrain(c, st, dt){
  const d=c.def, s=st.s, i=Math.floor(s/c.ds)%c.n, ty=c.T[i].y, v0=st.v;
  let v=v0;
  if(s < c.Lst) v=approach(v, d.stationSpeed, 4*dt);
  else if(s > c.L-d.brakeLen) v=approach(v, d.stationSpeed+0.5, 7*dt);
  else {
    v += (-G*ty - d.roll - d.drag*v*v)*dt;
    if(d.type==='chain' && s<=c.sTop && v<d.liftSpeed) v=Math.max(v, Math.min(d.liftSpeed, v0+2.5*dt));
    if(d.type==='launch' && s<=c.Lst+d.launchLen) v=Math.min(d.launchSpeed, v0+d.launchAccel*dt);
    for(const t of c.trims) if(s>=t.a && s<=t.b && v>t.speed) v=approach(v, t.speed, 7*dt);
  }
  v=Math.max(v,1.6);
  st.v=v; st.s+=v*dt; st.lapTime+=dt;
  if(st.v>st.top) st.top=st.v;
  if(st.s>=c.L){ st.s-=c.L; return true; }
  return false;
}
function preSimulate(c){
  const st={s:0, v:c.def.stationSpeed, lapTime:0, top:0}; let t=0;
  while(t<400){ if(stepTrain(c, st, 1/60)) break; t+=1/60; }
  c.stats={topKmh:st.top*3.6, lapTime:st.lapTime, height:c.maxY-2};
}
const FR=makeFrame(), FR2=makeFrame(), _mz=new V(), _mx=new V();
function placeTrain(c, dt){
  const st=c.st;
  for(let k=0;k<c.cars.length;k++){
    const car=c.cars[k]; sampleAt(c, st.s-k*SPACING, FR);
    _m.makeBasis(FR.b, FR.u, FR.t); car.quaternion.setFromRotationMatrix(_m);
    car.position.copy(FR.p).addScaledVector(FR.u,0.06);
    const thrill = (FR.t.y<-0.22 && st.v>10) || st.g<0.35;
    for(const rd of car.userData.riders){
      rd.up += ((thrill?1:0)-rd.up)*Math.min(1,dt*(thrill?5:1.6));
      const ang=-1.25-1.65*rd.up;
      rd.arms[0].rotation.x=ang; rd.arms[1].rotation.x=ang+Math.sin(performance.now()*0.012+k)*0.12*rd.up;
    }
  }
  sampleAt(c, st.s, FR2);
  _v.copy(FR2.k).multiplyScalar(st.v*st.v); _v.y+=G;
  const g=_v.dot(FR2.u)/G;
  st.g += (g-st.g)*Math.min(1,dt*5);
}

// ---------- state ----------
let sel=0, camMode='orbit', running=true, started=false, timeScale=1;
const orbit={target:new V(0,4,0), goal:new V(0,4,0), yaw:0.75, pitch:0.36, dist:150, distGoal:150, idle:0, focus:false};
const chase={yaw:0, h:5.2, dist:14, pos:new V(), look:new V(), fwd:new V(1,0,0), init:false};
const ride={yaw:0, pitch:0, hold:0, snap:true};
const qT=new THREE.Quaternion(), qL=new THREE.Quaternion(), eL=new THREE.Euler(0,0,0,'YXZ');

function resetTrains(stagger){
  coasters.forEach((c,ci)=>{
    c.st={s: stagger? c.L*[0.12,0.45,0.7][ci] : c.Lst*0.6, v: stagger?9:c.def.stationSpeed, lap:0, lapTime:0, best:0, top:0, g:1};
    if(!stagger) c.st.s = Math.max(0.5, c.Lst-1);
  });
}

// ---------- camera ----------
function updateCamera(dt){
  const c=coasters[sel];
  let fovGoal=55;
  if(camMode==='orbit'){
    if(orbit.idle>3.5) orbit.yaw += dt*0.06;
    orbit.idle+=dt;
    orbit.target.lerp(orbit.goal, 1-Math.exp(-dt*2.2));
    orbit.dist += (orbit.distGoal-orbit.dist)*(1-Math.exp(-dt*3));
    const cp=Math.cos(orbit.pitch);
    camera.position.set(orbit.target.x+orbit.dist*cp*Math.sin(orbit.yaw), orbit.target.y+orbit.dist*Math.sin(orbit.pitch), orbit.target.z+orbit.dist*cp*Math.cos(orbit.yaw));
    camera.up.set(0,1,0); camera.lookAt(orbit.target);
  } else if(camMode==='chase'){
    const mid=(c.cars.length-1)*SPACING*0.5;
    sampleAt(c, c.st.s-mid, FR);
    chase.fwd.lerp(FR.t, 1-Math.exp(-dt*2.2));
    _v.set(chase.fwd.x, chase.fwd.y*0.25, chase.fwd.z); if(_v.lengthSq()<1e-4) _v.set(1,0,0); _v.normalize();
    _v.applyAxisAngle(UPY, chase.yaw);
    _v2.copy(FR.p).addScaledVector(_v,-chase.dist); _v2.y = FR.p.y + chase.h;
    const gy=groundY(_v2.x,_v2.z); if(gy!==null && _v2.y<gy+1.8) _v2.y=gy+1.8;
    if(!chase.init){ chase.pos.copy(_v2); chase.look.copy(FR.p); chase.init=true; }
    chase.pos.lerp(_v2, 1-Math.exp(-dt*3.5));
    chase.look.lerp(_p.copy(FR.p).add(_s.set(0,1.2,0)), 1-Math.exp(-dt*6));
    camera.position.copy(chase.pos); camera.up.set(0,1,0); camera.lookAt(chase.look);
    fovGoal=58;
  } else {
    sampleAt(c, c.st.s, FR);
    const shake=Math.min(1,c.st.v/25)*0.012;
    const tt=performance.now()*0.001;
    camera.position.copy(FR.p).addScaledVector(FR.u,1.62).addScaledVector(FR.t,0.38).addScaledVector(FR.u,Math.sin(tt*37)*shake).addScaledVector(FR.b,Math.sin(tt*29)*shake*0.6);
    _mx.copy(FR.b).negate(); _mz.copy(FR.t).negate();
    _m.makeBasis(_mx, FR.u, _mz); qT.setFromRotationMatrix(_m);
    if(ride.hold>0) ride.hold-=dt; else { ride.yaw*=Math.exp(-dt*2); ride.pitch*=Math.exp(-dt*2); }
    eL.set(ride.pitch, ride.yaw, 0, 'YXZ'); qL.setFromEuler(eL); qT.multiply(qL);
    if(ride.snap){ camera.quaternion.copy(qT); ride.snap=false; } else camera.quaternion.slerp(qT, 1-Math.exp(-dt*16));
    fovGoal = 74 + Math.min(14, c.st.v*0.45);
  }
  if(Math.abs(camera.fov-fovGoal)>0.05){ camera.fov += (fovGoal-camera.fov)*Math.min(1,dt*4); camera.updateProjectionMatrix(); }
  sky.position.copy(camera.position);
}
function setCam(m, silent){
  if(mode2d) return;
  camMode=m; ride.snap=true; chase.init=false; ride.yaw=ride.pitch=0;
  document.querySelectorAll('#cams button').forEach(b=>b.classList.toggle('on', b.dataset.m===m));
  coasters.forEach((c,ci)=> (c.frontRiders||[]).forEach(rd=> rd.g.visible = !(m==='ride' && ci===sel)));
  if(m==='orbit'){ focusOrbit(); orbit.idle=0; }
  if(!silent) toast({ride:'탑승 시점 · 드래그로 고개를 돌려 보세요', chase:'추적 시점 · 드래그로 각도, 휠/핀치로 거리', orbit:'전경 · 드래그로 회전, 휠/핀치로 확대'}[m]);
}
function focusOrbit(){
  if(!started){ orbit.goal.set(0,4,0); orbit.distGoal=isMobile?175:150; return; }
  const c=coasters[sel]; orbit.goal.set(c.center.x, Math.max(8,c.center.y), c.center.z); orbit.distGoal=Math.max(45, c.radius*2.3);
}
function selectCoaster(i, silent){
  sel=i;
  document.querySelectorAll('.cbtn').forEach((b,k)=>b.classList.toggle('active', k===i));
  const d=coasters[i].def; $('#hudDot').style.background=d.color; $('#hudName').textContent=d.name;
  setCam(camMode, true);
  if(!silent) toast(d.name+' · '+d.tag);
}

// ---------- UI ----------
let toastT=0;
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'), 2200); }
const ICON_PLAY='<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>', ICON_PAUSE='<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
function setRunning(r){ running=r; $('#play').innerHTML = r?ICON_PAUSE:ICON_PLAY; $('#pausedTag').classList.toggle('hidden', r || !started); }
function setSpeed(v){ timeScale=Math.max(0.25,Math.min(2,Math.round(v*4)/4)); $('#spd').value=timeScale; $('#spdv').textContent=timeScale.toFixed(timeScale%0.5?2:1)+'×'; }
function fmtTime(t){ const m=Math.floor(t/60), s=t-m*60; return m+':'+(s<10?'0':'')+s.toFixed(1); }
function buildUI(){
  const chips=$('#chips'), trio=$('#trio');
  coasters.forEach((c,i)=>{
    const d=c.def, st=c.stats;
    const b=document.createElement('button'); b.className='cbtn'; b.style.setProperty('--c',d.color);
    b.innerHTML='<span class="dot"></span><span><span class="nm">'+d.name+'</span><span class="sub">'+Math.round(c.L)+'m · 높이 '+Math.round(st.height)+'m · 최고 '+Math.round(st.topKmh)+'km/h</span></span><span class="key">'+(i+1)+'</span>';
    b.addEventListener('click',()=>selectCoaster(i));
    chips.appendChild(b);
    const li=document.createElement('li');
    li.innerHTML='<span class="dot" style="background:'+d.color+'"></span><div><b>'+d.name+'</b> <span>'+d.en+'</span><br><span>'+d.tag+' · 한 바퀴 약 '+Math.round(st.lapTime)+'초</span></div>';
    trio.appendChild(li);
  });
  document.querySelectorAll('#cams button').forEach(b=>b.addEventListener('click',()=>setCam(b.dataset.m)));
  $('#play').addEventListener('click',()=>setRunning(!running));
  $('#spd').addEventListener('input',e=>setSpeed(parseFloat(e.target.value)));
  $('#reset').addEventListener('click',doReset);
  $('#helpBtn').addEventListener('click',()=>$('#help').classList.remove('hidden'));
  $('#closeHelp').addEventListener('click',()=>$('#help').classList.add('hidden'));
  $('#help').addEventListener('click',e=>{ if(e.target.id==='help') $('#help').classList.add('hidden'); });
  $('#go').addEventListener('click',startGame);
  window.addEventListener('keydown',e=>{
    if(e.repeat || e.target?.closest('input, select, textarea, [contenteditable=true]')) return;
    if(e.target?.closest('button, a') && (e.key===' ' || e.key==='Enter')) return;
    const k=e.key.toLowerCase();
    if(!started){ if(k==='enter'||k===' '){ e.preventDefault(); startGame(); } return; }
    if(k==='escape'){ $('#help').classList.add('hidden'); return; }
    if(k===' '){ e.preventDefault(); setRunning(!running); }
    else if(k==='1'||k==='2'||k==='3') selectCoaster(parseInt(k)-1);
    else if(k==='c'||k==='v'){ const order=['ride','chase','orbit']; setCam(order[(order.indexOf(camMode)+1)%3]); }
    else if(k==='+'||k==='='){ setSpeed(timeScale+0.25); toast('속도 '+$('#spdv').textContent); }
    else if(k==='-'||k==='_'){ setSpeed(timeScale-0.25); toast('속도 '+$('#spdv').textContent); }
    else if(k==='r') doReset();
    else if(k==='h'||k==='?') $('#help').classList.toggle('hidden');
  });
}
function startGame(){
  if(started || booting || $('#go').disabled) return;
  started=true; $('#start').classList.add('hidden');
  resetTrains(false);
  selectCoaster(sel, true); setRunning(true); setCam('chase', true);
  toast(mode2d ? '2D 지도 모드 · 코스터를 고르거나 지도에서 트랙을 눌러 보세요' : '출발! C 키나 아래 버튼으로 탑승 시점을 바꿔 보세요');
}
function doReset(){
  resetTrains(false); setSpeed(1); setRunning(true);
  orbit.yaw=0.75; orbit.pitch=0.36; chase.yaw=0; chase.h=5.2; chase.dist=14;
  setCam(camMode, true); toast('모든 열차가 역으로 돌아왔어요');
}

// ---------- input ----------
const pointers=new Map(); let pinchD=0;
stage.addEventListener('pointerdown',e=>{ canvas.focus({preventScroll:true}); try{stage.setPointerCapture(e.pointerId);}catch(_){}
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY}); orbit.idle=0;
  if(pointers.size===2){ const a=[...pointers.values()]; pinchD=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y); } });
stage.addEventListener('pointermove',e=>{
  const p=pointers.get(e.pointerId); if(!p) return;
  const dx=e.clientX-p.x, dy=e.clientY-p.y; p.x=e.clientX; p.y=e.clientY; orbit.idle=0;
  if(pointers.size===1){
    if(camMode==='orbit'){ orbit.yaw-=dx*0.0055; orbit.pitch=Math.max(-0.75,Math.min(1.45,orbit.pitch+dy*0.0045)); }
    else if(camMode==='chase'){ chase.yaw-=dx*0.006; chase.h=Math.max(1.2,Math.min(18,chase.h+dy*0.04)); }
    else { ride.yaw=Math.max(-1.9,Math.min(1.9,ride.yaw+dx*0.004)); ride.pitch=Math.max(-1.1,Math.min(1.1,ride.pitch+dy*0.004)); ride.hold=1.6; }
  } else if(pointers.size===2){
    const a=[...pointers.values()]; const d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
    if(pinchD>0 && d>0) zoom(pinchD/d); pinchD=d;
  }
});
function endPtr(e){ pointers.delete(e.pointerId); if(pointers.size<2) pinchD=0; }
stage.addEventListener('pointerup',endPtr); stage.addEventListener('pointercancel',endPtr); stage.addEventListener('lostpointercapture',endPtr);
stage.addEventListener('wheel',e=>{ e.preventDefault(); orbit.idle=0; zoom(Math.exp(e.deltaY*0.0012)); },{passive:false});
function zoom(f){
  if(camMode==='orbit') orbit.distGoal=Math.max(18,Math.min(300,orbit.distGoal*f));
  else if(camMode==='chase') chase.dist=Math.max(6,Math.min(45,chase.dist*f));
}
window.addEventListener('resize',()=>{ if(renderer) renderer.setSize(innerWidth,innerHeight); camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); if(mode2d) size2d(); });

// ---------- park animation ----------
function animatePark(dt, t){
  if(anim.carousel) anim.carousel.rotation.y += dt*0.55;
  anim.horses.forEach(h=>{ h.g.position.y = 1.55 + Math.sin(t*2.2+h.ph)*0.28; });
  if(anim.wheel){ anim.wheel.rotation.z += dt*0.09; const rz=anim.wheel.rotation.z;
    anim.gondolas.forEach(g=>{ const a=g.a+rz; g.g.position.set(Math.cos(a)*g.R, g.hub.y+Math.sin(a)*g.R, 0); g.g.rotation.z=Math.sin(t*1.3+g.a)*0.04; }); }
  anim.balloons.forEach(b=>{ b.a+=dt*b.sp; b.g.position.set(Math.cos(b.a)*b.r, b.y+Math.sin(t*0.4+b.r)*2.2, Math.sin(b.a)*b.r); b.g.rotation.y=b.a; });
  anim.rocks.forEach(r=>{ r.g.position.y=r.y0+Math.sin(t*0.5+r.ph)*1.2; r.g.rotation.y+=dt*0.03; });
  if(anim.clouds) anim.clouds.rotation.y += dt*0.0035;
}

// ---------- HUD ----------
let hudT=0;
function updateHUD(dt){
  hudT+=dt; if(hudT<0.08) return; hudT=0;
  const c=coasters[sel], st=c.st;
  sampleAt(c, st.s, FR);
  const kmh=st.v*3.6, gy=groundY(FR.p.x,FR.p.z);
  $('#hudSpeed').textContent=Math.round(kmh);
  $('#hudBar').style.width=Math.min(100, kmh/110*100)+'%';
  $('#hudH').textContent=Math.max(0,Math.round(FR.p.y-(gy===null?2:gy)))+'m';
  const g=Math.max(-2.5,Math.min(6.5,st.g)); $('#hudG').textContent=g.toFixed(1);
  $('#hudG').style.color = g<0.3 ? '#2e7dbf' : (g>3.5 ? '#c4161c' : '');
  $('#hudLap').textContent=st.lap;
  $('#hudBest').textContent=st.best?fmtTime(st.best):'—';
}
function onLap(c, ci){
  const st=c.st; st.lap++;
  if(st.lapTime>8){ const isBest=!st.best||st.lapTime<st.best; if(isBest) st.best=st.lapTime;
    if(started && ci===sel) toast(c.def.name+' '+st.lap+'바퀴 완주 · '+fmtTime(st.lapTime)+' · 최고 '+Math.round(st.top*3.6)+'km/h'); }
  st.lapTime=0;
}

// ---------- adaptive resolution ----------
let perfAcc=0, perfN=0, perfCool=3;
function adaptPerf(dt){
  perfCool-=dt; perfAcc+=dt; perfN++;
  if(perfN>=90){ const avg=perfAcc/perfN; perfAcc=0; perfN=0;
    if(perfCool<=0 && avg>0.026 && pixelRatio>1){ pixelRatio=Math.max(1,pixelRatio-0.25); renderer.setPixelRatio(pixelRatio); renderer.setSize(innerWidth,innerHeight); perfCool=4; } }
}

// ---------- main loop ----------
let last=performance.now(), simT=0;
function frame(now){
  if(!renderer || mode2d || ctxLost){ loop3d=false; return; }
  try{
  let dt=(now-last)/1000; last=now; if(!(dt>0)) dt=0.016; dt=Math.min(dt,0.05);
  const sdt = running ? dt*timeScale : 0;
  simT += sdt;
  coasters.forEach((c,ci)=>{
    if(sdt>0){ let rem=sdt; while(rem>1e-6){ const h=Math.min(rem,1/120); rem-=h; if(stepTrain(c,c.st,h)) onLap(c,ci); } }
    placeTrain(c, dt);
  });
  animatePark(sdt, simT);
  if(sdt>0) updateLeaves(sdt);
  updateCamera(dt);
  updateHUD(dt);
  adaptPerf(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
  }catch(e){ loop3d=false; ERRS.push('3D 화면: '+(e.message||e)); failStart('webgl'); }
}

// ---------- boot ----------
let pathsBuilt=false, sceneBuilt=false, uiBuilt=false, loop3d=false, loop2d=false;
function buildPaths(){ if(pathsBuilt) return; DEFS.forEach(d=>coasters.push(buildPath(d))); tgBuild(); coasters.forEach(preSimulate); pathsBuilt=true; }
function buildScene3D(){
  if(sceneBuilt) return;
  coasters.forEach(c=>buildStation(c));
  buildIsland();
  coasters.forEach((c,ci)=>{ buildTrack(c); buildSupports(c,ci); buildTrain(c); });
  buildCarousel(); buildFerris(); buildFlora(); buildSkyDressing(); buildLeafFx();
  sceneBuilt=true;
}
function ensureUI(){ if(uiBuilt) return; resetTrains(true); buildUI(); uiBuilt=true; }
function ready(label){
  bootDone=true; booting=false; $('#retry3d').disabled=false; hideDiag();
  $('#err').hidden=true; document.body.dataset.renderer=mode2d?'2d':'3d';
  const sh=$('#slowhint'); if(sh) sh.classList.add('hidden');
  const go=$('#go'); go.disabled=false; go.textContent=label;
  if(started) $('#start').classList.add('hidden');
}
function boot3D(liteMode){
  if(booting) return;
  booting=true; $('#retry3d').disabled=true;
  pointers.clear(); pinchD=0;
  hideDiag();
  const go=$('#go'); go.disabled=true; go.textContent=liteMode?'저사양 3D로 시작하는 중…':'3D 엔진을 시작하는 중…';
  setTimeout(()=>{
    try{
      buildPaths();
      if(!createRenderer(liteMode)){ failStart('webgl'); return; }
      ctxLost=false;
      sun.castShadow = !lite;
      buildScene3D(); ensureUI();
      mode2d=false; document.body.classList.remove('mode2d');
      $('#map2d').classList.add('hidden'); $('#stage').classList.remove('hidden');
      selectCoaster(sel, true); setSpeed(timeScale); setRunning(true); setCam(started?camMode:'orbit', true);
      updateCamera(0.016); renderer.render(scene, camera);   // first frame compiles shaders; throws/loses context here if the GPU can't cope
      const gl=renderer.getContext(); if(gl.isContextLost && gl.isContextLost()) throw new Error('첫 프레임 직후 WebGL 컨텍스트가 끊김');
      ready(lite?'탑승 시작 (저사양 3D)':'탑승 시작');
      if(!loop3d){ loop3d=true; last=performance.now(); requestAnimationFrame(frame); }
      if(lite && started) toast('저사양 모드: 그림자·안티앨리어싱 끔, 해상도 1×');
    }catch(e){
      console.error(e); ERRS.push('3D 초기화: '+((e&&e.message)||e)); disposeRenderer();
      failStart(pathsBuilt?'webgl':'script');
    }
  }, 30);
}

// ---------- 2D map fallback (no WebGL needed) ----------
let ctx2d=null, static2d=null, view2d=null;
function size2d(){
  const cv=$('#map2d'), dpr=Math.min(window.devicePixelRatio||1,2);
  cv.width=Math.round(innerWidth*dpr); cv.height=Math.round(innerHeight*dpr);
  ctx2d=cv.getContext('2d'); ctx2d.setTransform(dpr,0,0,dpr,0,0); static2d=null;
  const w=innerWidth, h=innerHeight, top=w<=420?96:76, bottom=w<=760?178:150;
  const avail=Math.max(120, Math.min(w-16, h-top-bottom));
  view2d={sc:avail/134, cx:w/2, cy:top+(h-top-bottom)/2, dpr};
}
function edgeAt(a){ return Math.max(59, 63+(fbm(Math.cos(a)*1.7+11, Math.sin(a)*1.7+3)-0.5)*14); }
function buildStatic2d(){
  const v=view2d, cv=document.createElement('canvas'); cv.width=Math.round(innerWidth*v.dpr); cv.height=Math.round(innerHeight*v.dpr);
  const g=cv.getContext('2d'); g.setTransform(v.dpr,0,0,v.dpr,0,0);
  const X=x=>v.cx+x*v.sc, Z=z=>v.cy+z*v.sc;
  const bg=g.createLinearGradient(0,0,0,innerHeight); bg.addColorStop(0,'#86aedb'); bg.addColorStop(0.5,'#fbd3ac'); bg.addColorStop(1,'#e6bccb');
  g.fillStyle=bg; g.fillRect(0,0,innerWidth,innerHeight);
  const island=()=>{ g.beginPath(); for(let k=0;k<=120;k++){ const a=k/120*Math.PI*2, e=edgeAt(a); const px=X(Math.cos(a)*e), pz=Z(Math.sin(a)*e); if(k) g.lineTo(px,pz); else g.moveTo(px,pz); } g.closePath(); };
  g.save(); g.translate(0,14*v.sc/2+6); island(); g.fillStyle='#6b5a55'; g.fill(); g.restore();
  island(); g.fillStyle='#a3a644'; g.fill(); g.lineWidth=2; g.strokeStyle='rgba(90,60,40,.35)'; g.stroke();
  // autumn tree dots (deterministic)
  const rr=mulberry32(77);
  for(let k=0;k<160;k++){ const a=rr()*Math.PI*2, r=14+Math.sqrt(rr())*44, x=Math.cos(a)*r, z=Math.sin(a)*r;
    if(pathDist(x,z)<3 || inZone(x,z,1) || minTrackY(x,z,4.5)<30) continue;
    g.fillStyle=AUTUMN[k%AUTUMN.length]; const s=(1.6+rr()*1.4)*v.sc; g.fillRect(X(x)-s/2,Z(z)-s/2,s,s); }
  g.lineCap='round'; g.lineJoin='round'; g.strokeStyle='#e5d0a5'; g.lineWidth=Math.max(2,3.6*v.sc);
  PATHS.forEach(p=>{ g.beginPath(); p.forEach((q,i)=>{ if(i) g.lineTo(X(q[0]),Z(q[1])); else g.moveTo(X(q[0]),Z(q[1])); }); g.stroke(); });
  g.fillStyle='#d8cab6'; g.beginPath(); g.arc(X(0),Z(0),10*v.sc,0,Math.PI*2); g.fill();
  g.fillStyle='#d9381e'; g.beginPath(); g.arc(X(0),Z(0),5*v.sc,0,Math.PI*2); g.fill();
  g.fillStyle='#4fa6c8'; g.beginPath(); g.arc(X(POND.x),Z(POND.z),POND.r*v.sc,0,Math.PI*2); g.fill();
  g.strokeStyle='#e2382d'; g.lineWidth=Math.max(2,0.7*v.sc); g.beginPath(); g.moveTo(X(FERRIS.x-9),Z(FERRIS.z)); g.lineTo(X(FERRIS.x+9),Z(FERRIS.z)); g.stroke();
  // tracks: all segments drawn low → high so crossings read correctly
  const segs=[];
  coasters.forEach((c,ci)=>{ for(let i=0;i<c.n;i+=2){ const j=(i+2)%c.n; segs.push([ci,i,j,(c.P[i].y+c.P[j].y)/2]); } });
  segs.sort((a,b)=>a[3]-b[3]);
  for(const s of segs){ const c=coasters[s[0]], a=c.P[s[1]], b=c.P[s[2]], hgt=s[3];
    g.strokeStyle='rgba(60,30,20,.18)'; g.lineWidth=Math.max(2,1.3*v.sc);
    const off=Math.min(10, hgt*0.12)*v.sc*0.5;
    g.beginPath(); g.moveTo(X(a.x)+off,Z(a.z)+off); g.lineTo(X(b.x)+off,Z(b.z)+off); g.stroke();
    g.strokeStyle=c.def.color; g.lineWidth=Math.max(2,(0.9+hgt*0.035)*v.sc);
    g.beginPath(); g.moveTo(X(a.x),Z(a.z)); g.lineTo(X(b.x),Z(b.z)); g.stroke(); }
  g.font='700 '+Math.max(11,Math.round(2.6*v.sc))+'px system-ui, sans-serif'; g.textAlign='center';
  coasters.forEach(c=>{ const p=c.P[Math.round(c.Lst/c.ds/2)]; const tx=X(p.x), tz=Z(p.z)-2.4*v.sc;
    const w=g.measureText(c.def.name).width+12; g.fillStyle='rgba(45,27,18,.82)'; g.fillRect(tx-w/2,tz-11,w,20); g.fillStyle='#fff'; g.fillText(c.def.name,tx,tz+4); });
  static2d=cv;
}
const FR3=makeFrame();
function draw2d(){
  if(!static2d) buildStatic2d();
  const g=ctx2d, v=view2d, X=x=>v.cx+x*v.sc, Z=z=>v.cy+z*v.sc;
  g.setTransform(1,0,0,1,0,0); g.drawImage(static2d,0,0); g.setTransform(v.dpr,0,0,v.dpr,0,0);
  coasters.forEach((c,ci)=>{
    for(let k=c.def.cars-1;k>=0;k--){
      sampleAt(c, c.st.s-k*SPACING, FR3);
      const hs=1+FR3.p.y*0.012, ang=Math.atan2(FR3.t.z,FR3.t.x);
      g.save(); g.translate(X(FR3.p.x),Z(FR3.p.z)); g.rotate(ang); g.scale(hs,hs);
      g.fillStyle=c.def.color; g.strokeStyle=ci===sel?'#fff':'rgba(40,20,10,.6)'; g.lineWidth=ci===sel?2:1;
      const L=2.3*v.sc, W=1.6*v.sc; g.fillRect(-L/2,-W/2,L,W); g.strokeRect(-L/2,-W/2,L,W);
      if(k===0){ g.fillStyle='#fff6d6'; g.fillRect(L/2-2,-W/2+1,2,W-2); }
      g.restore();
    }
  });
  // elevation profile of selected coaster
  const c=coasters[sel], pw=Math.min(300, innerWidth*0.46), ph=64, px=innerWidth<=420?innerWidth-pw-8:12, py=innerWidth<=420?8:68;
  g.fillStyle='rgba(255,248,238,.88)'; g.fillRect(px,py,pw,ph+20);
  g.fillStyle='#80604c'; g.font='700 11px system-ui, sans-serif'; g.textAlign='left'; g.fillText('높이 프로필 · '+c.def.name, px+8, py+14);
  g.strokeStyle=c.def.color; g.lineWidth=2; g.beginPath();
  const maxY=c.maxY+2;
  for(let i=0;i<c.n;i+=3){ const x=px+6+(pw-12)*i/c.n, y=py+18+ph-4-(c.P[i].y/maxY)*(ph-8); if(i) g.lineTo(x,y); else g.moveTo(x,y); }
  g.stroke();
  sampleAt(c, c.st.s, FR3);
  const mx=px+6+(pw-12)*(c.st.s/c.L), my=py+18+ph-4-(FR3.p.y/maxY)*(ph-8);
  g.fillStyle='#2d1b12'; g.beginPath(); g.arc(mx,my,4,0,Math.PI*2); g.fill();
}
function calcG(c,dt){ sampleAt(c,c.st.s,FR2); _v.copy(FR2.k).multiplyScalar(c.st.v*c.st.v); _v.y+=G; const g=_v.dot(FR2.u)/G; c.st.g+=(g-c.st.g)*Math.min(1,dt*5); }
function frame2d(now){
  if(!mode2d){ loop2d=false; return; }
  try{
  let dt=(now-last)/1000; last=now; if(!(dt>0)) dt=0.016; dt=Math.min(dt,0.05);
  const sdt=running?dt*timeScale:0;
  coasters.forEach((c,ci)=>{ if(sdt>0){ let rem=sdt; while(rem>1e-6){ const h=Math.min(rem,1/120); rem-=h; if(stepTrain(c,c.st,h)) onLap(c,ci); } } calcG(c,dt); });
  draw2d(); updateHUD(dt);
  requestAnimationFrame(frame2d);
  }catch(e){ loop2d=false; ERRS.push('2D 지도: '+(e.message||e)); failStart('script'); }
}
function start2D(){
  if(booting) return;
  pointers.clear(); pinchD=0;
  try{ buildPaths(); }catch(e){ ERRS.push('경로 생성: '+((e&&e.message)||e)); failStart('script'); return; }
  disposeRenderer();
  mode2d=true; document.body.classList.add('mode2d');
  $('#stage').classList.add('hidden'); $('#map2d').classList.remove('hidden');
  size2d(); ensureUI(); selectCoaster(sel,true); setRunning(true);
  ready('2D 지도 모드로 시작');
  if(!loop2d){ loop2d=true; last=performance.now(); requestAnimationFrame(frame2d); }
}
$('#map2d').addEventListener('pointerdown', e=>{
  if(!mode2d || !view2d) return;
  const x=(e.clientX-view2d.cx)/view2d.sc, z=(e.clientY-view2d.cy)/view2d.sc;
  let best=6, bi=-1; coasters.forEach((c,ci)=>{ for(let i=0;i<c.n;i+=2){ const d=Math.hypot(c.P[i].x-x,c.P[i].z-z); if(d<best){best=d; bi=ci;} } });
  if(bi>=0) selectCoaster(bi);
});
$('#retry3d').addEventListener('click', ()=>boot3D(false));

boot3D(false);
setTimeout(()=>{ if(!bootDone && !failedOnce){ ERRS.push('20초 안에 시작하지 못함'); failStart('timeout'); } }, 20000);
})();
