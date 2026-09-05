import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {Course} from '../src/game/course';
import {makeRacer,PILOTS} from '../src/game/race';
import {driveVehicle} from '../src/game/vehicle-physics';
import {roadRibbon} from '../src/game/road-geometry';
import {railContact} from '../src/game/contacts';
import {neutral} from '../src/network/protocol';
import {World} from '../src/game/world';
const course=new Course();
describe('mushroom corner cut',()=>{
  it('opens a gradual inside corridor with real grass and a shared collision barrier',()=>{
    expect(course.shoulder(425,-1)).toBeCloseTo(0,10);expect(course.shoulder(480,-1)).toBe(6.5);expect(course.shoulder(550,-1)).toBeCloseTo(0,10);
    expect(course.shoulder(480,1)).toBe(0);
    expect(course.surface(480,8)).toBe('asphalt');expect(course.surface(480,-8.8)).toBe('curb');expect(course.surface(480,-12)).toBe('grass');
    const r=makeRacer(PILOTS[0]);r.distance=480;r.lane=-12;r.speed=30;railContact(r,course);expect(r.lane).toBe(-12);
    r.lane=-16;railContact(r,course);expect(r.lane).toBeGreaterThan(-14.2);
  });
  it('slows gradually in grass but preserves mushroom and star speed',()=>{
    const plain=makeRacer(PILOTS[0]),boost=makeRacer(PILOTS[0]),star=makeRacer(PILOTS[0]);
    const road={...course.at(480),curvature:0,tangent:new T.Vector3(0,0,1)};
    for(const r of [plain,boost,star]){r.distance=460;r.lane=-12;r.speed=30;}
    boost.boost=2;star.star=2;
    driveVehicle(plain,{...neutral(),throttle:1},road,course,1/120);expect(plain.speed).toBeGreaterThan(29);
    for(let i=0;i<120;i++)for(const r of [plain,boost,star])driveVehicle(r,{...neutral(),throttle:1},road,course,1/120);
    expect(plain.speed).toBeLessThan(18);expect(boost.speed).toBeGreaterThan(35);expect(star.speed).toBeGreaterThan(33);
    expect(1-course.at(480).curvature*(-12)).toBeLessThan(1-course.at(480).curvature*(-3));
  });
  it('keeps the varying ribbon facing upwards and above triangulated terrain',()=>{
    const g=roadRibbon(course,{start:425,end:550,left:s=>course.railLane(s,-1)-.05,right:-9.14,height:.043});
    const p=g.getAttribute('position'),idx=g.index!;
    for(let i=0;i<idx.count;i+=3){
      const a=new T.Vector3().fromBufferAttribute(p,idx.getX(i)),b=new T.Vector3().fromBufferAttribute(p,idx.getX(i+1)),c=new T.Vector3().fromBufferAttribute(p,idx.getX(i+2));
      expect(b.sub(a).cross(c.sub(a)).normalize().y).toBeGreaterThan(.75);
    }
    const sample=(World.prototype as unknown as {terrainAt(x:number,z:number):number}).terrainAt;
    const terrain=(x:number,z:number)=>sample.call({course} as never,x,z),dx=610/145,dz=670/155;
    for(let s=425;s<=550;s+=3)for(const lane of [-9.15,course.railLane(s,-1)]){
      const v=course.position(s,lane),x=(v.x+305)/dx,z=(v.z+380)/dz,ix=Math.floor(x),iz=Math.floor(z),tx=x-ix,tz=z-iz,x0=ix*dx-305,z0=iz*dz-380;
      const h00=terrain(x0,z0),h10=terrain(x0+dx,z0),h01=terrain(x0,z0+dz),h11=terrain(x0+dx,z0+dz);
      const h=tx+tz<=1?h00+tx*(h10-h00)+tz*(h01-h00):h11+(1-tx)*(h01-h11)+(1-tz)*(h10-h11);
      expect(h,`ground at ${s},${lane}`).toBeLessThan(v.y-.2);
    }
  });
});
