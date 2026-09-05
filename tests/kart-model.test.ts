import {describe,expect,it} from 'vitest';
import * as T from 'three';
import {Kart} from '../src/game/kart';
import {Course} from '../src/game/course';
import {makeRacer,PILOTS} from '../src/game/race';
import {bodySections,hoodSections,shellGeometry,tyreGeometry} from '../src/game/kart-surfaces';
import {ChaseCameraRig,constrainChaseCamera} from '../src/game/chase-camera';

const course=new Course();
function visibleModelFloor(kart:Kart){
  kart.root.updateMatrixWorld(true);const inverse=kart.root.matrixWorld.clone().invert();
  let floor=Infinity;
  const visit=(object:T.Object3D)=>{
    if(!object.visible)return;
    if(object instanceof T.Mesh){
      const matrix=inverse.clone().multiply(object.matrixWorld),position=object.geometry.attributes.position;
      for(let i=0;i<position.count;i++)floor=Math.min(floor,new T.Vector3().fromBufferAttribute(position,i).applyMatrix4(matrix).y);
    }
    object.children.forEach(visit);
  };visit(kart.root);return floor;
}
describe('sculpted kart and reaction animation',()=>{
  it('constructs only a ground kart for every pilot, even with obsolete gliding flags',()=>{
    for(const pilot of PILOTS){
      const kart=new Kart(pilot),r=makeRacer(pilot);r.distance=620;r.flying=true;r.height=8;r.trick=.65;r.hop=.3;
      kart.update(r,course,1,1);kart.root.updateMatrixWorld(true);
      expect(kart.root.getObjectByName('deltaplane')).toBeUndefined();
      expect(kart.root.position.distanceTo(course.position(r.distance,r.lane,.35))).toBeLessThan(.00001);
      const inverse=kart.root.matrixWorld.clone().invert();let top=-Infinity;
      const visit=(object:T.Object3D)=>{
        expect(/deltaplane|canopy|glider/.test(object.name)).toBe(false);
        if(!object.visible)return;
        if(object instanceof T.Mesh){
          const positions=object.geometry.attributes.position,matrix=inverse.clone().multiply(object.matrixWorld);
          expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
          for(let i=0;i<positions.count;i++)top=Math.max(top,new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(matrix).y);
        }
        object.children.forEach(visit);
      };visit(kart.root);expect(top).toBeLessThan(3.35);kart.dispose();
    }
  });
  it('preserves the collision envelope and outward winding of body shells',()=>{
    for(const sections of [bodySections,hoodSections]){
      const geometry=shellGeometry(sections);geometry.computeBoundingBox();
      const box=geometry.boundingBox!;
      expect(box.min.x).toBeGreaterThan(-1.14);expect(box.max.x).toBeLessThan(1.14);
      expect(box.min.z).toBeGreaterThan(-1.84);expect(box.max.z).toBeLessThan(1.89);
      const p=geometry.attributes.position,index=geometry.index!,a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();let volume=0;
      for(let i=0;i<index.count;i+=3){a.fromBufferAttribute(p,index.getX(i));b.fromBufferAttribute(p,index.getX(i+1));c.fromBufferAttribute(p,index.getX(i+2));volume+=a.dot(b.cross(c))/6;}
      expect(volume).toBeGreaterThan(.1);expect(Array.from(geometry.attributes.normal.array).every(Number.isFinite)).toBe(true);geometry.dispose();
    }
    const tyre=tyreGeometry();tyre.computeBoundingBox();expect(tyre.boundingBox!.max.x).toBeCloseTo(.48,5);expect(tyre.boundingBox!.max.y).toBeCloseTo(.175,5);tyre.dispose();
  });
  it('keeps visible tyres, exhaust and driver above the road through a complete tumble',()=>{
    const kart=new Kart(PILOTS[0]),r=makeRacer(PILOTS[0]);r.distance=60;r.hitKind='tumble';r.speed=0;
    for(let i=0;i<=24;i++){
      r.hit=1.55*(1-i/24);kart.update(r,course,1/60,i/60);
      expect(visibleModelFloor(kart)).toBeGreaterThan(-.025);
    }
    expect(kart.root.getObjectByName('kart-reaction')!.rotation.x).toBe(0);kart.dispose();
  });
  it('keeps the physics root stable during spin and makes throwing and finish poses distinct',()=>{
    const kart=new Kart(PILOTS[0]),r=makeRacer(PILOTS[0]);r.distance=60;r.hitKind='spin';r.hit=.8;
    kart.update(r,course,1/60,1);
    expect(kart.root.position.distanceTo(course.position(r.distance,r.lane,.05))).toBeLessThan(.00001);
    expect(Math.abs(kart.root.getObjectByName('kart-reaction')!.rotation.y)).toBeGreaterThan(.5);
    r.hit=0;r.throwAnimation=.18;kart.update(r,course,1/60,1.1);
    const driver=kart.root.getObjectByName('driver')!,throwPose=driver.rotation.y;
    expect(Math.abs(throwPose)).toBeGreaterThan(.01);
    r.throwAnimation=0;r.finished=30;for(let i=0;i<40;i++)kart.update(r,course,1/60,2+i/60);
    expect(driver.position.y).toBeGreaterThan(1.32);kart.dispose();
  });
});
describe('camera event direction',()=>{
  it('keeps road framing stable during the drift hop and ignores obsolete airborne state',()=>{
    const rig=new ChaseCameraRig(),r=makeRacer(PILOTS[0]);r.distance=620;r.speed=30;
    const before=rig.update(course,r,1/60);r.hop=.36;r.flying=true;r.height=8;r.trick=.65;
    const after=rig.update(course,r,1/60);
    expect(after.position.distanceTo(before.position)).toBe(0);expect(after.target.distanceTo(before.target)).toBe(0);expect(after.mode).toBe('drive');
    r.drifting=true;r.driftDirection=1;
    for(let i=0;i<60;i++)rig.update(course,r,1/60);
    expect(rig.update(course,r,0).mode).toBe('drift');
    r.drifting=false;for(let i=0;i<60;i++)rig.update(course,r,1/60);expect(rig.update(course,r,0).mode).toBe('drive');
  });
  it('uses time-based transitions and resets finish framing between races',()=>{
    const r=makeRacer(PILOTS[0]),a=new ChaseCameraRig(),b=new ChaseCameraRig();r.distance=40;
    a.update(course,r,0);b.update(course,r,0);r.drifting=true;r.driftDirection=1;
    for(let i=0;i<30;i++)a.update(course,r,1/30);for(let i=0;i<120;i++)b.update(course,r,1/120);
    expect(a.update(course,r,0).position.distanceTo(b.update(course,r,0).position)).toBeLessThan(.00001);
    r.finished=100;for(let i=0;i<60;i++)a.update(course,r,1/60);expect(a.update(course,r,0).mode).toBe('finish');
    a.reset();r.finished=null;r.drifting=false;expect(a.update(course,r,0).mode).toBe('drive');
  });
  it('follows a racer onto the widened shortcut instead of staying over the main lane',()=>{
    const rig=new ChaseCameraRig(),r=makeRacer(PILOTS[0]);r.distance=(course.shortcut.start+course.shortcut.end)/2;r.lane=-12.5;
    const pose=rig.update(course,r,0),sample=course.at(pose.distance);
    const lane=pose.position.clone().sub(sample.p).dot(sample.right);
    expect(lane).toBeLessThan(-11);expect(lane).toBeGreaterThan(course.railLane(pose.distance,-1));
  });
  it('keeps the whole kart compact in the frame on the main track and inside shortcut',()=>{
    const kart=new Kart(PILOTS[0]),r=makeRacer(PILOTS[0]),camera=new T.PerspectiveCamera(63,16/9,.1,1800);
    for(const [distance,lane] of [[85,0],[(course.shortcut.start+course.shortcut.end)/2,-12.5]]){
      r.distance=distance;r.lane=lane;r.speed=30;kart.update(r,course,1,0);kart.root.updateMatrixWorld(true);
      const rig=new ChaseCameraRig(),pose=rig.update(course,r,0);camera.position.copy(pose.position);constrainChaseCamera(course,r,camera.position);camera.lookAt(pose.target);camera.updateMatrixWorld(true);
      let top=-Infinity,bottom=Infinity;
      const visit=(object:T.Object3D)=>{
        if(!object.visible||object.name==='kart-contact-shadow')return;
        if(object instanceof T.Mesh){
          const positions=object.geometry.attributes.position;
          for(let i=0;i<positions.count;i++){
            const p=new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(object.matrixWorld).project(camera);
            top=Math.max(top,p.y);bottom=Math.min(bottom,p.y);
          }
        }
        object.children.forEach(visit);
      };visit(kart.root);
      const fraction=(top-bottom)/2;
      console.info(`Kart projected height at ${distance.toFixed(0)} m / lane ${lane}: ${(fraction*100).toFixed(1)}%; boom ${camera.position.distanceTo(kart.root.position).toFixed(2)} m; height ${(camera.position.y-kart.root.position.y).toFixed(2)} m`);
      expect(fraction).toBeGreaterThan(.18);expect(fraction).toBeLessThan(.26);
    }
    kart.dispose();
  });
  it('constrains an interpolated boom inside the road corridor without touching racer state',()=>{
    const r=makeRacer(PILOTS[0]);r.distance=260;r.lane=5;r.yaw=.3;
    const before={distance:r.distance,lane:r.lane,yaw:r.yaw},sample=course.at(r.distance-12);
    const position=course.position(r.distance-12,18,4.5);constrainChaseCamera(course,r,position);
    expect(position.clone().sub(sample.p).dot(sample.right)).toBeLessThan(course.railLane(r.distance-12,1));
    expect({distance:r.distance,lane:r.lane,yaw:r.yaw}).toEqual(before);
  });
});
