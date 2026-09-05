import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Course } from './course';
import { roadFrame } from './road-geometry';

// Original procedural scenery, composed into material batches to keep racing smooth.
export class FestivalScenery {
  readonly root=new T.Group();
  private readonly stage=new T.Group();
  private readonly wind={value:0};
  private readonly balloons:T.Group[]=[];
  private readonly startLights:T.Mesh[]=[];
  private readonly materials=new Map<string,T.MeshStandardMaterial>();
  private readonly panels=new Map<string,T.MeshBasicMaterial>();
  private readonly cube=new T.BoxGeometry(1,1,1);
  private readonly sphere=new T.SphereGeometry(1,12,8);
  private readonly cylinder=new T.CylinderGeometry(1,1,1,12);
  constructor(private readonly course:Course,private readonly ground:(x:number,z:number)=>number,private readonly blocked:(point:T.Vector3,radius:number)=>boolean=()=>false) {
    this.clouds();this.landmarks();this.stadium();this.signs();this.sectorDetails();this.compile();
  }
  private material(color:string) {let m=this.materials.get(color);if(!m){m=new T.MeshStandardMaterial({color,roughness:.83});this.materials.set(color,m);}return m;}
  private add(g:T.BufferGeometry,color:string,parent:T.Object3D,position:number[],scale:number[]) {
    const m=new T.Mesh(g,this.material(color));m.position.fromArray(position);m.scale.fromArray(scale);parent.add(m);return m;
  }
  private point(s:number,lane:number) {
    const p=this.course.position(s,lane);p.y=this.ground(p.x,p.z);return p;
  }
  private group(s:number,lane:number) {const g=new T.Group();g.position.copy(this.point(s,lane));g.rotation.y=this.course.at(s).heading;this.stage.add(g);return g;}
  private clear(p:T.Vector3,radius:number) {return !this.blocked(p,radius)&&!this.course.samples.some((road,i)=>i%6===0&&Math.hypot(road.p.x-p.x,road.p.z-p.z)<radius+10+this.course.maxShoulder(i/this.course.resolution*this.course.length)&&Math.abs(road.p.y-p.y)<18);}
  private clouds() {
    for(let i=0;i<32;i++) {
      const angle=i*2.39996,r=300+(i%5)*75,base=new T.Vector3(Math.cos(angle)*r,115+i%7*13,Math.sin(angle)*r-50);
      for(let j=0;j<5;j++)this.add(this.sphere,'#ffffff',this.stage,[base.x+j*11-22,base.y+(j===2?5:0),base.z],[15,6+(j%3)*2.3,9]);
    }
  }
  private mushroom(s:number,lane:number,size:number,color:string) {
    const g=this.group(s,lane);if(!this.clear(g.position,size*1.1)){this.stage.remove(g);return;}
    this.add(this.cylinder,'#fff3cb',g,[0,size*.62,0],[size*.27,size*1.25,size*.27]);
    this.add(this.sphere,color,g,[0,size*1.4,0],[size,size*.48,size]);
    this.add(this.cylinder,'#fff8dc',g,[0,size*1.22,0],[size*.86,.2,size*.86]);
    for(let i=0;i<6;i++){const a=i/6*Math.PI*2,r=size*.65;this.add(this.sphere,'#fffbe6',g,[Math.sin(a)*r,size*1.64,Math.cos(a)*r],[size*.19,size*.055,size*.22]);}
    this.add(this.sphere,'#fffbe6',g,[0,size*1.85,0],[size*.28,size*.06,size*.23]);
    for(const x of [-.095,.095])this.add(this.sphere,'#343439',g,[x*size,size*.87,-size*.257],[size*.025,size*.11,size*.025]);
  }
  private pipe(s:number,lane:number,height:number,color:string) {
    const g=this.group(s,lane);if(!this.clear(g.position,2.8)){this.stage.remove(g);return;}
    this.add(this.cylinder,color,g,[0,height/2,0],[2.1,height,2.1]);
    this.add(this.cylinder,color,g,[0,height-.25,0],[2.65,1.2,2.65]);
    this.add(this.cylinder,'#155d36',g,[0,height+.37,0],[2.13,.05,2.13]);
    this.add(this.cylinder,'#071f22',g,[0,height+.4,0],[1.74,.025,1.74]);
    this.add(this.cube,'#b0ff85',g,[-1.5,height/2,-1.3],[.25,height-.8,.1]);
  }
  private palm(s:number,lane:number,size:number) {
    const g=this.group(s,lane);if(!this.clear(g.position,3.8)){this.stage.remove(g);return;}
    const trunk=this.add(this.cylinder,'#c68b47',g,[0,size*.5,0],[.43,size,.43]);trunk.rotation.z=.1;
    for(let j=0;j<5;j++)this.add(this.cylinder,'#a77032',g,[-j*.12,size*.18+j*size*.15,0],[.46,.12,.46]);
    for(let j=0;j<7;j++){
      const a=j/7*Math.PI*2,leaf=this.add(this.sphere,j%2?'#53cb34':'#269c32',g,[Math.sin(a)*2.2-.6,size,Math.cos(a)*2.2],[.75,.3,3.7]);leaf.rotation.set(.12,a,.1);
    }
    for(let j=0;j<3;j++)this.add(this.sphere,'#8d5b2e',g,[Math.sin(j*2)*.6-.6,size-.45,Math.cos(j*2)*.6],[.47,.5,.47]);
  }
  private landmarks() {
    const len=this.course.length;
    for(let i=0;i<40;i++){
      const s=45+i*len/40;if(this.course.inVoid(s))continue;
      const side=i%2?1:-1;
      if(i%3===0)this.mushroom(s,side*(23+i%4*5),4+i%4*1.6,['#f04444','#ffbc24','#925ff3'][Math.floor(i/3)%3]);
      else if(i%3===1)this.pipe(s,side*(16+i%4*3),4+i%3*2,['#27bc48','#f2c32c','#f95755'][Math.floor(i/3)%3]);
      this.palm(s+18,-side*(18+i%3*4),8+i%4);
    }
    // Giant, readable landmarks at the mountain switchbacks and on the gliding approach.
    this.pipe(150,20,6,'#27bc48');
    this.mushroom(len*.25,-33,11,'#f14348');this.mushroom(len*.3,36,15,'#f5b72d');
    this.mushroom(len*.58,-31,12,'#8860eb');
    for(let i=0;i<8;i++)this.palm(20+i*21,i%2?21:-21,9+i%3);
    for(let i=0;i<100;i++){
      const s=35+i*len/100;if(this.course.inVoid(s))continue;
      const lane=(i%2?1:-1)*(13+i%3*2),p=this.point(s,lane);if(!this.clear(p,.6))continue;
      const g=this.group(s,lane),color=['#ffe54b','#ff7685','#ffffff'][i%3];
      this.add(this.cylinder,'#2b973d',g,[0,.6,0],[.06,1.2,.06]);
      for(let j=0;j<5;j++){const a=j*Math.PI*2/5;this.add(this.sphere,color,g,[Math.sin(a)*.32,1.15,Math.cos(a)*.32],[.27,.14,.27]);}
      this.add(this.sphere,'#f6a825',g,[0,1.25,0],[.2,.16,.2]);
    }
    for(let i=0;i<6;i++){
      const g=new T.Group();g.position.copy(this.course.position(i*len/6,40,38+i%3*9));g.userData.baseY=g.position.y;
      const color=['#ff4c55','#ffd52e','#20bee6'][i%3];
      this.add(this.sphere,color,g,[0,0,0],[4,5.5,4]);
      this.add(this.cylinder,'#fff6d2',g,[0,-4,0],[2.8,1,2.8]);
      this.add(this.cube,'#aa773b',g,[0,-8,0],[2,1.3,2]);
      for(const x of [-.8,.8])this.add(this.cylinder,'#fff2d1',g,[x,-6.7,0],[.04,2.5,.04]);
      this.root.add(g);this.balloons.push(g);
    }
  }
  private panel(text:string,width:number,height:number,color:string) {
    const key=text+color;let material=this.panels.get(key);
    if(!material){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d')!;
    ctx.fillStyle=color;ctx.fillRect(0,0,1024,256);ctx.strokeStyle='#ffffff';ctx.lineWidth=18;ctx.strokeRect(12,12,1000,232);
    ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='italic 900 115px Arial';ctx.fillText(text,512,139,930);
    const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
    material=new T.MeshBasicMaterial({map:tex,side:T.DoubleSide});this.panels.set(key,material);
    }
    const m=new T.Mesh(new T.PlaneGeometry(width,height),material);m.rotation.y=Math.PI;return m;
  }
  private stadium() {
    const c=this.course;
    const arch=this.group(0,0);arch.position.copy(c.position(0));
    for(const side of [-1,1]) {
      this.add(this.cube,'#247bcc',arch,[side*10,4.6,0],[1.4,9.2,2]);
      this.add(this.cube,'#ffd438',arch,[side*10,1,0],[2.1,2.0,2.6]);
      for(let y=0;y<8;y++)for(let x=0;x<2;x++)this.add(this.cube,(x+y)%2?'#ffffff':'#172a57',arch,[side*10+(x-.5)*.65,2+y*.75,-1.02],[.65,.75,.05]);
      const cap=this.add(this.sphere,'#ffcf2a',arch,[side*10,9.2,0],[1.25,1.25,1.25]);cap.rotation.z=.2;
    }
    this.add(this.cube,'#e63542',arch,[0,8.35,0],[19.2,2.4,1.2]);
    this.add(this.cube,'#ffd438',arch,[0,9.65,0],[20.5,.3,1.4]);
    const label=this.panel('OPENKART ASTRA',18,1.9,'#e63542');label.position.set(0,8.3,-.62);arch.add(label);
    const signals=new T.Group();signals.position.copy(c.position(0));signals.rotation.y=c.at(0).heading;this.root.add(signals);
    for(let k=-2;k<=2;k++){
      const light=new T.Mesh(this.sphere,new T.MeshStandardMaterial({color:'#303655',emissive:'#000000',roughness:.25}));
      light.position.set(k*.9,6.65,-.1);light.scale.set(.29,.29,.22);signals.add(light);this.startLights.push(light);
    }
    for(const side of [-1,1]){
      const stand=this.group(12,side*24);stand.rotation.y=c.at(12).heading;
      for(let row=0;row<5;row++){
        const x=side*(-6+row*1.5);
        this.add(this.cube,row%2?'#378fde':'#f4f9fc',stand,[x,row*.8+.5,0],[1.5,1,36]);
        for(let seat=0;seat<24;seat++){
          const z=-16.5+seat*1.43,y=row*.8+1.35,color=['#ff4549','#ffd028','#57d460','#9c60ee','#37ccec'][(seat+row*2)%5];
          this.add(this.sphere,color,stand,[x,y,z],[.37,.45,.36]);
          this.add(this.sphere,'#ffe3b1',stand,[x,y+.48,z],[.26,.27,.26]);
        }
      }
      for(const z of [-19,19])this.add(this.cylinder,'#347cb3',stand,[side*3,5,z],[.18,10,.18]);
      this.add(this.cube,'#ffcf27',stand,[side*1,10,0],[12,.45,40]);
      for(let k=0;k<10;k++)this.add(this.cube,k%2?'#fff7e1':'#f54c50',stand,[side*1,9.2,-18+k*4],[12,1.1,2]);
      const board=this.panel('GRAND PRIX',14,2.3,'#1d82d5');board.position.set(side*7,3.5,0);board.rotation.y=side>0?Math.PI/2:-Math.PI/2;stand.add(board);
    }
    // Small grid slots clarify the start line.
    for(let i=0;i<8;i++){
      const s=-7-Math.floor(i/2)*5,lane=i%2?3:-3,g=this.group(s,lane);g.position.copy(c.position(s,lane,.09));g.quaternion.copy(roadFrame(c,s,lane).quaternion);
      this.add(this.cube,'#fff6cd',g,[0,0,0],[2.8,.035,.12]);
      for(const side of [-1,1])this.add(this.cube,'#fff6cd',g,[side*1.35,0,-.55],[.1,.035,1.2]);
    }
  }
  private signs() {
    const flagMaterials=['#ff4c54','#ffcf27','#1ebfea','#68d039'].map(color=>{
      const material=new T.MeshStandardMaterial({color,side:T.DoubleSide,roughness:.8});
      material.onBeforeCompile=shader=>{shader.uniforms.festivalTime=this.wind;shader.vertexShader='uniform float festivalTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed.y += sin(festivalTime * 3. + position.x * .6 + position.z * .5) * .08;');};
      return material;
    });
    for(let s=60;s<this.course.length;s+=29){
      if(this.course.inVoid(s)||s>this.course.tunnel[0]-10&&s<this.course.tunnel[1]+10)continue;
      const road=this.course.at(s),turn=road.curvature;
      if(Math.abs(turn)>.009){
        const side=turn>0?-1:1,g=this.group(s,side*11.1);g.position.copy(this.course.position(s,side*11.1));
        this.add(this.cube,'#1b70b5',g,[0,1.4,0],[.17,2.8,.17]);
        const sign=this.panel(turn>0?'❯ ❯ ❯':'❮ ❮ ❮',4.8,1.65,'#ffbf20');sign.position.set(0,2.9,0);g.add(sign);
      }
    }
    for(let s=42;s<this.course.length;s+=84){
      if(this.course.inVoid(s)||this.course.maxShoulder(s)>0)continue;
      const road=this.course.at(s),g=this.group(s,0);g.position.copy(road.p);
      for(const side of [-1,1])this.add(this.cylinder,'#f8faf1',g,[side*10.8,3,0],[.12,6,.12]);
      const line=this.add(this.cylinder,'#345779',g,[0,5.8,0],[.025,21.5,.025]);line.rotation.z=Math.PI/2;
      for(let i=0;i<13;i++){
        const triangle=new T.BufferGeometry();triangle.setAttribute('position',new T.Float32BufferAttribute([-.6,0,0,.6,0,0,0,-.9,0],3));triangle.computeVertexNormals();
        const material=flagMaterials[i%4];
        const pennant=new T.Mesh(triangle,material);pennant.position.copy(this.course.position(s,(i-6)*1.5,5.8));pennant.rotation.y=road.heading;this.stage.add(pennant);
      }
    }
  }
  private sectorDetails() {
    const c=this.course;
    // Retaining masonry makes the low road sections meet the island instead of floating.
    const wallPositions:number[]=[],wallUvs:number[]=[],wallIndices:number[]=[];
    for(const side of [-1,1])for(let s=0;s<c.length;s+=2) {
      const end=Math.min(s+2,c.length);if(c.inVoid((s+end)/2))continue;
      const a=c.position(s,c.railLane(s,side),-.55),b=c.position(end,c.railLane(end,side),-.55);
      const groundA=this.ground(a.x,a.z),groundB=this.ground(b.x,b.z);
      if(Math.max(a.y-groundA,b.y-groundB)>8||Math.min(groundA,groundB)<0)continue;
      const k=wallPositions.length/3;
      wallPositions.push(a.x,a.y,a.z,a.x,groundA-.2,a.z,b.x,b.y,b.z,b.x,groundB-.2,b.z);
      wallUvs.push(s/4,a.y/2,s/4,groundA/2,end/4,b.y/2,end/4,groundB/2);
      wallIndices.push(k,k+1,k+2,k+1,k+3,k+2);
    }
    const blocks=document.createElement('canvas');blocks.width=256;blocks.height=128;const ctx=blocks.getContext('2d')!;
    ctx.fillStyle='#777b72';ctx.fillRect(0,0,256,128);
    for(let row=0;row<4;row++)for(let col=-1;col<5;col++){
      ctx.fillStyle=['#b3ad97','#a3a38e','#beb69f'][(row+col+6)%3];
      ctx.fillRect(col*64+(row%2)*32+1,row*32+1,61,29);
    }
    const blockMap=new T.CanvasTexture(blocks);blockMap.colorSpace=T.SRGBColorSpace;blockMap.wrapS=blockMap.wrapT=T.RepeatWrapping;blockMap.anisotropy=8;
    const wall=new T.BufferGeometry();wall.setAttribute('position',new T.Float32BufferAttribute(wallPositions,3));wall.setAttribute('uv',new T.Float32BufferAttribute(wallUvs,2));wall.setIndex(wallIndices);wall.computeVertexNormals();
    this.stage.add(new T.Mesh(wall,new T.MeshStandardMaterial({map:blockMap,roughness:1,side:T.DoubleSide})));
    // Grounded quay promenades, lamps, mooring hardware and boats form a legible harbor district.
    for(let i=0;i<12;i++) {
      const s=28+i*15,lane=13.5,point=c.position(s,lane,-.7);if(this.blocked(point,5.8))continue;
      const g=this.group(s,lane);g.position.copy(point);
      const h=g.position.y-this.ground(g.position.x,g.position.z);
      this.add(this.cube,'#c6b799',g,[0,-Math.max(.5,h)/2,0],[3,Math.max(.5,h),10]);
      this.add(this.cube,'#e9d9b7',g,[0,.12,0],[3.5,.24,10.5]);
      const lamp=new T.Group();lamp.position.set(-.8,.2,-3);g.add(lamp);
      this.add(this.cylinder,'#304d53',lamp,[0,2.7,0],[.09,5.4,.09]);
      this.add(this.cylinder,'#304d53',lamp,[0,.23,0],[.24,.46,.24]);
      this.add(this.cube,'#f8e6a0',lamp,[0,5.5,0],[.45,.62,.45]);
      this.add(new T.ConeGeometry(1,1,4),'#304d53',lamp,[0,5.95,0],[.46,.24,.46]);
      if(i%3===0){
        const bench=this.add(this.cube,'#9e6438',g,[.2,.7,1],[1.5,.15,2.6]);bench.rotation.y=Math.PI/2;
        for(const z of [.1,1.9])this.add(this.cube,'#344a45',g,[.2,.38,z],[.12,.7,1.2]);
        this.add(this.cube,'#9e6438',g,[-.35,1.14,1],[.12,.7,2.6]);
      }
    }
    for(let i=0;i<6;i++){
      const s=45+i*25,p=c.position(s,57+i%2*8);if(this.ground(p.x,p.z)>-.5)continue;
      const boat=new T.Group();boat.position.set(p.x,-.25,p.z);boat.rotation.y=c.at(s).heading+.4;this.stage.add(boat);
      const hull=this.add(this.sphere,i%2?'#cc5548':'#246b8c',boat,[0,0,0],[2,1.1,5]);
      this.add(this.cube,'#e9dfc7',boat,[0,.5,0],[3,.35,6.5]);
      this.add(this.cube,'#f5e9c8',boat,[0,1.3,.4],[2,1.4,2.8]);
      this.add(this.cube,'#325d73',boat,[0,1.5,-1.03],[1.55,.65,.035]);
      this.add(this.cylinder,'#776249',boat,[0,4,0],[.055,6.5,.055]);
      const sail=new T.BufferGeometry();sail.setAttribute('position',new T.Float32BufferAttribute([.1,2.1,0,.1,7.1,0,3.1,2.1,0],3));sail.computeVertexNormals();
      const sailMaterial=this.material('#f7f0d8').clone();sailMaterial.side=T.DoubleSide;boat.add(new T.Mesh(sail,sailMaterial));
      hull.rotation.z=.02;
    }
    // Switchback crash protection and small, grounded outcrops keep mountain corners readable.
    for(let s=c.length*.16;s<c.length*.7;s+=19) {
      if(c.inFlight(s))continue;
      const side=c.at(s).curvature>0?-1:1;
      for(let j=0;j<3;j++){
        const g=this.group(s+j*1.8,side*11.2);g.position.copy(c.position(s+j*1.8,side*11.2,-.5));
        this.add(this.cylinder,j%2?'#f0e6cc':'#c23b39',g,[0,.35,0],[.75,.7,.75]);
        this.add(this.cylinder,'#393e3b',g,[0,.71,0],[.42,.025,.42]);
      }
    }
  }

  private compile() {
    this.stage.updateMatrixWorld(true);
    const buckets=new Map<T.Material,T.BufferGeometry[]>();
    this.stage.traverse(object=>{if(!(object instanceof T.Mesh))return;const material=object.material as T.Material;const list=buckets.get(material)??[];list.push(object.geometry.clone().applyMatrix4(object.matrixWorld));buckets.set(material,list);});
    for(const [material,geometries]of buckets){const geo=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());if(!geo)continue;const m=new T.Mesh(geo,material);m.castShadow=true;m.receiveShadow=true;this.root.add(m);}
    this.stage.clear();
  }
  update(time:number,signal=-1){
    this.startLights.forEach((light,i)=>{const active=signal===0||(signal>0&&i<Math.ceil((3-signal)/3*5));const color=signal===0?'#50ff65':'#ff3248';const material=light.material as T.MeshStandardMaterial;material.color.set(active?color:'#303655');material.emissive.set(active?color:'#000000');material.emissiveIntensity=.7;});
    this.wind.value=time;
    this.balloons.forEach((g,i)=>{g.position.y=Number(g.userData.baseY)+Math.sin(time*.5+i)*1.2;g.rotation.y=Math.sin(time*.15+i)*.2;});
  }
}
