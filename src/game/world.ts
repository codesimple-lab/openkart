import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { ItemBoxes } from './items';
import { ITEM_BOX_SIZE } from './pickup-contact';
import { Course, clamp } from './course';
import { HarborDistrict } from './harbor-district';
import { harborPaving } from './surface-materials';
import { FestivalScenery } from './festival-scenery';
import { roadRibbon, roadDecal, roadFrame } from './road-geometry';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tunnelOpenings } from './tunnel-opening';

const mat=(color:string,roughness=.8,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});
function mesh(g:T.BufferGeometry,m:T.Material,parent:T.Object3D,p=[0,0,0],scale=[1,1,1]) {
  const result=new T.Mesh(g,m);result.position.set(...p as [number,number,number]);result.scale.set(...scale as [number,number,number]);result.castShadow=true;result.receiveShadow=true;parent.add(result);return result;
}
function batch(scene:T.Scene,geometry:T.BufferGeometry,material:T.Material,matrices:T.Matrix4[],shadows=true) {
  const inst=new T.InstancedMesh(geometry,material,matrices.length);matrices.forEach((m,i)=>inst.setMatrixAt(i,m));inst.castShadow=shadows;inst.receiveShadow=true;inst.computeBoundingSphere();scene.add(inst);return inst;
}
function textTexture(text:string,color='#f2ebd9',bg='#204d56',width=1024,height=128) {
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);ctx.fillStyle=color;ctx.font=`900 ${height*.57}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,width/2,height*.53,width*.93);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;return texture;
}
export class World {
  readonly scene=new T.Scene();
  readonly sun=new T.DirectionalLight('#fff4dc',3.0);
  private readonly festival:FestivalScenery;
  private readonly district:HarborDistrict;
  readonly water:T.Mesh;
  readonly animated:T.Object3D[]=[];
  private readonly bursts:T.Group[]=[];
  private readonly waterUniforms={time:{value:0}};
  constructor(readonly course:Course,renderer:T.WebGLRenderer,readonly itemBoxes:ItemBoxes) {
    const scene=this.scene;scene.background=new T.Color('#53c5f4');scene.fog=new T.FogExp2('#8addfa',.00075);
    const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();
    scene.environment=pmrem.fromScene(room,.04).texture;scene.environmentIntensity=.28;room.dispose();pmrem.dispose();
    scene.add(new T.HemisphereLight('#dff7ff','#778563',1.05));
    this.sun.position.set(-70,110,-40);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);
    Object.assign(this.sun.shadow.camera,{left:-65,right:65,top:65,bottom:-65,near:1,far:240});
    this.sun.shadow.bias=-.0004;this.sun.shadow.normalBias=.025;scene.add(this.sun,this.sun.target);
    const sky=new T.Mesh(new T.SphereGeometry(1400,32,20),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{},vertexShader:'varying vec3 v; void main(){ v=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec3 v; void main(){vec3 d=normalize(v);float h=max(0.,d.y);vec3 c=mix(vec3(.67,.90,1.),vec3(.025,.46,.94),pow(h,.6));float sun=pow(max(dot(d,normalize(vec3(-.55,.5,-.7))),0.),650.);c+=vec3(1.,.79,.43)*sun*.8;gl_FragColor=vec4(c,1.);}` }));scene.add(sky);
    this.water=new T.Mesh(new T.PlaneGeometry(2800,2800,1,1),new T.ShaderMaterial({uniforms:this.waterUniforms,vertexShader:`varying vec3 v; void main(){v=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(v,1.);}`,fragmentShader:`uniform float time; varying vec3 v;
      void main(){vec3 eye=normalize(cameraPosition-v);float a=sin(v.x*.28+v.z*.19+time*1.4);float b=sin(v.z*.56-v.x*.12+time*2.);float c=sin(v.x*.9+v.z*.71-time*.8);float wave=a*.5+b*.3+c*.2;vec3 n=normalize(vec3(wave*.08,1.,cos(v.z*.25+time)*.06));float fres=pow(1.-max(dot(eye,n),0.),4.);float spec=pow(max(dot(reflect(normalize(vec3(.55,-.8,.3)),n),eye),0.),160.);vec3 col=mix(vec3(.0,.48,.72),vec3(.36,.86,.96),fres);col+=wave*.018+spec*vec3(1.,.83,.55);gl_FragColor=vec4(col,1.);}` }));
    this.water.rotation.x=-Math.PI/2;this.water.position.y=-1;scene.add(this.water);
    this.district=new HarborDistrict(course,(x,z)=>this.terrainAt(x,z));scene.add(this.district.root);
    this.buildTerrain();this.buildRoad();this.buildDetails();this.buildTunnel();this.buildHarbor();
    this.festival=new FestivalScenery(course,(x,z)=>this.terrainAt(x,z),(point,radius)=>this.district.occupies(point,radius));scene.add(this.festival.root);
  }
  private terrainAt(x:number,z:number):number {
    const edge=Math.sqrt((x/265)**2+((z+50)/310)**2);
    let h=5+Math.sin(x*.028)*4+Math.sin(z*.031)*3;
    h+=48*Math.exp(-((x-35)**2+(z+70)**2)/13000)+25*Math.exp(-((x-100)**2+(z+185)**2)/7500);
    let nearest=Infinity,roadY=0,roadBank=0,roadDistance=0;
    for(let i=0;i<this.course.samples.length;i+=8) {
      const a=this.course.samples[i],b=this.course.samples[(i+8)%this.course.samples.length];
      const dx=b.p.x-a.p.x,dz=b.p.z-a.p.z;
      const t=clamp(((x-a.p.x)*dx+(z-a.p.z)*dz)/(dx*dx+dz*dz),0,1);
      const d=(a.p.x+t*dx-x)**2+(a.p.z+t*dz-z)**2;
      if(d<nearest){nearest=d;roadDistance=(i+t*8)/this.course.resolution*this.course.length;roadY=T.MathUtils.lerp(a.p.y,b.p.y,t);roadBank=T.MathUtils.lerp(a.bank,b.bank,t);}
    }
    const shoulder=this.course.maxShoulder(roadDistance);
    if(nearest<1000)h=Math.min(h,roadY-Math.abs(Math.sin(roadBank))*(9+shoulder)-.95+Math.max(0,Math.sqrt(nearest)-12-shoulder)*.3);
    h-=Math.max(0,edge-.75)*65;
    return h;
  }
  private buildTerrain() {
    const g=new T.PlaneGeometry(610,670,145,155);g.rotateX(-Math.PI/2);g.translate(0,0,-45);
    const positions=g.attributes.position,colors=[];const sand=new T.Color('#dfc78f'),grass=new T.Color('#82ad50'),stone=new T.Color('#a0a47a');
    for(let i=0;i<positions.count;i++) {
      const x=positions.getX(i),z=positions.getZ(i),height=this.terrainAt(x,z);positions.setY(i,height);
      const color=sand.clone().lerp(grass,clamp((height-1)/8,0,1)).lerp(stone,clamp((height-25)/30,0,1));
      color.multiplyScalar(.93+(Math.sin(x*.16+z*.11)+1)*.045);colors.push(color.r,color.g,color.b);
    }
    g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeVertexNormals();
    mesh(g,new T.MeshStandardMaterial({vertexColors:true,roughness:1}),this.scene);
    const trees:T.Matrix4[]=[],trunks:T.Matrix4[]=[],rocks:T.Matrix4[]=[];const dummy=new T.Object3D();
    const random=(i:number,k:number)=>{const v=Math.sin(i*127.1+k*311.7)*43758.5453;return v-Math.floor(v);};
    for(let i=0;i<720;i++) {
      const x=(random(i,1)-.5)*480,z=(random(i,2)-.5)*560-40,y=this.terrainAt(x,z);
      if(y<4||this.district.occupies(new T.Vector3(x,y,z),4.5))continue;
      if(this.course.samples.some((s,j)=>j%9===0&&(s.p.x-x)**2+(s.p.z-z)**2<(17+this.course.maxShoulder(j/this.course.resolution*this.course.length))**2))continue;
      const height=4+random(i,3)*7;
      dummy.position.set(x,y+height*.5,z);dummy.rotation.set(0,random(i,4)*6,0);dummy.scale.set(height*.5,height,height*.5);dummy.updateMatrix();trees.push(dummy.matrix.clone());
      dummy.position.y=y+height*.68;dummy.scale.set(height*.38,height*.72,height*.38);dummy.updateMatrix();trees.push(dummy.matrix.clone());
      dummy.position.y=y+height*.86;dummy.scale.set(height*.25,height*.48,height*.25);dummy.updateMatrix();trees.push(dummy.matrix.clone());
      dummy.position.y=y+1;dummy.scale.set(.24,2,.24);dummy.updateMatrix();trunks.push(dummy.matrix.clone());
    }
    for(let i=0;i<110;i++) {
      const x=(random(i,5)-.5)*540,z=(random(i,6)-.5)*620-45,y=this.terrainAt(x,z);
      if(y<-5||this.district.occupies(new T.Vector3(x,y,z),9)||this.course.samples.some((s,j)=>j%9===0&&(s.p.x-x)**2+(s.p.z-z)**2<(19+this.course.maxShoulder(j/this.course.resolution*this.course.length))**2))continue;
      const size=2+random(i,7)*7;dummy.position.set(x,y,z);dummy.rotation.set(random(i,8),random(i,9)*6,0);dummy.scale.set(size,size*.7,size*.8);dummy.updateMatrix();rocks.push(dummy.matrix.clone());
    }
    batch(this.scene,new T.ConeGeometry(.65,1,7),mat('#399d3c'),trees);
    batch(this.scene,new T.CylinderGeometry(1,1,1,5),mat('#ad793e'),trunks);
    batch(this.scene,new T.IcosahedronGeometry(1,1),mat('#d1b57a'),rocks);
  }
  private buildRoad() {
    const c=this.course,half=c.at(0).width/2;
    const concrete=mat('#a9a89b'),white=mat('#eeeade'),metal=mat('#a6b8bc',.47,.6);
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
    const ctx=canvas.getContext('2d')!,pixels=ctx.createImageData(512,512);
    let seed=1729;
    for(let i=0;i<512*512;i++) {
      seed=(seed*1664525+1013904223)>>>0;
      const value=69+(seed>>>24)*.13;
      pixels.data.set([value*.94,value*.98,value,255],i*4);
    }
    ctx.putImageData(pixels,0,0);
    const asphalt=new T.CanvasTexture(canvas);asphalt.wrapS=asphalt.wrapT=T.RepeatWrapping;
    asphalt.anisotropy=8;asphalt.colorSpace=T.SRGBColorSpace;
    mesh(roadRibbon(c,{left:-half,right:half,uvMeters:2.5}),
      new T.MeshStandardMaterial({map:asphalt,bumpMap:asphalt,bumpScale:.018,roughness:.97}),this.scene).name='banked-asphalt';
    mesh(roadRibbon(c,{start:0,end:270,left:-half,right:half,height:.049,uvMeters:4}),harborPaving(),this.scene).name='harbor-paving';
    // A real deck below the asphalt, including its edges and exposed underside.
    const deck=mat('#b4b1a1');deck.side=T.DoubleSide;
    for(const side of [-1,1]) {
      mesh(roadRibbon(c,{left:s=>c.railLane(s,side)+side*.05,right:s=>c.railLane(s,side)+side*.05,height:-.63,rightHeight:-.02}),deck,this.scene);
    }
    mesh(roadRibbon(c,{left:s=>c.railLane(s,-1)-.05,right:s=>c.railLane(s,1)+.05,height:-.63}),deck,this.scene);
    // Red/white curbs and safety beams follow the spline exactly, without overlapping boxes.
    const curbCanvas=document.createElement('canvas');curbCanvas.width=8;curbCanvas.height=128;
    const curbCtx=curbCanvas.getContext('2d')!;curbCtx.fillStyle='#f0ede4';curbCtx.fillRect(0,0,8,128);
    curbCtx.fillStyle='#d93937';curbCtx.fillRect(0,0,8,64);
    const curbMap=new T.CanvasTexture(curbCanvas);curbMap.wrapS=curbMap.wrapT=T.RepeatWrapping;
    curbMap.colorSpace=T.SRGBColorSpace;curbMap.anisotropy=8;
    const curb=new T.MeshStandardMaterial({map:curbMap,roughness:.86,side:T.DoubleSide});
    metal.side=T.DoubleSide;
    for(const side of [-1,1]) {
      const inner=side*half,outer=side*(half+.65),rail=(s:number)=>c.railLane(s,side);
      const omit=(s:number)=>{const route=c.routeAt(s);if(!route||route.side!==side)return false;const center=Math.abs(c.routeLane(route,s));return center+route.width/2>half-.3&&center-route.width/2<half+.8;};
      mesh(roadRibbon(c,{left:Math.min(inner,outer),right:Math.max(inner,outer),height:.07,uvMeters:6,omit}),curb,this.scene);
      mesh(roadRibbon(c,{left:outer,right:outer,height:-.04,rightHeight:.07,uvMeters:6,omit}),curb,this.scene);
      for(const bottom of [.46,.92]) {
        mesh(roadRibbon(c,{left:rail,right:rail,height:bottom,rightHeight:bottom+.23}),metal,this.scene);
        mesh(roadRibbon(c,{left:s=>rail(s)-.055,right:s=>rail(s)+.055,height:bottom+.23}),metal,this.scene);
      }
      mesh(roadRibbon(c,{left:side*(half-.18)-.07,right:side*(half-.18)+.07,height:.054,omit}),white,this.scene);
    }
    // A banked grass cut follows the same lane coordinates as tyres and barriers.
    const cut=c.shortcut,grassCanvas=document.createElement('canvas');grassCanvas.width=grassCanvas.height=128;
    const grassCtx=grassCanvas.getContext('2d')!;grassCtx.fillStyle='#85bc37';grassCtx.fillRect(0,0,128,128);
    let grassSeed=8721;const grassRandom=()=>{grassSeed=(grassSeed*1664525+1013904223)>>>0;return grassSeed/4294967296;};
    for(let i=0;i<6500;i++){grassCtx.fillStyle=i%2?'#88bc3e':'#7ab035';grassCtx.fillRect(Math.floor(grassRandom()*128),Math.floor(grassRandom()*128),1,1);}
    const grassMap=new T.CanvasTexture(grassCanvas);grassMap.wrapS=grassMap.wrapT=T.RepeatWrapping;grassMap.colorSpace=T.SRGBColorSpace;grassMap.anisotropy=8;
    mesh(roadRibbon(c,{start:cut.start,end:cut.end,left:s=>c.railLane(s,-1)-.05,right:-half-.64,height:.043,uvMeters:3}),new T.MeshStandardMaterial({map:grassMap,roughness:1,side:T.DoubleSide}),this.scene).name='mushroom-grass-shortcut';
    this.buildShortcuts();
    const posts:T.Matrix4[]=[],supports:T.Matrix4[]=[],caps:T.Matrix4[]=[];
    const dummy=new T.Object3D(),dashes:T.BufferGeometry[]=[];
    for(let s=0;s<c.length;s+=4.5) {
      if(c.inVoid(s))continue;
      for(const side of [-1,1]) {
        dummy.position.copy(c.position(s,c.railLane(s,side),.5));dummy.quaternion.copy(roadFrame(c,s,c.railLane(s,side)).quaternion);
        dummy.scale.set(.15,1.3,.16);dummy.updateMatrix();posts.push(dummy.matrix.clone());
      }
      if(s>270&&Math.round(s/4.5)%3===0)dashes.push(roadRibbon(c,{start:s,end:Math.min(s+3.5,c.length),left:-.065,right:.065,height:.058}));
      if(Math.round(s/4.5)%4===0) {
        const road=c.at(s),floor=this.terrainAt(road.p.x,road.p.z),height=road.p.y-.65-floor;
        if(height>4) {
          dummy.position.copy(road.p);dummy.position.y=floor+height/2;dummy.rotation.set(0,road.heading,0);
          dummy.scale.set(2.5,height,2.7);dummy.updateMatrix();supports.push(dummy.matrix.clone());
          dummy.position.y=road.p.y-1.05;dummy.scale.set(12,.85,2.7);dummy.updateMatrix();caps.push(dummy.matrix.clone());
        }
      }
    }
    batch(this.scene,new T.BoxGeometry(1,1,1),metal,posts);
    batch(this.scene,new T.BoxGeometry(1,1,1),concrete,supports);
    batch(this.scene,new T.BoxGeometry(1,1,1),concrete,caps);
    if(dashes.length){const merged=mergeGeometries(dashes)!;dashes.forEach(g=>g.dispose());mesh(merged,white,this.scene).castShadow=false;}
    // Dark rubber deposits lead naturally into the tightest corners; baked into one mesh.
    const rubber:T.BufferGeometry[]=[];
    for(let s=20;s<c.length;s+=35) {
      if(Math.abs(c.at(s).curvature)<.022||c.inFlight(s))continue;
      for(const lane of [-2,-.8,.8,2])rubber.push(roadRibbon(c,{start:s-10,end:s+5,left:lane-.1,right:lane+.1,height:.052,step:1}));
    }
    if(rubber.length) {
      const marks=new T.MeshStandardMaterial({color:'#353b40',transparent:true,opacity:.24,roughness:1,depthWrite:false});
      const merged=mergeGeometries(rubber)!;rubber.forEach(g=>g.dispose());mesh(merged,marks,this.scene).castShadow=false;
    }
  }
  private buildShortcuts() {
    const c=this.course,stone=mat('#7e8573'),grass=mat('#7d984a'),staging=new T.Group();stone.side=T.DoubleSide;
    for(const route of c.routes) {
      const bush=mat(route.id==='orchard'?'#447a3c':'#62784e'),rock=mat('#92947b');
      const center=(s:number)=>c.routeLane(route,s),inner=(s:number)=>route.side*Math.max(8.5,Math.abs(center(s))-route.width/2);
      const outer=(s:number)=>route.side*Math.max(8.5,Math.abs(center(s))+route.width/2);
      // Only build outside the main asphalt: intersections have one surface, without z-fighting.
      const t=Math.asin(Math.sqrt((8.5-route.width/2)/route.offset))/Math.PI;
      const start=route.start+t*(route.end-route.start),end=route.end-t*(route.end-route.start);
      const left=route.side>0?inner:outer,right=route.side>0?outer:inner;
      const paving=harborPaving();paving.color.set(route.id==='orchard'?'#74775b':'#7d806b');
      mesh(roadRibbon(c,{start,end,left,right,height:.044,step:.5,uvMeters:3}),paving,staging).name=`shortcut-${route.id}`;
      const [splitStart,splitEnd]=c.splitRange(route),mainEdge=route.side*9.1;
      const branchEdge=(s:number)=>center(s)-route.side*route.width/2;
      mesh(roadRibbon(c,{start:splitStart,end:splitEnd,left:route.side>0?mainEdge:branchEdge,right:route.side>0?branchEdge:mainEdge,height:.055,step:.5}),grass,staging).name=`median-${route.id}`;
      // These exact two faces are also the laneBounds used by karts and shells.
      for(const edge of [(_s:number)=>mainEdge,branchEdge]) {
        mesh(roadRibbon(c,{start:splitStart,end:splitEnd,left:edge,right:edge,height:.06,rightHeight:.67,step:.5}),stone,staging);
        // Cap thickness stays inside the island, outside the driveable corridor.
        const direction=edge===branchEdge?-route.side:route.side;
        mesh(roadRibbon(c,{start:splitStart,end:splitEnd,left:s=>Math.min(edge(s),edge(s)+direction*.13),right:s=>Math.max(edge(s),edge(s)+direction*.13),height:.67,step:.5}),stone,staging);
      }
      // Rock and foliage screens live inside the non-drivable median. The entrance
      // stays physically open, but the route beyond is concealed from the main road.
      for(let s=splitStart+5;s<splitEnd-5;s+=8) {
        const gap=Math.min(...[-8,-4,0,4,8].map(d=>Math.abs(branchEdge(s+d))-9.1));if(gap<2.8)continue;
        const lane=(mainEdge+branchEdge(s))/2,g=new T.Group();g.position.copy(c.position(s,lane));g.quaternion.copy(roadFrame(c,s,lane).quaternion);
        const width=Math.min(1.9,(gap-.7)/2),height=route.id==='orchard'?1.1:2.7;
        mesh(new T.IcosahedronGeometry(1,1),rock,g,[0,height*.42,0],[width,height*.64,2.35]);
        mesh(new T.IcosahedronGeometry(1,1),bush,g,[0,route.id==='orchard'?1.8:1.2,.25],[width*.95,route.id==='orchard'?1.8:1.3,2.6]);
        staging.add(g);
      }
      // Natural outcrops at the outer edge frame a small, unmarked opening. Their
      // bases reach the terrain and their footprints stay beyond the visible barrier.
      for(const fraction of [.23,.31,.41,.58,.7]) {
        const s=route.start+(route.end-route.start)*fraction,side=route.side;
        const extent=Math.max(...[-14,-7,0,7,14].map(d=>side*c.railLane(s+d,side)));
        const lane=side*(extent+3.8),p=c.position(s,lane),floor=this.terrainAt(p.x,p.z);
        const height=Math.max(5,p.y-floor+3.8),g=new T.Group();g.position.set(p.x,floor,p.z);g.rotation.y=c.at(s).heading;
        mesh(new T.IcosahedronGeometry(1,1),rock,g,[0,height*.45,0],[2.1,height*.56,3.6]);
        mesh(new T.IcosahedronGeometry(1,1),bush,g,[0,height-.15,0],[2.15,1.5,3]);
        staging.add(g);
      }

    }
    // Bake the static plants, median and transformed sign supports into material batches.
    // Keep shadow flags separate so road stripes remain absent from the shadow pass.
    staging.updateMatrixWorld(true);
    const batches=new Map<string,{material:T.Material;castShadow:boolean;receiveShadow:boolean;geometries:T.BufferGeometry[];names:string[]}>();
    const originals=new Set<T.BufferGeometry>();
    staging.traverse(object=>{
      if(!(object instanceof T.Mesh))return;
      const material=object.material as T.Material,key=`${material.uuid}:${object.castShadow}:${object.receiveShadow}`;
      let batch=batches.get(key);
      if(!batch){batch={material,castShadow:object.castShadow,receiveShadow:object.receiveShadow,geometries:[],names:[]};batches.set(key,batch);}
      batch.geometries.push(object.geometry.clone().applyMatrix4(object.matrixWorld));
      if(object.name)batch.names.push(object.name);originals.add(object.geometry);
    });
    let serial=0;
    for(const batch of batches.values()){
      const geometry=mergeGeometries(batch.geometries)!;batch.geometries.forEach(g=>g.dispose());
      geometry.computeBoundingBox();geometry.computeBoundingSphere();
      const combined=new T.Mesh(geometry,batch.material);combined.castShadow=batch.castShadow;combined.receiveShadow=batch.receiveShadow;
      combined.name=batch.names.length===1?batch.names[0]:`shortcut-batch-${serial++}`;
      combined.userData.sourceNames=batch.names;this.scene.add(combined);
    }
    originals.forEach(g=>g.dispose());staging.clear();
  }
  private sign(s:number,label:string,color='#197ad0') {
    const p=this.course.at(s),group=new T.Group();group.position.copy(p.p);group.rotation.y=p.heading;
    for(const side of [-1,1])mesh(new T.BoxGeometry(.42,7,.42),mat('#fdf4da'),group,[side*9,3.5,0]);
    mesh(new T.BoxGeometry(19,1.6,.45),mat(color),group,[0,7,0]);
    const panel=mesh(new T.PlaneGeometry(17.5,1.3),new T.MeshBasicMaterial({map:textTexture(label,'#fff5db',color),side:T.DoubleSide}),group,[0,7,-.24]);panel.rotation.y=Math.PI;this.scene.add(group);
  }
  private buildDetails() {
    const c=this.course,metal=mat('#e8f6fb',.42,.5),cream=mat('#ffe948');
    this.sign(c.flight[0]-22,'LACETS DES AIGUILLES','#1d9fdb');
    const checker=document.createElement('canvas');checker.width=128;checker.height=32;const ctx=checker.getContext('2d')!;for(let x=0;x<16;x++)for(let y=0;y<4;y++){ctx.fillStyle=(x+y)%2?'#ffffff':'#15213d';ctx.fillRect(x*8,y*8,8,8);}
    const startMap=new T.CanvasTexture(checker);startMap.colorSpace=T.SRGBColorSpace;startMap.anisotropy=8;
    mesh(roadDecal(c,-1.9,1.9,-8,8,.08),new T.MeshStandardMaterial({map:startMap,roughness:1}),this.scene).castShadow=false;
    const boostCanvas=document.createElement('canvas');boostCanvas.width=512;boostCanvas.height=256;
    const boostCtx=boostCanvas.getContext('2d')!,boostGradient=boostCtx.createLinearGradient(0,0,0,256);
    boostGradient.addColorStop(0,'#ffc62d');boostGradient.addColorStop(.5,'#ffac16');boostGradient.addColorStop(1,'#e8670f');
    boostCtx.fillStyle=boostGradient;boostCtx.fillRect(0,0,512,256);boostCtx.strokeStyle='#fffbe0';boostCtx.lineWidth=13;
    for(let k=0;k<3;k++){const y=48+k*70;boostCtx.beginPath();boostCtx.moveTo(30,y+30);boostCtx.lineTo(256,y-20);boostCtx.lineTo(482,y+30);boostCtx.stroke();}
    const boostMap=new T.CanvasTexture(boostCanvas);boostMap.colorSpace=T.SRGBColorSpace;boostMap.anisotropy=8;
    const boostMaterial=new T.MeshStandardMaterial({map:boostMap,roughness:.7,emissive:'#e98b16',emissiveIntensity:.12});
    c.boosts.forEach(s=>mesh(roadDecal(c,s-2.1,s+2.1,-3.5,3.5,.09),boostMaterial,this.scene).castShadow=false);
    for(const pad of c.routeBoosts) {
      const route=c.routes.find(route=>route.id===pad.routeId)!;
      const geometry=roadRibbon(c,{start:pad.distance-2.1,end:pad.distance+2.1,left:s=>c.routeLane(route,s)-pad.width/2,right:s=>c.routeLane(route,s)+pad.width/2,height:.09,step:.5});
      const uv=geometry.getAttribute('uv');
      for(let i=0;i<uv.count;i++)uv.setXY(i,i%2,1-Math.floor(i/2)/(uv.count/2-1));
      mesh(geometry,boostMaterial,this.scene).castShadow=false;
    }
    const prism=document.createElement('canvas');prism.width=256;prism.height=256;
    const prismContext=prism.getContext('2d')!,rainbow=prismContext.createLinearGradient(0,0,256,256);
    ['#80f8ff','#829cff','#dc82ee','#ffd18d','#7cf1c9'].forEach((color,i)=>rainbow.addColorStop(i/4,color));
    prismContext.fillStyle=rainbow;prismContext.fillRect(0,0,256,256);
    prismContext.strokeStyle='#ffffffd0';prismContext.lineWidth=10;prismContext.strokeRect(6,6,244,244);
    prismContext.font='900 205px Arial';prismContext.textAlign='center';prismContext.textBaseline='middle';prismContext.strokeStyle='#4b58b47a';prismContext.lineWidth=8;prismContext.strokeText('?',128,144);prismContext.fillStyle='#fff';prismContext.fillText('?',128,144);
    const question=new T.CanvasTexture(prism);question.colorSpace=T.SRGBColorSpace;
    const boxMaterials=new T.MeshPhysicalMaterial({color:'#ffffff',map:question,emissive:'#769cc7',emissiveMap:question,emissiveIntensity:.28,roughness:.13,metalness:.08,clearcoat:1,transparent:true,opacity:.88});
    this.itemBoxes.boxes.forEach(state=>{
      const box=new T.Group();box.position.copy(state.position);box.userData.floatY=box.position.y;
      const cube=new T.Mesh(new T.BoxGeometry(ITEM_BOX_SIZE,ITEM_BOX_SIZE,ITEM_BOX_SIZE),boxMaterials);box.add(cube);
      const edges=new T.LineSegments(new T.EdgesGeometry(cube.geometry),new T.LineBasicMaterial({color:'#e7ffff'}));box.add(edges);
      this.animated.push(box);this.scene.add(box);
      const burst=new T.Group();burst.position.copy(state.position);burst.visible=false;
      for(let i=0;i<12;i++)mesh(new T.OctahedronGeometry(.16),new T.MeshBasicMaterial({color:['#8bf3ff','#ffe59c','#dea9ff'][i%3]}),burst);
      this.bursts.push(burst);this.scene.add(burst);
    });
    for(let s=45;s<c.length;s+=67){if(c.inVoid(s))continue;const sample=c.at(s),side=Math.floor(s/67)%2?1:-1,p=c.position(s,c.railLane(s,side)+side*1.9,0);
      mesh(new T.CylinderGeometry(.08,.13,4.5,6),metal,this.scene,[p.x,p.y+2.25,p.z]);
      const flag=mesh(new T.PlaneGeometry(2,1.1),cream,this.scene,[p.x+1,p.y+4,p.z]);flag.rotation.y=sample.heading;flag.material=new T.MeshStandardMaterial({color:side>0?'#ff555a':'#2ebee7',side:T.DoubleSide,roughness:1});
    }
  }
  private buildTunnel() {
    const c=this.course,material=mat('#6373ad'),g=new T.Group(),count=80;
    const openings=tunnelOpenings(c),rings=Array.from({length:count+1},(_,i)=>T.MathUtils.lerp(...c.tunnel,i/count));
    for(const opening of openings)rings.push(opening.start,opening.end);
    const distances=[...new Set(rings)].sort((a,b)=>a-b);
    const point=(s:number,theta:number)=>{const sample=c.at(s),p=sample.p.clone().addScaledVector(sample.right,Math.cos(theta)*10.8);p.y+=Math.sin(theta)*10+1;return p;};
    const positions:number[]=[],indices:number[]=[];
    for(const s of distances)for(let j=0;j<=16;j++){const p=point(s,j/16*Math.PI);positions.push(p.x,p.y,p.z);}
    for(let i=0;i<distances.length-1;i++)for(let j=0;j<16;j++){
      const s=(distances[i]+distances[i+1])/2;
      if(openings.some(o=>s>o.start&&s<o.end&&(o.side<0?j>=13:j<3)))continue;
      const k=i*17+j;indices.push(k,k+1,k+17,k+1,k+18,k+17);
    }
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();material.side=T.DoubleSide;mesh(geo,material,g).name='cave-vault';
    // The secret path enters through a low side opening; retain the roof and mark
    // the cut edges in stone, beyond the usable branch width at both ends.
    const stone=mat('#9a94a7');
    for(const opening of openings){
      const edge=opening.side<0?13*Math.PI/16:3*Math.PI/16,bottom=opening.side<0?Math.PI:0;
      const border=(points:T.Vector3[])=>{const curve=new T.CatmullRomCurve3(points);mesh(new T.TubeGeometry(curve,Math.max(12,points.length*2),.17,7,false),stone,g).name='cave-opening-stone';};
      for(const s of [opening.start,opening.end]){
        const contour=Array.from({length:9},(_,i)=>point(s,T.MathUtils.lerp(edge,bottom,i/8)));
        const foot=c.position(s,opening.side*10.8,-.15);if(foot.y<contour[contour.length-1].y)contour.push(foot);
        border(contour);
      }
      const steps=Math.ceil((opening.end-opening.start)/2);
      border(Array.from({length:steps+1},(_,i)=>point(T.MathUtils.lerp(opening.start,opening.end,i/steps),edge)));
    }
    for(let s=c.tunnel[0];s<c.tunnel[1];s+=10){const p=c.position(s,0,9.5);const bar=mesh(new T.BoxGeometry(2.4,.12,.28),new T.MeshBasicMaterial({color:'#7afffc'}),g,[p.x,p.y,p.z]);bar.rotation.y=c.at(s).heading;}
    this.scene.add(g);this.sign(c.tunnel[0]-12,'GROTTE TURBO','#784de1');
    for(const s of [c.tunnel[0],c.tunnel[1]]) {
      const portal=new T.Group();portal.position.copy(c.position(s,0,1));portal.rotation.y=c.at(s).heading;
      const arch=mesh(new T.TorusGeometry(10.6,.85,8,32,Math.PI),mat('#ad86f5'),portal);arch.rotation.z=0;
      for(const side of [-1,1])mesh(new T.BoxGeometry(1.7,2,1.7),mat('#ffd52e'),portal,[side*10.6,0,0]);
      this.scene.add(portal);
    }
    for(let s=c.tunnel[0]+4;s<c.tunnel[1];s+=12) {
      for(const side of [-1,1]){
        if(openings.some(o=>o.side===side&&s>o.start-2&&s<o.end+2))continue;
        const p=c.position(s,side*9.6,1.8),crystal=mesh(new T.OctahedronGeometry(1.4),new T.MeshStandardMaterial({color:side>0?'#49e9ef':'#cf82ff',emissive:side>0?'#1d9ac1':'#7546d9',emissiveIntensity:.7,roughness:.25}),this.scene,[p.x,p.y,p.z],[.55,1.9,.55]);crystal.rotation.z=side*.2;crystal.name='cave-crystal';
      }
    }
  }
  private buildHarbor() {
    const c=this.course,p=c.position(15,-28),lighthouse=new T.Group();lighthouse.position.copy(p);lighthouse.position.y=3;
    const stone=mat('#fff4d6'),red=mat('#f04749'),dark=mat('#267ca8',.5,.35);
    mesh(new T.CylinderGeometry(2.3,3.7,19,20),stone,lighthouse,[0,9.5,0]);
    mesh(new T.CylinderGeometry(2.95,2.95,1.2,20),red,lighthouse,[0,15,0]);
    mesh(new T.CylinderGeometry(3.1,3.1,.6,20),dark,lighthouse,[0,19.3,0]);
    mesh(new T.CylinderGeometry(2,2,3.5,12),new T.MeshPhysicalMaterial({color:'#52dffc',roughness:.08,metalness:.35}),lighthouse,[0,21,0]);
    mesh(new T.ConeGeometry(3.2,2.5,16),red,lighthouse,[0,24,0]);this.scene.add(lighthouse);
  }

  update(time:number,target:T.Vector3,signal=-1) {
    this.waterUniforms.time.value=time;this.festival.update(time,signal);
    this.sun.position.copy(target).add(new T.Vector3(-70,110,-40));this.sun.target.position.copy(target);
    this.animated.forEach((box,i)=>{
      const cooldown=this.itemBoxes.boxes[i].cooldown;
      box.visible=cooldown===0;box.quaternion.copy(this.itemBoxes.boxes[i].rotation);box.position.copy(this.itemBoxes.boxes[i].visualPosition);
      const burst=this.bursts[i],age=2.5-cooldown;burst.visible=cooldown>1.9;
      if(burst.visible)burst.children.forEach((shard,j)=>{const a=j/12*Math.PI*2;shard.position.set(Math.cos(a)*age*5,Math.sin(j*2.4)*age*4+age*2,Math.sin(a)*age*5);shard.scale.setScalar(Math.max(0,1-age/.6));shard.rotation.set(age*8,j,age*5);});
    });
  }
}
