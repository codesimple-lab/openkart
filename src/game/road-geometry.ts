import * as T from 'three';
import type { Course } from './course';

/** The rendered surface and race use the same banked coordinates. Local +Z is forward. */
export function roadFrame(course:Course,distance:number,lane=0) {
  const right=course.position(distance,lane-.25).sub(course.position(distance,lane+.25)).normalize();
  const forward=course.position(distance+.25,lane).sub(course.position(distance-.25,lane)).normalize();
  const up=new T.Vector3().crossVectors(forward,right).normalize();
  forward.crossVectors(right,up).normalize();
  const quaternion=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(right,up,forward));
  return {right,up,forward,quaternion};
}

export interface RoadRibbonOptions {
  start?:number; end?:number; left:number|((distance:number)=>number); right:number|((distance:number)=>number);
  height?:number; rightHeight?:number; step?:number; skipVoid?:boolean;
  uvMeters?:number;
  omit?:(distance:number)=>boolean;
}

/** Extrudes a continuous two-point profile. No intersecting 3 m boxes at bends. */
export function roadRibbon(course:Course,options:RoadRibbonOptions) {
  const {start=0,end=course.length,left,right,height=.04,rightHeight=height,step=1,
    skipVoid=true,uvMeters=3,omit}=options;
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
  const count=Math.ceil((end-start)/step);
  const distances=Array.from({length:count+1},(_,i)=>T.MathUtils.lerp(start,end,i/count));
  for(let i=0;i<distances.length;i++) {
    const s=distances[i];
    for(const [lane,y] of [[typeof left==='function'?left(s):left,height],[typeof right==='function'?right(s):right,rightHeight]]) {
      const p=course.position(s,lane,y);positions.push(p.x,p.y,p.z);uvs.push(lane/uvMeters,s/uvMeters);
    }
    const midpoint=(s+(distances[i+1]??s))/2;
    if(i<distances.length-1&&(!skipVoid||!course.inVoid(midpoint))&&!omit?.(midpoint)) {
      const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  if(start===0&&end===course.length) {
    const normals=geometry.getAttribute('normal'),last=positions.length/3-2;
    for(let side=0;side<2;side++) {
      const normal=new T.Vector3().fromBufferAttribute(normals,side)
        .add(new T.Vector3().fromBufferAttribute(normals,last+side)).normalize();
      normals.setXYZ(side,normal.x,normal.y,normal.z);normals.setXYZ(last+side,normal.x,normal.y,normal.z);
    }
  }
  geometry.computeBoundingSphere();
  return geometry;
}

/** Decals are ribbons too: a flat plane intersects the road when it banks or climbs. */
export function roadDecal(course:Course,start:number,end:number,left:number,right:number,height=.075) {
  const geometry=roadRibbon(course,{start,end,left,right,height,step:.6});
  const uv=geometry.getAttribute('uv');
  for(let i=0;i<uv.count;i++) {
    uv.setXY(i,i%2,1-Math.floor(i/2)/(uv.count/2-1));
  }
  return geometry;
}
