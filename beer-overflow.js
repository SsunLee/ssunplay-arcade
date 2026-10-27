import * as T from "three";
import { clamp, lerp } from "./engine.js";

// A thin, moving film on the glass, with separate falling drops and wet ripples.
// These are visual particles driven by the engine's measured overflow, not score logic.
const vertex = `
varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const noise = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}`;
function filmMaterial(seed) {
  return new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.DoubleSide,
    uniforms: { time: { value: 0 }, strength: { value: 0 }, foam: { value: 1 }, seed: { value: seed } },
    vertexShader: vertex,
    fragmentShader: `varying vec2 vUv;uniform float time,strength,foam,seed;${noise}
void main(){
 vec2 p=vUv;float flow=time*1.7;
 float n=noise2(vec2(p.x*8.+seed,p.y*12.-flow));
 float left=.04+.14*noise2(vec2(seed+12.,p.y*7.-time*.7));
 float right=.95-.17*noise2(vec2(seed+54.,p.y*6.-time*.8));
 float edge=smoothstep(left,left+.045,p.x)*(1.-smoothstep(right-.045,right,p.x));
 float tip=.98-.12*pow(abs(p.x-.5)*2.,2.);
 float tail=1.-smoothstep(tip-.08,tip,p.y);
 float cells=noise2(vec2(p.x*65.+seed,p.y*180.-flow*7.));
 float froth=foam*(.76+.24*n)*(1.-.42*smoothstep(.78,.95,n));
 float streak=pow(max(0.,sin(p.x*42.+n*3.)),18.);
 vec3 amber=mix(vec3(.74,.32,.035),vec3(1.,.78,.23),n);
 vec3 cream=mix(vec3(.83,.80,.69),vec3(1.,.995,.96),cells);
 vec3 col=mix(amber,cream,froth);col+=streak*.22;
 float alpha=edge*tail*strength*mix(.40,.95,froth);
 if(alpha<.025)discard;gl_FragColor=vec4(col,alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`,
  });
}

export class BeerOverflow {
  constructor(scene, glass) {
    this.glass = glass;
    this.group = new T.Group(); scene.add(this.group);
    this.activity = 0; this.age = 0; this.lastSpilled = 0;
    this.origin = new T.Vector3(); this.point = new T.Vector3();
    this.dummy = new T.Object3D();
    this.films = [];
    // Deliberately unequal widths and lengths. Foam runs in a few patches, not a cage.
    for (const [i, phase, width, length] of [[0,.98,1.05,1],[1,1.95,.42,.76],[2,.12,.25,.58],[3,3.5,.29,.86]]) {
      const geometry = new T.PlaneGeometry(1,1,10,28);
      const material = filmMaterial(i * 7.13);
      const mesh = new T.Mesh(geometry,material);
      mesh.frustumCulled = false; mesh.renderOrder = 5;
      this.group.add(mesh); this.films.push({mesh,phase,width,length});
    }
    this.drops = new T.InstancedMesh(new T.SphereGeometry(1,8,6),new T.MeshPhysicalMaterial({
      color:0xffd995,roughness:.04,metalness:0,transparent:true,opacity:.44,clearcoat:1,depthWrite:false,
    }),24);
    this.drops.frustumCulled=false;this.drops.renderOrder=6;this.group.add(this.drops);
    this.puddle = new T.Mesh(new T.PlaneGeometry(2,2,1,1),new T.ShaderMaterial({
      transparent:true,depthWrite:false,side:T.DoubleSide,
      uniforms:{time:{value:0},wet:{value:0}},vertexShader:vertex,
      fragmentShader:`varying vec2 vUv;uniform float time,wet;${noise}
void main(){vec2 p=(vUv-.5)*2.;float a=atan(p.y,p.x);float r=length(p);
 float boundary=.79+.08*sin(a*5.+1.)+.035*sin(a*11.);
 float edge=1.-smoothstep(boundary-.06,boundary,r);
 float ripple=pow(.5+.5*sin(r*53.-time*5.),16.)*.14;
 float foam=smoothstep(boundary-.13,boundary-.07,r)*noise2(p*35.)*.45;
 vec3 col=mix(vec3(.93,.53,.08),vec3(.98,.98,.92),foam)+ripple;
 gl_FragColor=vec4(col,edge*wet*(.31+foam));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`,
    }));
    this.puddle.rotation.x=-Math.PI/2;this.puddle.position.set(-.5,.079,.15);this.puddle.renderOrder=2;this.group.add(this.puddle);
    this.splashes = new T.InstancedMesh(new T.TorusGeometry(1,.025,5,28),new T.MeshBasicMaterial({color:0xffe7aa,transparent:true,opacity:.18,depthWrite:false}),6);
    this.splashes.frustumCulled=false;this.group.add(this.splashes);
  }
  render(g, dt) {
    if(g.spilled < this.lastSpilled) {this.activity=0;this.age=0;}
    this.lastSpilled=g.spilled;
    const frozen=["paused","tasting","result"].includes(g.phase);
    const step=frozen?0:Math.min(dt,.1);
    const active=g.spillFlash>.1;
    this.activity=lerp(this.activity,active?1:0,1-Math.exp(-step*(active?7:4)));
    if(active)this.age+=step;else if(this.activity<.03)this.age=0;
    const t=g.clock, angle=g.angle*Math.PI/180;
    this.glass.updateMatrixWorld(true);
    const airborne=clamp((angle-.1)/.65,0,1);
    const foam=clamp(g.foam*5.5,.08,.95);
    for(let i=0;i<this.films.length;i++){
      const f=this.films[i],m=f.mesh,attr=m.geometry.attributes.position;
      m.visible=this.activity>.025;
      const phase=lerp(f.phase,Math.PI+(i-1.5)*.16,airborne);
      this.origin.set(Math.cos(phase)*.545,1.78,Math.sin(phase)*.545);this.glass.localToWorld(this.origin);
      const growth=clamp(this.age*(.8+i*.2),0,1);
      const length=f.length*growth*(.9+.1*Math.sin(t*1.6+i*2));
      for(let row=0;row<=28;row++)for(let col=0;col<=10;col++){
        const v=row/28,u=col/10,y=1.79-v*1.70*length;
        const width=f.width*(1-.55*v)*(1+.045*Math.sin(v*13-t*3+i));
        const theta=phase+(u-.5)*width+.018*Math.sin(v*17-t*4+i)*v;
        const radius=.398+.145*clamp(y/1.78,0,1)+.008+Math.sin(v*25-t*5)*.003;
        this.point.set(Math.cos(theta)*radius,y,Math.sin(theta)*radius);this.glass.localToWorld(this.point);
        const dropY=this.origin.y-(this.origin.y-.09)*v*length;
        this.point.x=lerp(this.point.x,this.origin.x+(u-.5)*width*.46+Math.sin(v*13-t*4+i)*v*.025,airborne);
        this.point.y=lerp(this.point.y,dropY,airborne);
        this.point.z=lerp(this.point.z,this.origin.z+(u-.5)*width*.16+v*.06,airborne);
        attr.setXYZ(row*11+col,this.point.x,this.point.y,this.point.z);
        // PlaneGeometry's native v is inverted relative to downward flow.
        m.geometry.attributes.uv.setXY(row*11+col,u,v);
      }
      attr.needsUpdate=true;m.geometry.attributes.uv.needsUpdate=true;
      const uniforms=m.material.uniforms;uniforms.time.value=t;uniforms.strength.value=this.activity;uniforms.foam.value=foam;
    }
    // Gravity accelerates droplets and stretches them as they fall.
    const phase=lerp(.98,Math.PI,airborne);
    this.origin.set(Math.cos(phase)*.56,1.75,Math.sin(phase)*.56);this.glass.localToWorld(this.origin);
    for(let i=0;i<24;i++){
      const life=(t*(.8+(i%7)*.07)+i*.618)%1;
      const tau=life*.62;
      const offset=Math.sin(i*12.3)*.16;
      // At rest the liquid clings to the glass and detaches near the base.
      // A tilted glass spills freely from its low rim instead.
      const startY=lerp(.26+(i%3)*.11,this.origin.y,airborne);
      const y=startY-.25*tau-4.9*tau*tau;
      const size=.006+(i%5)*.0018;
      const visible=this.activity>.04&&life<Math.min(.7,this.activity)&&y>.09;
      this.dummy.position.set(this.origin.x+offset+Math.sin(i*9)*tau*.13,y,this.origin.z+offset*.35+tau*.12);
      this.dummy.rotation.set(0,0,Math.sin(i)*.08);
      this.dummy.scale.set(size,size*(1+tau*2),size);
      if(!visible)this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();this.drops.setMatrixAt(i,this.dummy.matrix);
    }
    this.drops.instanceMatrix.needsUpdate=true;
    this.puddle.visible=g.spilled>.001;
    const spread=Math.min(1.65,.30+Math.sqrt(g.spilled)*.9);
    this.puddle.position.x=-.35+this.origin.x*.35;
    this.puddle.scale.set(spread,spread*.72,1);
    this.puddle.material.uniforms.time.value=t;
    this.puddle.material.uniforms.wet.value=clamp(g.spilled*30,0,1);
    for(let i=0;i<6;i++){
      const life=(t*1.8+i*.273)%1,r=.015+life*.09;
      this.dummy.position.set(this.origin.x+Math.sin(i*3)*.23,.085,this.origin.z+Math.cos(i*3)*.15);
      this.dummy.rotation.set(Math.PI/2,0,0);
      this.dummy.scale.set(r,r,.4);
      if(!active||life>.85)this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();this.splashes.setMatrixAt(i,this.dummy.matrix);
    }
    this.splashes.instanceMatrix.needsUpdate=true;
  }
}
