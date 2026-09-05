import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {Course} from '../src/game/course';
import {roadRibbon} from '../src/game/road-geometry';
import {World} from '../src/game/world';
const course=new Course();
const sample=(World.prototype as unknown as {terrainAt(x:number,z:number):number}).terrainAt;
function ground(x:number,z:number){
  const dx=610/145,dz=670/155,ix=Math.floor((x+305)/dx),iz=Math.floor((z+380)/dz),tx=(x+305)/dx-ix,tz=(z+380)/dz-iz,x0=ix*dx-305,z0=iz*dz-380;
  const h=(x:number,z:number)=>sample.call({course} as never,x,z);
  const a=h(x0,z0),b=h(x0+dx,z0),c=h(x0,z0+dz),d=h(x0+dx,z0+dz);
  return tx+tz<=1?a+tx*(b-a)+tz*(c-a):d+(1-tx)*(c-d)+(1-tz)*(b-d);
}
describe.each(course.routes)('$name shortcut geometry',route=>{
  it('joins tangentially and saves distance against the main centerline',()=>{
    let length=0,inside=0,last=course.position(route.start),lastInside=course.position(route.start,route.side*5.5);
    for(let s=route.start+.5;s<=route.end;s+=.5){
      const p=course.position(s,course.routeLane(route,s)),q=course.position(s,route.side*5.5);
      for(const side of [-1,1])expect(1-course.at(s).curvature*(course.routeLane(route,s)+side*route.width/2)).toBeGreaterThan(.35);
      length+=p.distanceTo(last);inside+=q.distanceTo(lastInside);last=p;lastInside=q;
    }
    expect(course.routeLane(route,route.start)).toBeCloseTo(0,9);expect(course.routeLane(route,route.end)).toBeCloseTo(0,9);
    expect(Math.abs(course.routeLane(route,route.start+.1))/.1).toBeLessThan(.002);
    expect(length).toBeLessThan(route.end-route.start-2);
    expect(course.routes.filter(other=>other!==route&&other.start<route.end&&other.end>route.start)).toHaveLength(0);
    const [splitStart,splitEnd]=course.splitRange(route);
    for(const pad of course.routeBoosts.filter(pad=>pad.routeId===route.id)){
      expect(pad.distance).toBeGreaterThan(splitStart+3);expect(pad.distance).toBeLessThan(splitEnd-3);
    }
    console.info(route.id,{centerline:route.end-route.start,branch:length.toFixed(1),inside:inside.toFixed(1)});
  });
  it('has an open junction and two separate collision corridors at the midpoint',()=>{
    const [a,b]=course.splitRange(route),mid=(a+b)/2,lane=course.routeLane(route,mid);
    expect(course.laneBounds(route.start,0)).toEqual([-9.1,9.1]);
    const branch=course.laneBounds(mid,lane),main=course.laneBounds(mid,0);
    expect(branch[1]-branch[0]).toBeCloseTo(route.width,6);
    expect(main).toEqual([-9.1,9.1]);
    for(const s of [a,b])expect(Math.abs(course.routeLane(route,s))-route.width/2).toBeCloseTo(9.1,6);
  });
  it('keeps branch triangles facing upwards and the terrain below the full road width',()=>{
    const geo=roadRibbon(course,{start:route.start,end:route.end,left:s=>course.routeLane(route,s)-route.width/2,right:s=>course.routeLane(route,s)+route.width/2,step:.5});
    const p=geo.getAttribute('position'),index=geo.index!;
    for(let i=0;i<index.count;i+=3){
      const a=new T.Vector3().fromBufferAttribute(p,index.getX(i)),b=new T.Vector3().fromBufferAttribute(p,index.getX(i+1)),c=new T.Vector3().fromBufferAttribute(p,index.getX(i+2));
      const normal=b.sub(a).cross(c.sub(a));expect(normal.length()).toBeGreaterThan(.01);expect(normal.normalize().y).toBeGreaterThan(.6);
    }
    for(let s=route.start;s<=route.end;s+=3)for(const offset of [-route.width/2,0,route.width/2]){
      const lane=course.routeLane(route,s)+offset,p=course.position(s,lane);
      expect(course.surface(s,lane)).toBe('asphalt');
      expect(ground(p.x,p.z),`terrain at ${s} lane ${lane}`).toBeLessThan(p.y-.2);
      for(let i=0;i<course.samples.length;i+=8){
        const distance=i/course.resolution*course.length;
        if(distance>route.start-30&&distance<route.end+30)continue;
        const q=course.samples[i].p;
        expect(Math.hypot(q.x-p.x,q.z-p.z),`unrelated road near ${s}`).toBeGreaterThan(10);
      }
    }
  });
});
