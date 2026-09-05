import {expect,it} from 'vitest';
import * as T from 'three';
import {World} from '../src/game/world';
import {Course} from '../src/game/course';
import {Kart} from '../src/game/kart';
import {PILOTS,makeRacer} from '../src/game/race';
import {tunnelOpenings} from '../src/game/tunnel-opening';

const course=new Course();
function tunnelScene(){
  const scene=new T.Scene(),build=(World.prototype as unknown as {buildTunnel():void}).buildTunnel;
  build.call({course,scene,sign(){}} as never);scene.updateMatrixWorld(true);return scene;
}
it('leaves the full kart body clear when the ridge rejoins the cave',()=>{
  const scene=tunnelScene(),kart=new Kart(PILOTS[0]),r=makeRacer(PILOTS[0]),route=course.routes.find(route=>route.id==='ridge')!;
  const rays:[[number,number,number],[number,number,number]][]=[];
  for(const [y,z,width] of [[.49,-1.22,1.48],[.49,1.18,1.48],[.68,0,1.1],[.98,1,.65],[1.6,-.35,.5],[2.2,-.35,.48],[2.65,-.35,.38]])rays.push([[-width,y,z],[width,y,z]]);
  rays.push([[0,.68,-1.85],[0,.68,1.85]]);
  let samples=0;const hits:{s:number;lane:number;height:number;name:string}[]=[];
  for(let s=Math.max(route.start,course.tunnel[0]-5);s<Math.min(route.end,course.tunnel[1]+8);s+=1)for(const lateral of [-1.7,0,1.7]){
    r.distance=s;r.lane=course.routeLane(route,s)+lateral;
    const derivative=(course.routeLane(route,s+.25)-course.routeLane(route,s-.25))/.5;
    r.yaw=Math.atan2(derivative,Math.max(.2,1-course.at(s).curvature*r.lane));kart.update(r,course,1/60,0);kart.root.updateMatrixWorld(true);
    for(const [from,to] of rays){
      const a=new T.Vector3(...from).applyMatrix4(kart.root.matrixWorld),b=new T.Vector3(...to).applyMatrix4(kart.root.matrixWorld),length=a.distanceTo(b);
      const ray=new T.Raycaster(a,b.sub(a).normalize(),.005,length-.005),hit=ray.intersectObjects(scene.children,true)[0];samples++;
      if(hit&&hits.length<12)hits.push({s:+s.toFixed(2),lane:+r.lane.toFixed(2),height:from[1],name:hit.object.name||hit.object.type});
    }
  }
  console.info('Tunnel junction body probes',samples,'obstructions',hits);
  expect(hits).toEqual([]);kart.dispose();
});

it('preserves the cave roof and opposite wall around the lateral entrance',()=>{
  const scene=tunnelScene(),opening=tunnelOpenings(course)[0];
  expect(opening).toBeDefined();
  const middle=(opening.start+opening.end)/2;
  function probe(s:number,direction:T.Vector3){
    const origin=course.at(s).p.clone().add(new T.Vector3(0,2,0));
    return new T.Raycaster(origin,direction,0,20).intersectObjects(scene.children,true)[0]?.object.name;
  }
  const right=course.at(middle).right;
  expect(probe(middle,right.clone().multiplyScalar(opening.side))).toBeUndefined();
  expect(probe(middle,right.clone().multiplyScalar(-opening.side))).toBe('cave-vault');
  expect(probe(middle,new T.Vector3(0,1,0))).toBe('cave-vault');
  for(const s of [opening.start-4,opening.end+4]){
    expect(probe(s,course.at(s).right.clone().multiplyScalar(opening.side))).toBe('cave-vault');
  }
  console.info('Cave side opening',opening);
});
