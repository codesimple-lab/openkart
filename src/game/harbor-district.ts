import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Course } from './course';

export interface HarborFootprint {name:string;center:T.Vector3;width:number;depth:number;heading:number;top:number;}
/** Stone harbor neighborhood, built as contiguous street fronts on supported terraces.
 * Geometry is merged by a fixed 14-material palette. No downloaded art or runtime canvas. */
export class HarborDistrict {
  readonly root=new T.Group();
  readonly footprints:HarborFootprint[]=[];
  readonly gate={distance:225,clearWidth:21.4,clearHeight:12};
  private readonly stage=new T.Group();
  private readonly cube=new T.BoxGeometry(1,1,1);
  private readonly cylinder=new T.CylinderGeometry(1,1,1,16);
  private readonly sphere=new T.SphereGeometry(1,12,8);
  private readonly palette:Record<string,T.MeshStandardMaterial>;
  constructor(private readonly course:Course,private readonly ground:(x:number,z:number)=>number){
    this.root.name='Quartier du port — arcades et porte des deux tours';
    const masonry=this.surfaceTexture(false),tiles=this.surfaceTexture(true);
    const colors={stone:'#d5c5a5',stucco:'#f0d7af',apricot:'#dca77f',trim:'#f4e6ca',base:'#a49881',roof:'#c46149',roofDark:'#8e483d',iron:'#344f51',wood:'#795639',glass:'#355964',leaf:'#50753e',flower:'#e77b57',linen:'#eee5d3',light:'#f8d9a0'};
    this.palette=Object.fromEntries(Object.entries(colors).map(([key,color])=>[key,new T.MeshStandardMaterial({color,roughness:key==='glass'?.27:key==='iron'?.5:.89,metalness:key==='iron'?.45:key==='glass'?.15:0,map:['stone','base'].includes(key)?masonry:key==='roof'?tiles:null})]));
    // Blocks share a sidewalk and a cornice line, with small changes in height and roof profile.
    for(const side of [-1,1]){
      for(let i=0;i<7;i++)this.streetBlock(58+i*23,side,i);
      this.pavilion(38,side*22,side);
      this.pavilion(248,side*22,side);
      this.promenade(side);
    }
    this.cityGate();this.compile();
  }
  /** Conservative global clearance against every road segment, not only the nearby anchor. */
  static footprintClear(course:Course,footprint:HarborFootprint,margin=1){
    const cos=Math.cos(footprint.heading),sin=Math.sin(footprint.heading),halfX=footprint.width/2,halfZ=footprint.depth/2;
    // Transform the course polyline into footprint coordinates and test its swept radius.
    for(let i=0;i<course.samples.length;i+=2){
      const road=course.samples[i],dx=road.p.x-footprint.center.x,dz=road.p.z-footprint.center.z;
      const x=cos*dx-sin*dz,z=sin*dx+cos*dz;
      const radius=road.width/2+.65+course.maxShoulder(i/course.resolution*course.length)+margin;
      const ex=Math.max(0,Math.abs(x)-halfX),ez=Math.max(0,Math.abs(z)-halfZ);
      if(ex*ex+ez*ez<radius*radius)return false;
    }
    return true;
  }
  /** Used by other scenery builders before merging, to keep vegetation outside masonry. */
  occupies(point:T.Vector3,radius=0){
    return this.footprints.some(f=>{
      const dx=point.x-f.center.x,dz=point.z-f.center.z,cos=Math.cos(f.heading),sin=Math.sin(f.heading);
      const x=cos*dx-sin*dz,z=sin*dx+cos*dz;
      return Math.max(0,Math.abs(x)-f.width/2)**2+Math.max(0,Math.abs(z)-f.depth/2)**2<(radius+.3)**2;
    });
  }
  private surfaceTexture(roof:boolean){
    const size=128,data=new Uint8Array(size*size*4);let seed=379;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      seed=(seed*1664525+1013904223)>>>0;
      const row=Math.floor(y/(roof?16:32)),offset=row%2*(roof?8:32);
      const mortar=roof?y%16<2||(x+offset)%16<1:y%32<2||(x+offset)%64<2;
      const value=mortar?(roof?173:161):224+(seed>>>28);data.set([value,value,value,255],(y*size+x)*4);
    }
    const texture=new T.DataTexture(data,size,size);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;texture.needsUpdate=true;return texture;
  }
  private add(g:T.BufferGeometry,key:string,parent:T.Object3D,x:number,y:number,z:number,sx=1,sy=1,sz=1){
    const mesh=new T.Mesh(g,this.palette[key]);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);parent.add(mesh);return mesh;
  }
  private box(key:string,parent:T.Object3D,x:number,y:number,z:number,w:number,h:number,d:number){return this.add(this.cube,key,parent,x,y,z,w,h,d);}
  private facing(s:number,lane:number){
    const side=Math.sign(lane),road=this.course.at(s),point=this.course.position(s,lane);
    const heading=Math.atan2(road.right.x*side,road.right.z*side),group=new T.Group();group.position.copy(point);group.rotation.y=heading;
    return {group,heading,side,point};
  }
  private support(group:T.Group,w:number,d:number,top:number){
    const footprint={name:'terrasse',center:group.position.clone(),width:w,depth:d,heading:group.rotation.y,top};
    const transform=new T.Matrix4().makeRotationY(group.rotation.y).setPosition(group.position);
    let low=Infinity;
    for(const x of [-w/2,0,w/2])for(const z of [-d/2,0,d/2]){const p=new T.Vector3(x,0,z).applyMatrix4(transform);low=Math.min(low,this.ground(p.x,p.z));}
    const height=Math.max(.6,top-low+.45);
    this.box('base',group,0,-height/2,0,w,height,d);
    this.box('stone',group,0,.12,0,w+.16,.24,d+.16);
    this.footprints.push(footprint);
    // Horizontal retaining courses and buttresses visually connect the platform to the hillside.
    for(let y=1;y<height;y+=1.8)this.box('stone',group,0,-y,-d/2-.035,w,.09,.08);
    for(let x=-w/2+.8;x<w/2;x+=4.6){this.box('stone',group,x,-height*.5,-d/2+.08,.48,height,.48);this.box('trim',group,x,.2,-d/2-.12,.67,.22,.67);}
  }
  private streetBlock(s:number,side:number,index:number){
    const width=20,depth=12,lane=side*(index%3===1?22.8:22),{group,heading,point}=this.facing(s,lane);
    const outer={name:`îlot ${side<0?'ouest':'est'} ${index+1}`,center:point,width:22.2,depth:18.2,heading,top:point.y+19};
    if(!HarborDistrict.footprintClear(this.course,outer,1.1))return;
    const street=this.course.position(s,side*12).y-.65;
    const groundCenter=this.ground(point.x,point.z);group.position.y=Math.max(street,groundCenter+.22);this.stage.add(group);
    this.support(group,22,18,group.position.y);
    const height=10.8+(index%3)*2.2,color=index%3===1?'apricot':'stucco';
    this.box(color,group,0,height/2+.3,1,width,height,depth);
    this.box('stone',group,0,2.2,1,width+.12,3.8,depth+.12);
    // Heavy corner quoins, continuous string course and a stepped projecting cornice.
    for(const x of [-width/2+.23,width/2-.23])for(let y=.6;y<height;y+=.85)this.box('trim',group,x,y,1,.62,.65,depth+.38);
    for(const y of [4.25,height-.12,height+.25])this.box('trim',group,0,y,1,width+.5,y>height?.35:.2,depth+.55);
    for(let bay=0;bay<5;bay++){
      const x=(bay-2)*3.75;
      this.archway(group,x,0.4,-5.09,2.35,3.05,'glass',.18);
      if(index%2===0&&bay%2===0)this.awning(group,x,3.45,-5.65,3.15,index);
      for(let floor=0;floor<2;floor++){
        const y=5.65+floor*(height-5.3)/2;
        this.window(group,x,y,-5.11,1.32,1.85,index+bay);
        if(floor===0&&bay%2===1)this.balcony(group,x,y-.95,-5.25,2.1);
      }
    }
    // Side return windows keep the streetscape detailed on the exit view too.
    for(const sideX of [-1,1])for(let bay=0;bay<3;bay++){
      const face=new T.Group();face.position.set(sideX*(width/2+.04),0,-2.8+bay*3.7);face.rotation.y=-sideX*Math.PI/2;group.add(face);
      this.window(face,0,6.2,0,1.4,2,index+bay);
    }
    this.hipRoof(group,0,height+.6,1,width+1.4,depth+1.4,3.6);
    for(const x of [-5,5]){
      this.box('stone',group,x,height+3.1,2.9,1.05,3.3,1.2);this.box('trim',group,x,height+4.8,2.9,1.5,.35,1.55);
      this.box('roofDark',group,x,height+5.01,2.9,1,.08,1.08);
    }
    if(index===3)this.clockTurret(group,height,side);
    // Front terrace is a continuous pedestrian frontage, with paving rather than isolated pads.
    for(let x=-9;x<10;x+=1.4)for(let z=-8.5;z< -5.8;z+=1.2)this.box((Math.floor(x*3)+Math.floor(z*2))%3?'stone':'trim',group,x,.265,z,1.34,.035,1.12);
    for(const x of [-8.8,8.8])this.planter(group,x,.33,-7.6,1.45);
    this.lamp(group,0,.3,-8.05);
    // Shop shutters, hanging placards and a framed entrance establish human scale.
    const sign=this.box('wood',group,8.8,4.6,-6.0,.12,.12,1.5);sign.rotation.z=.1;
    this.box('apricot',group,8.8,3.95,-6.65,.13,1.1,.95);
  }
  private archShape(width:number,height:number){const r=width/2,shape=new T.Shape();shape.moveTo(-r,0);shape.lineTo(r,0);shape.lineTo(r,height-r);shape.absarc(0,height-r,r,0,Math.PI,false);shape.closePath();return shape;}
  private archway(parent:T.Object3D,x:number,y:number,z:number,width:number,height:number,key:string,depth=.16){
    const fill=new T.ExtrudeGeometry(this.archShape(width,height),{depth,bevelEnabled:false,curveSegments:10});
    this.add(fill,key,parent,x,y,z-depth);
    const r=width/2,t=.2,spring=height-r;
    for(const side of [-1,1])this.box('trim',parent,x+side*(r+t/2),y+spring/2,z-.1,t,spring,.26);
    for(let i=0;i<11;i++){
      const a=(i+.5)/11*Math.PI,stone=this.box('trim',parent,x+Math.cos(a)*(r+t/2),y+spring+Math.sin(a)*(r+t/2),z-.11,t,.42,.27);stone.rotation.z=a-Math.PI/2;
    }
    this.box('wood',parent,x,y+spring*.47,z-.15,.085,spring*.94,.12);
    this.box('wood',parent,x,y+spring*.6,z-.15,width,.085,.12);
    this.box('trim',parent,x,y-.07,z-.1,width+.6,.16,.45);
  }
  private window(parent:T.Object3D,x:number,y:number,z:number,w:number,h:number,variant:number){
    this.box('glass',parent,x,y,z,w,h,.12);
    for(const side of [-1,1]){
      this.box('trim',parent,x+side*(w/2+.1),y,z-.11,.2,h+.35,.25);
      this.box(variant%2?'wood':'iron',parent,x+side*(w/2+.43),y,z+.005,.45,h+.1,.12);
      for(let row=0;row<5;row++)this.box('base',parent,x+side*(w/2+.43),y-h*.38+row*h*.19,z-.065,.39,.04,.025);
    }
    for(const dy of [-h/2-.1,h/2+.1])this.box('trim',parent,x,y+dy,z-.13,w+.5,.2,.34);
    this.box('linen',parent,x,y,z-.13,.055,h,.07);this.box('linen',parent,x,y+.1,z-.13,w,.055,.07);
    this.box('trim',parent,x,y-h/2-.2,z-.27,w+.75,.18,.65);
  }
  private balcony(parent:T.Object3D,x:number,y:number,z:number,width:number){
    this.box('stone',parent,x,y,z-.55,width+.3,.18,1.1);
    this.box('iron',parent,x,y+.9,z-1,width,.075,.065);
    for(let i=0;i<=8;i++)this.box('iron',parent,x-width/2+i*width/8,y+.47,z-1,.045,.86,.045);
    for(const side of [-1,1]){this.box('iron',parent,x+side*width/2,y+.9,z-.55,.065,.075,.9);this.box('stone',parent,x+side*width*.3,y-.37,z-.26,.22,.6,.46);}
  }
  private awning(parent:T.Object3D,x:number,y:number,z:number,width:number,index:number){
    const g=new T.Group();g.position.set(x,y,z);g.rotation.x=-.13;parent.add(g);
    for(let i=0;i<8;i++){this.box(i%2?'linen':index%2?'apricot':'roof',g,(i-3.5)*width/8,0,-.35,width/8,.085,1.8);this.box(i%2?'linen':'roof',g,(i-3.5)*width/8,-.18,-1.24,width/8,.35,.08);}
    for(const side of [-1,1]){const brace=this.box('iron',g,side*(width/2-.15),-.35,-.45,.06,.075,1.6);brace.rotation.x=-.5;}
  }
  private hipRoof(parent:T.Object3D,x:number,y:number,z:number,width:number,depth:number,height:number){
    const a=width/2,b=depth/2,ridge=Math.max(0,a-b*.55),positions=[-a,0,-b,a,0,-b,ridge,height,0,-a,0,-b,ridge,height,0,-ridge,height,0,a,0,b,-a,0,b,-ridge,height,0,a,0,b,-ridge,height,0,ridge,height,0,-a,0,b,-a,0,-b,-ridge,height,0,a,0,-b,a,0,b,ridge,height,0];
    for(let i=0;i<positions.length;i+=9)for(let k=0;k<3;k++){const value=positions[i+3+k];positions[i+3+k]=positions[i+6+k];positions[i+6+k]=value;}
    const roof=new T.BufferGeometry();roof.setAttribute('position',new T.Float32BufferAttribute(positions,3));roof.setAttribute('uv',new T.Float32BufferAttribute(new Array(positions.length/3*2).fill(0),2));roof.computeVertexNormals();this.add(roof,'roof',parent,x,y,z);
    this.box('roofDark',parent,x,y+height+.06,z,ridge*2+.3,.19,.24);
    for(const side of [-1,1])this.box('trim',parent,x,y-.04,z+side*b,width+.15,.16,.2);
  }
  private planter(parent:T.Object3D,x:number,y:number,z:number,size:number){
    this.box('stone',parent,x,y+.24,z,size,.48,size);this.box('trim',parent,x,y+.5,z,size+.14,.14,size+.14);
    this.box('wood',parent,x,y+.58,z,size-.15,.03,size-.15);
    for(let i=0;i<5;i++){const a=i*2.4;this.add(this.sphere,'leaf',parent,x+Math.sin(a)*size*.22,y+.88+(i%2)*.3,z+Math.cos(a)*size*.22,size*.34,.4,size*.34);if(i%2===0)this.add(this.sphere,'flower',parent,x+Math.sin(a)*size*.26,y+1.15,z+Math.cos(a)*size*.26,.14,.11,.14);}
  }
  private lamp(parent:T.Object3D,x:number,y:number,z:number){
    this.add(this.cylinder,'iron',parent,x,y+2.6,z,.075,5.2,.075);this.add(this.cylinder,'iron',parent,x,y+.3,z,.21,.6,.21);
    this.box('iron',parent,x,y+5.1,z,.8,.12,.8);this.box('light',parent,x,y+4.65,z,.42,.75,.42);
    for(const sx of [-1,1])for(const sz of [-1,1])this.box('iron',parent,x+sx*.23,y+4.65,z+sz*.23,.045,.83,.045);
    this.add(new T.ConeGeometry(.55,.4,4),'iron',parent,x,y+5.37,z).rotation.y=Math.PI/4;
  }
  private clockTurret(parent:T.Object3D,height:number,side:number){
    this.box('stone',parent,3,height+5.5,1,5.2,6.5,5.2);this.box('trim',parent,3,height+8.9,1,5.65,.45,5.65);
    this.archway(parent,3,height+5.3,-1.66,2.4,2.9,'glass');
    this.hipRoof(parent,3,height+9.2,1,6.5,6.5,3.2);
    this.add(this.cylinder,'iron',parent,3,height+13,1,.055,1.6,.055);
    const flag=this.box('roof',parent,3+side*.6,height+13.1,1,1.2,.65,.035);flag.rotation.y=.2;
  }
  private pavilion(s:number,lane:number,side:number){
    const {group,heading,point}=this.facing(s,lane),w=11,d=10;
    if(!HarborDistrict.footprintClear(this.course,{name:'pavillon',center:point,width:w+2,depth:d+2,heading,top:point.y+12},1.2))return;
    group.position.y=Math.max(this.ground(point.x,point.z)+.2,this.course.position(s,side*13).y-.8);this.stage.add(group);this.support(group,w+2,d+2,group.position.y);
    this.box('stone',group,0,2.3,0,w,4.2,d);
    for(const x of [-3.7,0,3.7])this.archway(group,x,.4,-5.08,2.2,3.4,'wood');
    this.box('trim',group,0,4.55,0,w+.6,.35,d+.6);this.hipRoof(group,0,4.8,0,w+1.5,d+1.5,3.7);
    this.add(this.cylinder,'iron',group,0,9.4,0,.055,2.3,.055);this.box('roof',group,.7,9.8,0,1.4,.9,.045);
    for(const x of [-4.9,4.9])this.planter(group,x,.27,-5.35,1.1);
  }
  private promenade(side:number){
    // A narrow, continuous masonry pavement links block entrances and the gate.
    for(let s=39;s<248;s+=3){
      const a=this.course.position(s,side*10.8,-.48),b=this.course.position(s+3,side*10.8,-.48),p=a.clone().lerp(b,.5);
      const segment=new T.Group();segment.position.copy(p);segment.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);this.stage.add(segment);
      const floor=Math.min(this.ground(a.x,a.z),this.ground(b.x,b.z)),height=Math.max(.35,p.y-floor+.25);
      const footprint={name:'promenade',center:p.clone(),width:2.1,depth:a.distanceTo(b)+.08,heading:segment.rotation.y,top:p.y+.15};
      if(!HarborDistrict.footprintClear(this.course,footprint,.15)){this.stage.remove(segment);continue;}
      this.footprints.push(footprint);this.box('base',segment,0,-height/2,0,2.1,height,a.distanceTo(b)+.12);this.box('stone',segment,0,.09,0,2.2,.18,a.distanceTo(b)+.12);
    }
  }
  private cityGate(){
    const s=this.gate.distance,road=this.course.at(s),gate=new T.Group();gate.position.copy(road.p);gate.rotation.y=road.heading;this.stage.add(gate);
    for(const side of [-1,1]){
      const local=new T.Vector3(side*15.1,0,0),world=local.clone().applyAxisAngle(new T.Vector3(0,1,0),gate.rotation.y).add(gate.position);
      const footprint={name:`tour de porte ${side}`,center:world,width:8.4,depth:8.4,heading:gate.rotation.y,top:road.p.y+33};
      if(!HarborDistrict.footprintClear(this.course,footprint,.25)){this.stage.remove(gate);return;}
    }
    for(const side of [-1,1]){
      const tower=new T.Group();tower.position.x=side*15.1;gate.add(tower);
      const world=tower.position.clone().applyAxisAngle(new T.Vector3(0,1,0),gate.rotation.y).add(gate.position),base=Math.min(-.3,this.ground(world.x,world.z)-road.p.y-.35);
      this.footprints.push({name:`tour de porte ${side}`,center:world,width:8.4,depth:8.4,heading:gate.rotation.y,top:road.p.y+33});
      this.add(this.cylinder,'base',tower,0,base/2,0,4.2,-base,4.2);
      this.add(this.cylinder,'stone',tower,0,12.5,0,3.8,25,3.8);
      for(const y of [.6,6.2,13.5,21.5,24.6])this.add(this.cylinder,'trim',tower,0,y,0,4.04,.35,4.04);
      for(let angle=0;angle<Math.PI*2;angle+=Math.PI/4){
        const face=new T.Group();face.position.set(Math.sin(angle)*3.83,0,Math.cos(angle)*3.83);face.rotation.y=angle+Math.PI;tower.add(face);
        for(const y of [7,15.5,21.8])this.archway(face,0,y,0,1.15,2.4,'glass',.11);
      }
      this.add(this.cylinder,'stone',tower,0,25.7,0,4.4,1.4,4.4);
      for(let i=0;i<12;i++){const a=i/12*Math.PI*2;this.box('trim',tower,Math.sin(a)*4.12,26.7,Math.cos(a)*4.12,.72,1.1,.72).rotation.y=a;}
      this.add(new T.ConeGeometry(4.1,5.8,20),'roof',tower,0,29.7,0);this.add(this.cylinder,'iron',tower,0,33.6,0,.08,2.1,.08);this.box('roof',tower,side*.85,34.2,0,1.7,1,.05);
    }
    // True semicircular opening, with no invisible rectangle spanning the racing corridor.
    const outer=12.45,inner=10.7,spring=12,shape=new T.Shape();shape.moveTo(outer,0);shape.absarc(0,0,outer,0,Math.PI,false);shape.lineTo(-inner,0);shape.absarc(0,0,inner,Math.PI,0,true);shape.closePath();
    this.add(new T.ExtrudeGeometry(shape,{depth:3.6,bevelEnabled:false,curveSegments:32}),'stone',gate,0,spring,-1.8);
    for(let i=0;i<23;i++){const a=(i+.5)/23*Math.PI,m=this.box('trim',gate,Math.cos(a)*11.64,spring+Math.sin(a)*11.64,-1.95,1.65,.17,.22);m.rotation.z=a;}
    for(const side of [-1,1])this.box('stone',gate,side*12.5,6,0,3.5,12,3.6);
    this.box('trim',gate,0,25.05,0,27.3,.55,4.2);this.box('stone',gate,0,25.7,0,27,1.05,3.8);
    for(let x=-12;x<=12;x+=1.35)this.box('trim',gate,x,26.65,-1.6,.8,1,.55);
    this.box('iron',gate,0,23.4,-2.15,2.5,2.1,.12);this.add(new T.CylinderGeometry(.76,.76,.14,32),'trim',gate,0,23.4,-2.27).rotation.x=Math.PI/2;
    this.box('iron',gate,.18,23.52,-2.38,.045,.7,.06).rotation.z=-.5;this.box('iron',gate,-.2,23.33,-2.38,.6,.05,.06);
  }
  private compile(){
    this.stage.updateMatrixWorld(true);const buckets=new Map<T.Material,T.BufferGeometry[]>(),originals=new Set<T.BufferGeometry>();
    this.stage.traverse(object=>{
      if(!(object instanceof T.Mesh))return;originals.add(object.geometry);
      const g=(object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone()).applyMatrix4(object.matrixWorld),p=g.getAttribute('position'),normal=g.getAttribute('normal'),uv=[];
      for(let i=0;i<p.count;i++){const up=Math.abs(normal.getY(i))>.55;uv.push((up?p.getX(i):Math.abs(normal.getX(i))>Math.abs(normal.getZ(i))?p.getZ(i):p.getX(i))*.35,(up?p.getZ(i):p.getY(i))*.35);}
      g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));const key=object.material as T.Material,list=buckets.get(key)??[];list.push(g);buckets.set(key,list);
    });
    for(const [material,parts] of buckets){const geometry=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());if(!geometry)throw new Error('Harbor material batch could not be merged');geometry.computeBoundingBox();geometry.computeBoundingSphere();const mesh=new T.Mesh(geometry,material);mesh.name='harbor-'+Object.entries(this.palette).find(([,m])=>m===material)?.[0];mesh.castShadow=true;mesh.receiveShadow=true;this.root.add(mesh);}
    originals.forEach(g=>g.dispose());this.stage.clear();
  }
  dispose(){const maps=new Set<T.Texture>();this.root.traverse(o=>{if(o instanceof T.Mesh)o.geometry.dispose();});Object.values(this.palette).forEach(m=>{if(m.map)maps.add(m.map);m.dispose();});maps.forEach(map=>map.dispose());this.root.clear();}
}
