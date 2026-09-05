import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {Course} from '../src/game/course';
import {makeRacer,PILOTS} from '../src/game/race';
import {roadFrame} from '../src/game/road-geometry';
import {chasePose,constrainChaseCamera,cameraKartOpacity} from '../src/game/chase-camera';
import {DrivingEffects} from '../src/game/driving-effects';
const course=new Course();
describe('kart surface and chase camera',()=>{
  it('fades a rival kart crossing the camera while preserving racers ahead and beside the view',()=>{
    const camera=new T.Vector3(0,5,0),target=new T.Vector3(0,2,16);
    expect(cameraKartOpacity(new T.Vector3(0,2,3),camera,target)).toBeLessThan(.25);
    expect(cameraKartOpacity(new T.Vector3(0,0,20),camera,target)).toBe(1);
    expect(cameraKartOpacity(new T.Vector3(9,2,3),camera,target)).toBe(1);
  });
  it('aligns wheel plane with the same banked road through the tightest bends',()=>{
    for(let s=0;s<course.length;s+=7){
      const frame=roadFrame(course,s,3),up=new T.Vector3(0,1,0).applyQuaternion(frame.quaternion);
      expect(up.dot(frame.up)).toBeCloseTo(1,6);expect(up.y).toBeGreaterThan(.8);
      expect(new T.Vector3(0,0,1).applyQuaternion(frame.quaternion).dot(frame.forward)).toBeCloseTo(1,6);
    }
  });
  it('keeps the smoothed camera above road and below the tunnel roof',()=>{
    const r=makeRacer(PILOTS[0]);r.speed=28;r.lane=5.5;r.yaw=.6;
    for(let s=course.tunnel[0]+25;s<course.tunnel[1]-12;s+=2){
      r.distance=s;const pose=chasePose(course,r);
      const low=pose.position.clone();low.y-=20;constrainChaseCamera(course,r,low);
      const high=pose.position.clone();high.y+=20;constrainChaseCamera(course,r,high);
      expect(low.y).toBeGreaterThan(course.at(pose.distance).p.y+1.5);
      expect(high.y).toBeLessThan(course.at(pose.distance).p.y+9);
      expect(pose.position.distanceTo(pose.target)).toBeLessThan(26);
    }
  });
  it('applies the cave ceiling only inside the main tunnel, not on the parallel ridge',()=>{
    const route=course.routes.find(route=>route.id==='ridge')!,s=(course.tunnel[0]+course.tunnel[1])/2;
    const r=makeRacer(PILOTS[0]);r.distance=s+12;r.lane=course.routeLane(route,r.distance);
    const lane=course.routeLane(route,s);expect(Math.abs(lane)).toBeGreaterThan(10.8);
    const outside=course.position(s,lane,7),height=outside.y;constrainChaseCamera(course,r,outside);
    expect(outside.y).toBeCloseTo(height,5);
    const inside=course.position(s,0,20);constrainChaseCamera(course,r,inside);
    expect(inside.y).toBeLessThan(course.position(s,0,9).y);
  });
  it('uses bounded effect pools through repeated contacts and drifts',()=>{
    const scene=new T.Scene(),effects=new DrivingEffects(scene,course),r=makeRacer(PILOTS[0]);r.speed=25;r.drifting=true;
    for(let i=0;i<200;i++){r.distance=100+i*.4;r.impact=i%20===0?.7:0;effects.update([r],1/60,i/60);}
    expect(scene.children).toHaveLength(2);
    for(const object of scene.children){expect(object).toBeInstanceOf(T.InstancedMesh);expect(Array.from((object as T.InstancedMesh).instanceMatrix.array).every(Number.isFinite)).toBe(true);}
    effects.reset();effects.update([r],1/60,4);expect(scene.children).toHaveLength(2);
  });
});
