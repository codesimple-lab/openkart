import * as T from 'three';
import type { Race } from './race';
import { heldItemPosition } from './combat';
import { ITEM_ICONS, type Item } from './item-types';

const material=(color:T.ColorRepresentation,metalness=0)=>new T.MeshStandardMaterial({color,metalness,roughness:.3});
function mesh(g:T.BufferGeometry,m:T.Material,parent:T.Object3D,x=0,y=0,z=0){const object=new T.Mesh(g,m);object.position.set(x,y,z);object.castShadow=true;parent.add(object);return object;}
function shellModel(red:boolean){
  const root=new T.Group(),green=material(red?'#fb343c':'#24c94e'),cream=material('#fff8dc'),dark=material(red?'#8d1628':'#076b31');
  const dome=mesh(new T.SphereGeometry(.68,16,10,0,Math.PI*2,0,Math.PI*.5),green,root);dome.scale.y=.8;
  const rim=mesh(new T.TorusGeometry(.64,.12,8,24),cream,root);rim.rotation.x=Math.PI/2;
  mesh(new T.CylinderGeometry(.6,.5,.17,20),cream,root,0,-.06);
  for(let i=0;i<6;i++){const seam=mesh(new T.TorusGeometry(.68,.022,4,24,Math.PI*.5),dark,root);seam.rotation.y=i*Math.PI/3;seam.rotation.z=Math.PI/2;}
  return root;
}
function bananaModel(){
  const root=new T.Group(),yellow=material('#ffe332'),inside=material('#fff49b');
  for(let i=0;i<3;i++){
    const peel=new T.Group();peel.rotation.y=i*Math.PI*2/3;root.add(peel);
    const shape=new T.Shape();shape.moveTo(-.13,.6);shape.quadraticCurveTo(-.25,-.1,-.94,-.16);shape.lineTo(-.65,-.34);shape.quadraticCurveTo(-.08,-.31,.17,.48);shape.closePath();
    const p=mesh(new T.ExtrudeGeometry(shape,{depth:.13,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.05,bevelThickness:.035}),yellow,peel);p.rotation.y=Math.PI/2;
  }
  mesh(new T.ConeGeometry(.17,.77,8),inside,root,0,.5);
  mesh(new T.CylinderGeometry(.06,.07,.2,6),material('#85731f'),root,0,.98);
  const eyes=material('#25243b');mesh(new T.SphereGeometry(.045,8,6),eyes,root,-.075,.59,.155);mesh(new T.SphereGeometry(.045,8,6),eyes,root,.075,.59,.155);
  root.scale.setScalar(1.35);return root;
}
function coinModel(){
  const root=new T.Group(),gold=material('#ffd735',.72),edge=material('#ffaf11',.8);
  const disc=mesh(new T.CylinderGeometry(.56,.56,.13,24),gold,root);disc.rotation.x=Math.PI/2;
  for(const z of [-.078,.078]){
    mesh(new T.TorusGeometry(.45,.045,6,24),edge,root,0,0,z);
    mesh(new T.BoxGeometry(.09,.56,.028),edge,root,0,0,z);
  }
  return root;
}
/** Installs all dynamic on-track collectible visuals. Item-box meshes remain owned by World. */
export class CollectibleVisuals {
  readonly root=new T.Group();
  private readonly coinModels:T.Group[];
  private readonly objects=new Map<string,T.Group>();
  private readonly green=shellModel(false);
  private readonly red=shellModel(true);
  private readonly banana=bananaModel();
  private readonly orbiters:T.Group[]=[];
  private readonly flashes=new Map<number,{root:T.Group;until:number}>();
  private readonly previousCoins:number[]=[];
  private readonly sparkGeometry=new T.OctahedronGeometry(.13);
  private readonly sparkMaterials={coin:new T.MeshBasicMaterial({color:'#fff57f'}),shell:new T.MeshBasicMaterial({color:'#ffefac'}),banana:new T.MeshBasicMaterial({color:'#ffe12e'}),protected:new T.MeshBasicMaterial({color:'#75f5ff'})};
  constructor(scene:T.Scene,private readonly race:Race){
    scene.add(this.root);this.root.name='Pièces, bananes et carapaces';
    const coin=coinModel();
    this.coinModels=race.pickups.coins.map(c=>{const model=coin.clone();model.position.copy(c.position);this.root.add(model);return model;});
    race.racers.forEach(()=>{const group=new T.Group();this.root.add(group);this.orbiters.push(group);});
  }
  update(time:number){
    this.race.pickups.coins.forEach((coin,i)=>{
      const model=this.coinModels[i];model.visible=coin.cooldown===0;model.rotation.y=time*2.2+i*.3;model.position.y=coin.position.y+Math.sin(time*3+i)*.12;
      if(coin.cooldown>5.8&&!(this.previousCoins[i]>0)){
        const burst=new T.Group();burst.position.copy(coin.position);
        const mat=this.sparkMaterials.coin;
        for(let n=0;n<7;n++){const spark=new T.Mesh(this.sparkGeometry,mat);const a=n/7*Math.PI*2;spark.position.set(Math.cos(a)*.8,Math.sin(a)*.8,0);burst.add(spark);}
        this.root.add(burst);this.flashes.set(i,{root:burst,until:time+.45});
      }
      this.previousCoins[i]=coin.cooldown;
    });
    for(const [key,flash] of this.flashes){
      if(time>flash.until){this.root.remove(flash.root);this.flashes.delete(key);}
      else{flash.root.scale.setScalar(1+(1-(flash.until-time)/.45)*2);flash.root.rotation.y=time*3;}
    }
    const active=new Set<string>();
    for(const object of [...this.race.pickups.bananas,...this.race.pickups.shells]){
      const key=object.kind+object.id;active.add(key);let model=this.objects.get(key);
      if(!model){model=(object.kind==='banana'?this.banana:object.kind==='red-shell'?this.red:this.green).clone();this.root.add(model);this.objects.set(key,model);}
      model.position.copy(object.position);model.rotation.y=object.kind==='banana'?object.id:time*14;
      if(object.kind==='banana'){model.rotation.x=object.grounded?0:object.age*4;model.rotation.z=object.grounded?0:object.age*2.3;}
    }
    this.race.racers.forEach((r,i)=>{
      if(!r.heldItem)return;
      const key='held'+i;active.add(key);let model=this.objects.get(key);
      if(model&&model.userData.item!==r.heldItem){this.root.remove(model);this.objects.delete(key);model=undefined;}
      if(!model){model=(r.heldItem==='banana'?this.banana:r.heldItem==='red-shell'?this.red:this.green).clone();model.userData.item=r.heldItem;this.root.add(model);this.objects.set(key,model);}
      model.position.copy(heldItemPosition(this.race,i));model.rotation.y=r.heldItem==='banana'?time*.4:time*7;
    });
    for(const impact of this.race.pickups.impacts){
      const key='impact'+impact.id;active.add(key);let model=this.objects.get(key);
      if(!model){
        model=new T.Group();
        for(let n=0;n<10;n++){const spark=new T.Mesh(this.sparkGeometry,this.sparkMaterials[impact.kind]);model.add(spark);}
        this.root.add(model);this.objects.set(key,model);
      }
      const progress=1-impact.life/.5;model.position.copy(impact.position);
      model.children.forEach((spark,n)=>{const a=n*2.39996;const spread=.3+progress*3;spark.position.set(Math.cos(a)*spread,Math.sin(n*1.7)*spread+progress-progress*progress*2,Math.sin(a)*spread);spark.scale.setScalar((1-progress)*1.6);spark.rotation.set(time*8+n,time*6,0);});
    }
    for(const horn of this.race.pickups.horns){
      const key='horn'+horn.id;active.add(key);let model=this.objects.get(key);
      if(!model){model=new T.Group();const ring=mesh(new T.TorusGeometry(1,.035,6,48),new T.MeshBasicMaterial({color:'#fff185',transparent:true,opacity:.7}),model);ring.rotation.x=Math.PI/2;this.root.add(model);this.objects.set(key,model);}
      model.position.copy(horn.position);model.scale.setScalar(1+(1-horn.life/.55)*18);
      const ring=model.children[0] as T.Mesh;(ring.material as T.MeshBasicMaterial).opacity=horn.life/.55;
    }
    for(const [key,model] of this.objects)if(!active.has(key)){this.root.remove(model);if(key.startsWith('horn'))model.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();(o.material as T.Material).dispose();}});this.objects.delete(key);}
    this.race.racers.forEach((r,i)=>{
      const group=this.orbiters[i];group.visible=r.star>0;if(!group.visible)return;
      group.position.copy(this.race.course.position(r.distance,r.lane,r.height+1));
      if(!group.children.length){for(let n=0;n<6;n++){const spark=mesh(new T.OctahedronGeometry(.18),new T.MeshBasicMaterial({color:new T.Color().setHSL(n/6,1,.6)}),group);spark.userData.index=n;}}
      group.children.forEach((spark,n)=>{spark.position.set(Math.cos(time*5+n)*1.7,.9+Math.sin(time*6+n)*.9,Math.sin(time*5+n)*1.7);spark.rotation.set(time*3,time*3,0);});
    });
  }
}
// Kept available for small previews without depending on the UI implementation.
export function itemIcon(item:Item){return ITEM_ICONS[item];}
