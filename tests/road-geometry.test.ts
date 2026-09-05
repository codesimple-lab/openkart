import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { Course } from '../src/game/course';
import { roadDecal, roadFrame, roadRibbon } from '../src/game/road-geometry';
import { World } from '../src/game/world';

const course=new Course();
describe('banked track rendering',()=>{
  it('has upward, nondegenerate faces and a smooth closed seam',()=>{
    const geometry=roadRibbon(course,{left:-8.5,right:8.5});
    const p=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),index=geometry.index!;
    const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
    for(let i=0;i<index.count;i+=3) {
      a.fromBufferAttribute(p,index.getX(i));b.fromBufferAttribute(p,index.getX(i+1));c.fromBufferAttribute(p,index.getX(i+2));
      const face=b.sub(a).cross(c.sub(a));
      expect(face.length()).toBeGreaterThan(.001);
      expect(face.normalize().y).toBeGreaterThan(.72);
    }
    for(let side=0;side<2;side++) {
      expect(a.fromBufferAttribute(p,side).distanceTo(b.fromBufferAttribute(p,p.count-2+side))).toBeLessThan(.0001);
      expect(a.fromBufferAttribute(normal,side).distanceTo(b.fromBufferAttribute(normal,p.count-2+side))).toBeLessThan(.0001);
    }
  });
  it('renders an uninterrupted road and curbs through the former aerial section',()=>{
    for(const lanes of [[-8.5,8.5],[-9.15,-8.5],[8.5,9.15]]) {
      const g=roadRibbon(course,{start:course.flight[0],end:course.flight[1],left:lanes[0],right:lanes[1]});
      expect(g.index!.count).toBe((g.getAttribute('position').count/2-1)*6);
      for(let s=course.flight[0];s<=course.flight[1];s++)expect(course.inVoid(s)||course.inFlight(s)).toBe(false);
    }
  });
  it('aligns kart axes with the actual sloped, banked surface',()=>{
    for(let s=0;s<course.length;s+=17)for(const lane of [-5,0,5]) {
      const frame=roadFrame(course,s,lane);
      const across=course.position(s,lane-.25).sub(course.position(s,lane+.25)).normalize();
      expect(frame.up.y).toBeGreaterThan(.8);
      expect(Math.abs(frame.up.dot(across))).toBeLessThan(.00001);
      expect(Math.abs(frame.right.dot(frame.forward))).toBeLessThan(.00001);
      expect(new T.Vector3(0,0,1).applyQuaternion(frame.quaternion).dot(frame.forward)).toBeCloseTo(1,6);
    }
  });
  it('keeps every boost vertex on the banked road with a full, undistorted decal UV',()=>{
    for(const s of course.boosts) {
      const g=roadDecal(course,s-2.1,s+2.1,-3.5,3.5,.09),p=g.getAttribute('position'),uv=g.getAttribute('uv');
      for(let i=0;i<p.count;i++) {
        const distance=T.MathUtils.lerp(s-2.1,s+2.1,1-uv.getY(i));
        const expected=course.position(distance,i%2?3.5:-3.5,.09);
        expect(new T.Vector3().fromBufferAttribute(p,i).distanceTo(expected)).toBeLessThan(.00003);
        expect(uv.getX(i)).toBe(i%2);
      }
    }
  });
  it('keeps the actual triangulated island terrain below both banked road edges',()=>{
    const sample=(World.prototype as unknown as {terrainAt(x:number,z:number):number}).terrainAt;
    const terrain=(x:number,z:number)=>sample.call({course} as never,x,z);
    const dx=610/145,dz=670/155;
    for(let s=0;s<course.length;s+=5) {
      if(course.inVoid(s))continue;
      for(const lane of [-8.5,0,8.5]) {
        const p=course.position(s,lane),x=(p.x+305)/dx,z=(p.z+380)/dz;
        const ix=Math.floor(x),iz=Math.floor(z),tx=x-ix,tz=z-iz;
        const x0=ix*dx-305,z0=iz*dz-380;
        const h00=terrain(x0,z0),h10=terrain(x0+dx,z0),h01=terrain(x0,z0+dz),h11=terrain(x0+dx,z0+dz);
        const height=tx+tz<=1?h00+tx*(h10-h00)+tz*(h01-h00):h11+(1-tx)*(h01-h11)+(1-tz)*(h10-h11);
        expect(height,`terrain pierces road at ${s}m lane ${lane}`).toBeLessThan(p.y-.2);
      }
    }
  });
});
