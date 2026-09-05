import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Pilot,Racer } from './race';
import { roadFrame } from './road-geometry';
import { Course } from './course';
import {bodySections,hoodSections,shellGeometry,tyreGeometry,faceGeometry,moustacheGeometry} from './kart-surfaces';
import {kartReaction} from './kart-reactions';
import {wheelTravel} from './wheel-grounding';
const metal=new T.MeshStandardMaterial({color:'#b4c2bd',roughness:.3,metalness:.8});
const rubber=new T.MeshStandardMaterial({color:'#22282a',roughness:.92});
const dark=new T.MeshStandardMaterial({color:'#26393d',roughness:.7});
const up=new T.Vector3(0,1,0);
export class Kart {
  readonly root=new T.Group();
  private readonly chassis=new T.Group();
  private readonly motion=new T.Group();
  private readonly wheels:T.Group[]=[];
  private readonly front:T.Group[]=[];
  private readonly suspension:{pivot:T.Group;arm:T.Mesh;anchor:T.Vector3}[]=[];
  private readonly shield:T.Mesh;
  private readonly contactShadow:T.Mesh<T.PlaneGeometry,T.ShaderMaterial>;
  private contactFade=1;
  private readonly flames:T.Mesh[]=[];
  private readonly arms:T.Group[]=[];
  private readonly pilotRig=new T.Group();
  private readonly head=new T.Group();
  private readonly eyes:{eye:T.Group;gaze:T.Group}[]=[];
  private readonly brows:T.Mesh[]=[];
  private mouth:T.Mesh|null=null;
  private readonly steeringRotation=new T.Quaternion();
  private previousSpeed=0;
  private bounce=0;
  private bounceSpeed=0;
  private previousImpact=0;
  private previousHop=0;
  private previousBoost=false;
  private launchPulse=0;
  private celebration=0;
  private cameraAlpha=1;
  private readonly cameraMaterials:{material:T.Material;opacity:number;transparent:boolean;depthWrite:boolean}[]=[];
  private readonly paint:T.MeshPhysicalMaterial;
  constructor(readonly pilot:Pilot) {
    const paint=this.paint=new T.MeshPhysicalMaterial({color:pilot.color,roughness:.26,metalness:.2,clearcoat:1,clearcoatRoughness:.13});
    const trim=new T.MeshPhysicalMaterial({color:pilot.trim,roughness:.4,metalness:.07,clearcoat:.5});
    const suit=new T.MeshStandardMaterial({color:pilot.color,roughness:.86});
    const skin=new T.MeshStandardMaterial({color:pilot.skin,roughness:.8});
    const add=(geo:T.BufferGeometry,material:T.Material,x:number,y:number,z:number,parent:T.Object3D=this.chassis)=>{
      const m=new T.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
    };
    this.root.add(this.chassis);this.root.name=`kart-${pilot.id}`;
    const contactMaterial=new T.ShaderMaterial({
      transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
      uniforms:{alpha:{value:1},ink:{value:new T.Color('#182329')}},
      vertexShader:'varying vec2 shadowUv;void main(){shadowUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec2 shadowUv;uniform float alpha;uniform vec3 ink;
        float ellipse(vec2 p,vec2 radius){vec2 d=p/radius;return exp(-dot(d,d)*2.);}
        void main(){
          vec2 p=(shadowUv-.5)*vec2(3.45,4.7);
          float body=ellipse(p,vec2(1.18,1.7))*.12;
          float tyres=ellipse(p-vec2(-1.28,-1.22),vec2(.25,.42))+ellipse(p-vec2(1.28,-1.22),vec2(.25,.42))
                     +ellipse(p-vec2(-1.28,1.18),vec2(.25,.42))+ellipse(p-vec2(1.28,1.18),vec2(.25,.42));
          gl_FragColor=vec4(ink,min(.34,body+tyres*.28)*alpha);
          #include <colorspace_fragment>
        }`,
    });
    this.contactShadow=new T.Mesh(new T.PlaneGeometry(3.45,4.7),contactMaterial);
    this.contactShadow.name='kart-contact-shadow';this.contactShadow.rotation.x=-Math.PI/2;this.contactShadow.position.y=.012;
    this.contactShadow.renderOrder=2;this.root.add(this.contactShadow);
    add(shellGeometry(bodySections),paint,0,0,0).name='sculpted-body';
    add(shellGeometry(hoodSections),paint,0,0,0).name='sculpted-hood';
    // A small race badge follows the nose rather than floating over a flat box hood.
    const noseBadge=add(new T.SphereGeometry(.23,24,12),trim,0,1.17,.8);noseBadge.scale.y=.07;
    const bumperCurve=new T.CatmullRomCurve3([[-1.23,.43,1.89],[-1.02,.43,2.01],[0,.43,2.08],[1.02,.43,2.01],[1.23,.43,1.89]].map(v=>new T.Vector3(...v as [number,number,number])));
    add(new T.TubeGeometry(bumperCurve,28,.105,10,false),metal,0,0,0);
    for(const x of [-1,1]) {
      add(shellGeometry([{z:-1.28,width:.12,top:.82,bottom:.64},{z:-.95,width:.26,top:1.06,bottom:.56},{z:0,width:.25,top:1.02,bottom:.58},{z:.8,width:.17,top:.81,bottom:.6}],32,24),paint,x*.98,0,0);
      const lamp=add(new T.SphereGeometry(.13,16,12),new T.MeshBasicMaterial({color:'#fff0cc'}),x*.54,.9,1.72);lamp.scale.set(1,.46,.48);
      add(new T.BoxGeometry(.28,.11,.06),new T.MeshBasicMaterial({color:'#e74c2f'}),x*.75,.82,-1.89);
      add(new T.CylinderGeometry(.11,.13,.75,10),metal,x*.75,.63,-2).rotation.x=Math.PI/2;
      const flame=add(new T.ConeGeometry(.19,1.15,8),new T.MeshBasicMaterial({color:'#a3eff0',transparent:true,opacity:.85,depthWrite:false}),x*.75,.63,-2.6);flame.rotation.x=-Math.PI/2;flame.castShadow=false;this.flames.push(flame);
    }
    const spoiler=add(shellGeometry([{z:-1.32,width:.16,top:.04,bottom:-.04},{z:-.8,width:.24,top:.075,bottom:-.035},{z:.8,width:.24,top:.075,bottom:-.035},{z:1.32,width:.16,top:.04,bottom:-.04}],36,20),trim,0,1.45,-1.71);spoiler.rotation.y=Math.PI/2;
    for(const x of [-.85,.85])add(new T.CapsuleGeometry(.055,.52,4,10),metal,x,1.13,-1.65);
    add(new RoundedBoxGeometry(1.2,.9,1,3,.1),dark,0,1.15,-.49).rotation.x=-.16;
    for(const z of [-1.22,1.18])for(const x of [-1.28,1.28]) {
      const pivot=new T.Group();pivot.position.set(x,.49,z);this.root.add(pivot);if(z>0)this.front.push(pivot);
      const wheel=new T.Group();pivot.add(wheel);this.wheels.push(wheel);
      const tyre=add(tyreGeometry(),rubber,0,0,0,wheel);tyre.rotation.z=Math.PI/2;tyre.name='tyre';
      add(new T.CylinderGeometry(.3,.3,.37,16),metal,0,0,0,wheel).rotation.z=Math.PI/2;
      add(new T.CylinderGeometry(.12,.12,.4,10),trim,0,0,0,wheel).rotation.z=Math.PI/2;
      for(const face of [-1,1])for(let i=0;i<5;i++){
        const a=i*Math.PI*2/5,spoke=add(new T.CapsuleGeometry(.025,.22,3,7),dark,face*.17,Math.cos(a)*.15,Math.sin(a)*.15,wheel);spoke.rotation.x=a;
      }
      const arm=add(new T.CylinderGeometry(.045,.045,1.1,7),metal,x*.65,.52,z);arm.rotation.z=Math.PI/2;
      this.suspension.push({pivot,arm,anchor:new T.Vector3(Math.sign(x)*.52,.62,z)});
    }
    this.chassis.add(this.pilotRig);
    const white=new T.MeshStandardMaterial({color:'#fff9ef',roughness:.6});
    const blue=new T.MeshStandardMaterial({color:'#1472dc',roughness:.7});
    const brown=new T.MeshStandardMaterial({color:'#573121',roughness:.85});
    const gold=new T.MeshStandardMaterial({color:'#ffce2e',roughness:.25,metalness:.45});
    const black=new T.MeshStandardMaterial({color:'#172535',roughness:.6});
    const character=pilot.look as string;
    const isPeach=character==='peach',isYoshi=character==='yoshi',isLuigi=character==='luigi';
    const eye=(x:number,y:number,z:number,radius:number,tall:number)=>{
      const group=new T.Group(),gaze=new T.Group();group.position.set(x,y,z);this.head.add(group);
      add(new T.SphereGeometry(radius,20,16),white,0,0,0,group).scale.y=tall;
      group.add(gaze);gaze.position.z=radius*.87;
      add(new T.SphereGeometry(radius*.51,16,12),isYoshi?black:blue,0,0,0,gaze).scale.set(1,1.5,.7);
      add(new T.SphereGeometry(radius*.27,12,10),black,0,0,radius*.29,gaze).scale.set(1,1.5,.7);
      add(new T.SphereGeometry(radius*.17,10,8),white,-radius*.16,radius*.33,radius*.43,gaze);
      this.eyes.push({eye:group,gaze});
    };
    add(new T.CapsuleGeometry(isPeach?.35:.38,.48,5,16),isPeach||isYoshi?suit:blue,0,1.52,-.37,this.pilotRig).rotation.x=-.12;
    if(!isPeach&&!isYoshi){
      for(const side of [-1,1]){
        add(new T.BoxGeometry(.1,.5,.055),blue,side*.2,1.64,-.04,this.pilotRig);
        add(new T.SphereGeometry(.058,10,8),gold,side*.2,1.66,.005,this.pilotRig);
      }
    }
    this.head.position.set(0,isLuigi?2.3:2.2,-.35);this.pilotRig.add(this.head);
    if(isYoshi){
      add(new T.SphereGeometry(.5,24,18),suit,0,.02,0,this.head);
      const snout=add(new T.SphereGeometry(.46,24,18),suit,0,-.03,.44,this.head);snout.scale.set(1.16,.9,1.05);
      const jaw=add(new T.SphereGeometry(.39,20,14),white,0,-.23,.34,this.head);jaw.scale.y=.64;
      for(const side of [-1,1]){
        add(new T.CapsuleGeometry(.17,.21,6,12),suit,side*.19,.4,.05,this.head);
        eye(side*.19,.43,.2,.145,1.4);
        add(new T.SphereGeometry(.033,8,6),black,side*.17,.13,.85,this.head);
      }
      const red=new T.MeshStandardMaterial({color:'#f64432',roughness:.7});
      for(let i=0;i<3;i++)add(new T.ConeGeometry(.14,.23,6),red,0,.26-i*.23,-.43,this.head).rotation.x=-Math.PI/2;
      add(new T.SphereGeometry(.32,16,12),red,0,1.68,-.76,this.pilotRig).scale.set(1,.75,.5);
    } else {
      if(isPeach){
        const hair=add(new T.SphereGeometry(.57,24,16),gold,0,0,-.13,this.head);hair.scale.set(1,1.17,.9);
        for(const side of [-1,1])add(new T.CapsuleGeometry(.17,.43,5,12),gold,side*.4,-.3,-.12,this.head).rotation.z=-side*.18;
      }
      const face=add(isPeach?new T.SphereGeometry(.48,28,20):faceGeometry(isLuigi),skin,0,0,.03,this.head);face.scale.y=isPeach?1.07:1;
      for(const side of [-1,1]){
        add(new T.SphereGeometry(.12,12,10),skin,side*.47,-.02,.04,this.head);
        eye(side*.16,.09,.45,.095,1.5);
        const brow=add(new T.CapsuleGeometry(.026,.13,4,10),isPeach?gold:brown,side*.17,.265,.395,this.head);brow.rotation.z=Math.PI/2;this.brows.push(brow);
      }
      add(new T.SphereGeometry(isPeach?.07:.17,18,12),skin,0,-.04,isPeach?.5:.52,this.head);
      if(isPeach){
        const lips=add(new T.SphereGeometry(.075,12,8),new T.MeshStandardMaterial({color:'#e94c8c'}),0,-.23,.43,this.head);lips.scale.y=.35;
        for(const side of [-1,1]){
          add(new T.SphereGeometry(.09,12,10),blue,side*.48,-.17,.08,this.head).scale.y=1.25;
          add(new T.SphereGeometry(.2,16,12),gold,side*.29,.29,.25,this.head).scale.set(1.2,.9,.8);
        }
        add(new T.CylinderGeometry(.23,.19,.17,12),gold,0,.56,0,this.head);
        for(let i=0;i<5;i++){const a=i/5*Math.PI*2;add(new T.ConeGeometry(.07,.22,5),gold,Math.sin(a)*.21,.73,Math.cos(a)*.21,this.head);}
        add(new T.SphereGeometry(.07,12,10),new T.MeshStandardMaterial({color:'#ef4583',metalness:.25,roughness:.15}),0,.6,.205,this.head);
        add(new T.SphereGeometry(.095,12,10),blue,0,1.68,.035,this.pilotRig).scale.y=1.3;
      } else {
        // Broad cloth cap, shaped bill and one bevelled moustache form a joined silhouette.
        const cap=add(new T.SphereGeometry(.53,24,14,0,Math.PI*2,0,Math.PI*.58),suit,0,.14,-.02,this.head);
        cap.scale.y=isLuigi?1.08:1;
        add(shellGeometry([{z:.18,width:.37,top:.27,bottom:.22},{z:.38,width:.44,top:.27,bottom:.205},{z:.6,width:.33,top:.24,bottom:.19},{z:.7,width:.05,top:.205,bottom:.18}],28,20),suit,0,0,0,this.head);
        add(moustacheGeometry(),brown,0,-.115,.425,this.head);
        this.mouth=add(new T.SphereGeometry(.085,16,12),black,0,-.29,.39,this.head);this.mouth.scale.set(1,.28,.2);
        for(const side of [-1,1])add(new T.BoxGeometry(.12,.25,.14),brown,side*.41,.015,.19,this.head).rotation.z=side*.15;
        const badge=add(new T.CylinderGeometry(.145,.145,.015,24),white,0,.37,.436,this.head);badge.rotation.x=Math.PI/2;
        if(isLuigi){
          add(new T.BoxGeometry(.035,.16,.02),suit,-.038,.37,.456,this.head);
          add(new T.BoxGeometry(.095,.035,.02),suit,0,.3,.456,this.head);
        }else{
          for(const side of [-1,1]){
            add(new T.BoxGeometry(.033,.16,.02),suit,side*.064,.37,.456,this.head);
            add(new T.BoxGeometry(.027,.12,.02),suit,side*.026,.395,.456,this.head).rotation.z=side*.5;
          }
        }
      }
    }
    for(const side of [-1,1]){
      const arm=new T.Group();arm.position.set(side*.37,1.7,-.03);this.pilotRig.add(arm);this.arms.push(arm);
      add(new T.CapsuleGeometry(.13,.47,5,12),suit,0,-.1,.04,arm).rotation.x=.8;
      add(new T.SphereGeometry(.16,14,10),white,-side*.08,-.24,.38,arm);
      add(new RoundedBoxGeometry(.32,.23,.53,3,.09),isYoshi?new T.MeshStandardMaterial({color:'#ff9d29',roughness:.6}):brown,side*.28,1.03,.33,this.pilotRig);
    }
    add(new T.TorusGeometry(.3,.035,7,18),rubber,0,1.5,.39,this.pilotRig).rotation.x=.72;
    // Lean about the seat, rather than sweeping the whole driver about the road.
    this.pilotRig.children.forEach(child=>child.position.y-=1.3);this.pilotRig.position.y=1.3;
    const shieldMaterial=new T.MeshPhysicalMaterial({color:'#94dfda',transparent:true,opacity:.16,roughness:.1,metalness:.1,side:T.DoubleSide});
    this.shield=add(new T.SphereGeometry(2.15,20,16),shieldMaterial,0,1.1,0,this.root);this.shield.scale.z=1.2;this.shield.visible=false;this.shield.castShadow=false;
    // The visual reaction pivot keeps the physics root, held items and camera stable.
    this.motion.name='kart-reaction';this.motion.position.y=.78;this.root.add(this.motion);
    for(const object of [this.chassis,...this.wheels.map(w=>w.parent!)]){this.motion.add(object);object.position.y-=.78;}
    this.chassis.name='kart-chassis';this.pilotRig.name='driver';this.head.name='driver-head';
    const shared=new Map<T.Material,T.Material>(),seen=new Set<T.Material>();
    this.root.traverse(object=>{
      if(!(object instanceof T.Mesh))return;
      const own=(material:T.Material)=>{
        if(material===metal||material===rubber||material===dark){
          if(!shared.has(material))shared.set(material,material.clone());
          material=shared.get(material)!;
        }
        if(!seen.has(material)){seen.add(material);this.cameraMaterials.push({material,opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite});}
        return material;
      };
      object.material=Array.isArray(object.material)?object.material.map(own):own(object.material);
    });
  }
  cameraOpacity(target:number,dt:number) {
    this.cameraAlpha=T.MathUtils.damp(this.cameraAlpha,target,target<this.cameraAlpha?28:9,dt);
    if(this.cameraAlpha>.998&&target===1)this.cameraAlpha=1;
    for(const base of this.cameraMaterials){
      const transparent=base.transparent||this.cameraAlpha<1;
      if(base.material.transparent!==transparent){base.material.transparent=transparent;base.material.needsUpdate=true;}
      base.material.opacity=base.opacity*this.cameraAlpha;base.material.depthWrite=this.cameraAlpha<1?false:base.depthWrite;
    }
    this.contactShadow.material.uniforms.alpha.value=this.contactFade*this.cameraAlpha;
  }
  update(r:Racer,course:Course,dt:number,time:number) {
    const visual=r as Racer&{hop?:number;boostKind?:string;hitKind?:'spin'|'tumble'|'bump'|null;throwTime?:number;throwAnimation?:number;heldItem?:unknown};
    const hop=Math.max(0,visual.hop??0);
    const boosting=r.boost>0&&r.finished===null,driftDirection=r.driftDirection||Math.sign(r.steer);
    const reaction=kartReaction(r.finished!==null?{...visual,hit:0}:visual);
    this.contactFade=Math.exp(-hop*6-reaction.lift*3)*(r.hit>0?.55:1);
    this.contactShadow.visible=this.contactFade>.012;
    this.contactShadow.position.y=.012-hop;
    this.contactShadow.material.uniforms.alpha.value=this.contactFade*this.cameraAlpha;
    const throwProgress=visual.throwAnimation?1-T.MathUtils.clamp(visual.throwAnimation/.36,0,1):0;
    const throwing=visual.throwAnimation?Math.sin(throwProgress*Math.PI):0;
    const throwSwing=visual.throwAnimation?(throwProgress<.6?T.MathUtils.lerp(1.6,-.55,throwProgress/.6):T.MathUtils.lerp(-.55,0,(throwProgress-.6)/.4)):0;
    const preparing=visual.heldItem?Math.min(1,(visual.throwTime??.2)*3):0;
    this.celebration=r.finished!==null?Math.min(1,this.celebration+dt*2.5):0;
    const cheer=this.celebration*(.86+Math.sin(time*5)*.14);
    this.root.position.copy(course.position(r.distance,r.lane,hop+.05));
    this.root.quaternion.copy(roadFrame(course,r.distance,r.lane).quaternion).multiply(this.steeringRotation.setFromAxisAngle(up,-r.yaw));
    const roadUp=up.clone().applyQuaternion(this.root.quaternion),groundRoot=this.root.position.clone();groundRoot.y-=hop;
    for(const suspension of this.suspension){
      const {pivot,arm,anchor}=suspension;
      const nominal=new T.Vector3(pivot.position.x,.01,pivot.position.z).applyQuaternion(this.root.quaternion).add(groundRoot);
      const travel=r.hit>0?0:wheelTravel(course,r.distance,nominal,roadUp);
      pivot.position.y=-.29+travel;
      const hub=new T.Vector3(pivot.position.x,.49+travel,pivot.position.z),direction=hub.clone().sub(anchor);
      arm.position.copy(anchor).add(hub).multiplyScalar(.5);arm.scale.y=direction.length()/1.1;
      arm.quaternion.setFromUnitVectors(up,direction.normalize());
    }
    const acceleration=dt>0&&dt<.1?T.MathUtils.clamp((r.speed-this.previousSpeed)/dt,-30,25):0;this.previousSpeed=r.speed;
    const impact=r.impact??0;
    if(impact>this.previousImpact+.08)this.bounceSpeed-=impact*.65;
    if(this.previousHop>0&&hop===0)this.bounceSpeed-=.6;
    if(boosting&&!this.previousBoost){this.launchPulse=1;this.bounceSpeed+=.22;}
    this.previousHop=hop;this.previousBoost=boosting;
    this.launchPulse=Math.max(0,this.launchPulse-dt*3.2);
    this.previousImpact=impact;
    const springDt=Math.min(dt,.035);this.bounceSpeed+=(-this.bounce*85-this.bounceSpeed*13)*springDt;this.bounce+=this.bounceSpeed*springDt;
    this.motion.rotation.set(reaction.pitch,reaction.yaw,reaction.roll,'XYZ');this.motion.position.y=.78+reaction.lift;
    this.chassis.position.y=-.78+T.MathUtils.clamp(this.bounce,-.09,.1);
    this.chassis.rotation.x=T.MathUtils.damp(this.chassis.rotation.x,-acceleration*.0025-this.launchPulse*.075,11,dt);
    this.chassis.rotation.z=T.MathUtils.damp(this.chassis.rotation.z,r.drifting?-driftDirection*.085:-r.steer*.04,12,dt);
    this.pilotRig.rotation.z=T.MathUtils.damp(this.pilotRig.rotation.z,r.drifting?driftDirection*.17:r.steer*.065,12,dt);
    this.pilotRig.rotation.x=T.MathUtils.damp(this.pilotRig.rotation.x,this.launchPulse*.08+reaction.duck-cheer*.075,10,dt);
    this.pilotRig.rotation.y=T.MathUtils.damp(this.pilotRig.rotation.y,-preparing*.12+throwing*.2,15,dt);
    this.pilotRig.position.y=1.3+cheer*.035;
    const lookAhead=course.at(r.distance+Math.max(8,r.speed*.4)).curvature;
    const gaze=T.MathUtils.clamp(r.drifting?driftDirection*.4:r.steer*.19+lookAhead*3.5,-.42,.42);
    this.head.rotation.y=T.MathUtils.damp(this.head.rotation.y,-gaze+cheer*.3,8,dt);
    this.head.rotation.x=T.MathUtils.damp(this.head.rotation.x,this.launchPulse*.06+reaction.duck*.8-cheer*.08,9,dt);
    this.head.rotation.z=Math.sin(time*(r.speed>5?9:2))*(r.speed>5?.014:.008);
    this.arms[1].rotation.x=preparing*1.3+throwSwing-cheer*1.55;
    this.arms[1].rotation.y=-preparing*.4+throwing*.65;
    this.arms[1].rotation.z=-preparing*.3-throwing*.2-cheer*.7;
    this.arms[0].rotation.x=-cheer*1.25;this.arms[0].rotation.z=cheer*.65;
    const blinkPhase=(time+this.pilot.id.length*.37)%3.7;
    const blink=blinkPhase<.15?Math.max(.06,Math.abs(blinkPhase/.075-1)):1;
    this.eyes.forEach(({eye,gaze:iris})=>{
      eye.scale.y=r.hit>.25?.3:blink;iris.position.x=T.MathUtils.damp(iris.position.x,-gaze*.045,13,dt);iris.position.y=cheer*.01;
    });
    this.brows.forEach((brow,i)=>brow.rotation.z=Math.PI/2+(i===0?-1:1)*(r.hit>0?.25:r.drifting?.12:-cheer*.12));
    if(this.mouth)this.mouth.scale.y=.28+cheer*.68;
    this.paint.color.set(r.pilot.color);if(r.star>0)this.paint.color.setHSL((time*.7)%1,.95,.58);
    this.chassis.rotation.y=0;
    this.wheels.forEach(w=>w.rotation.x+=r.speed*dt/.48);
    const wheelSteer=r.drifting?driftDirection*.19-r.steer*.09:-r.steer*.38;
    this.front.forEach(w=>w.rotation.y=T.MathUtils.damp(w.rotation.y,wheelSteer,18,dt));
    this.shield.visible=r.shield>0;
    const boostColor=visual.boostKind==='ultra'?'#ed8cff':visual.boostKind==='super'?'#ffaf35':visual.boostKind==='mini'?'#5de0ff':'#7ef0ff';
    this.flames.forEach((f,i)=>{
      f.visible=boosting;const flicker=.84+Math.sin(time*47+i*2)*.16;
      f.scale.set(flicker,1.05+this.launchPulse*.8+Math.sin(time*33+i)*.2,flicker);
      (f.material as T.MeshBasicMaterial).color.set(boostColor);
    });

  }
  dispose() {this.root.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>{if(m!==metal&&m!==rubber&&m!==dark)m.dispose();});}});}
}
