import {expect,it} from 'vitest';
import * as T from 'three';
import {Kart} from '../src/game/kart';
import {Course} from '../src/game/course';
import {roadFrame} from '../src/game/road-geometry';
import {makeRacer,PILOTS} from '../src/game/race';

it('places rendered tyres against the main track and both shortcut branches, including bank derivatives',()=>{
  const course=new Course(),kart=new Kart(PILOTS[0]),r=makeRacer(PILOTS[0]),tyres:T.Mesh[]=[];
  kart.root.traverse(object=>{if(object instanceof T.Mesh&&object.name==='tyre')tyres.push(object);});
  const cases:{distance:number;lane:number;yaw:number;name:string}[]=[];
  for(let distance=0;distance<course.length;distance+=20)cases.push({distance,lane:0,yaw:0,name:'main'});
  for(const route of course.routes)for(let distance=route.start+3;distance<route.end-3;distance+=5)for(const offset of [-1,0,1]){
    const lane=course.routeLane(route,distance)+offset;
    const derivative=(course.routeLane(route,distance+.25)-course.routeLane(route,distance-.25))/.5;
    const yaw=Math.atan2(derivative,Math.max(.2,1-course.at(distance).curvature*lane));
    cases.push({distance,lane,yaw,name:route.id});
  }
  const ranges=new Map<string,{min:number;max:number;worst:{distance:number;lane:number}}>();
  for(const sampleCase of cases){
    const {distance,lane,yaw,name}=sampleCase;
    r.distance=distance;r.lane=lane;r.yaw=yaw;kart.update(r,course,1/60,0);kart.root.updateMatrixWorld(true);
    const up=roadFrame(course,distance,lane).up;
    for(const tyre of tyres){
      const positions=tyre.geometry.attributes.position;let lowest=Infinity,contact=new T.Vector3();
      for(let i=0;i<positions.count;i++){
        const p=new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(tyre.matrixWorld),height=p.dot(up);
        if(height<lowest){lowest=height;contact=p;}
      }
      let error=Infinity,clearance=0;
      for(let offset=-9;offset<=9;offset+=.025){
        const sample=course.at(distance+offset),lane=contact.clone().sub(sample.p).dot(sample.right),surface=course.position(distance+offset,lane,.04);
        const horizontal=(contact.x-surface.x)**2+(contact.z-surface.z)**2;
        if(horizontal<error){error=horizontal;clearance=contact.y-surface.y;}
      }
      const range=ranges.get(name)??{min:Infinity,max:-Infinity,worst:{distance:0,lane:0}};
      if(clearance>range.max)range.worst={distance,lane};
      range.min=Math.min(range.min,clearance);range.max=Math.max(range.max,clearance);ranges.set(name,range);
    }
  }
  for(const [name,range] of ranges){
    console.info(`Tyre-to-asphalt ${name}: ${range.min.toFixed(4)} to ${range.max.toFixed(4)} m; worst at ${range.worst.distance}/${range.worst.lane}`);
  }
  for(const [name,range] of ranges){
    expect(range.min,name).toBeGreaterThan(-.015);expect(range.max,name).toBeLessThan(.1);
  }
  kart.dispose();
});
