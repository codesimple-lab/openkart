import * as T from 'three';

export interface ShellSection {z:number;width:number;top:number;bottom:number}

/** Closed, smooth cross-sections sculpt a shell rather than intersecting box panels. */
export function shellGeometry(sections:readonly ShellSection[],lengthSegments=48,radialSegments=32) {
  const centers=new T.CatmullRomCurve3(sections.map(s=>new T.Vector3(s.z,s.width,(s.top+s.bottom)/2)),false,'centripetal');
  const heights=new T.CatmullRomCurve3(sections.map((s,i)=>new T.Vector3(i,(s.top-s.bottom)/2,0)),false,'centripetal');
  const positions:number[]=[],uv:number[]=[],indices:number[]=[];
  for(let i=0;i<=lengthSegments;i++){
    const t=i/lengthSegments,p=centers.getPoint(t),height=Math.max(.008,heights.getPoint(t).y);
    for(let j=0;j<=radialSegments;j++){
      const a=j/radialSegments*Math.PI*2;
      positions.push(Math.sin(a)*Math.max(.005,p.y),p.z+Math.cos(a)*height,p.x);uv.push(j/radialSegments,t);
      if(i<lengthSegments&&j<radialSegments){const a=i*(radialSegments+1)+j,b=a+radialSegments+1;indices.push(a,b,a+1,b,b+1,a+1);}
    }
  }
  // End caps are tucked beneath the bumper/rear body, with outward-facing winding.
  for(const end of [0,lengthSegments]){
    const start=end*(radialSegments+1),center=positions.length/3;
    positions.push(0,(positions[start*3+1]+positions[(start+radialSegments/2)*3+1])/2,positions[start*3+2]);uv.push(.5,end/lengthSegments);
    for(let j=0;j<radialSegments;j++)end===0?indices.push(center,start+j,start+j+1):indices.push(center,start+j+1,start+j);
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  const normals=geometry.attributes.normal;
  for(let i=0;i<=lengthSegments;i++){
    const a=i*(radialSegments+1),b=a+radialSegments,n=new T.Vector3().fromBufferAttribute(normals,a).add(new T.Vector3().fromBufferAttribute(normals,b)).normalize();
    normals.setXYZ(a,n.x,n.y,n.z);normals.setXYZ(b,n.x,n.y,n.z);
  }
  return geometry;
}

export const bodySections:readonly ShellSection[]=[
  {z:-1.83,width:.7,top:.75,bottom:.48},{z:-1.4,width:1.02,top:.85,bottom:.44},
  {z:-.55,width:1.11,top:.89,bottom:.44},{z:.3,width:1.09,top:.85,bottom:.44},
  {z:1.12,width:.98,top:.82,bottom:.46},{z:1.82,width:.67,top:.69,bottom:.5},
];
export const hoodSections:readonly ShellSection[]=[
  {z:.24,width:.57,top:1.08,bottom:.76},{z:.57,width:.72,top:1.17,bottom:.74},
  {z:1.13,width:.7,top:1.14,bottom:.73},{z:1.57,width:.55,top:1.01,bottom:.71},
  {z:1.88,width:.25,top:.82,bottom:.68},
];

export function tyreGeometry(){
  return new T.LatheGeometry([
    [.29,-.175],[.4,-.175],[.453,-.153],[.478,-.1],[.48,0],
    [.478,.1],[.453,.153],[.4,.175],[.29,.175],[.29,-.175],
  ].map(([x,y])=>new T.Vector2(x,y)),32);
}

export function faceGeometry(luigi=false){
  const geometry=new T.SphereGeometry(1,36,26),positions=geometry.attributes.position;
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
    const cheek=1+.1*Math.exp(-(((y+.24)/.4)**2)),jaw=1-.11*Math.max(0,-y);
    positions.setXYZ(i,x*.48*cheek*jaw*(luigi?.92:1),y*(luigi?.53:.48),z*.46*(z>0?1-.05*Math.max(0,y):1));
  }
  geometry.computeVertexNormals();return geometry;
}

export function moustacheGeometry(){
  const shape=new T.Shape();shape.moveTo(-.3,.012);
  shape.bezierCurveTo(-.23,.08,-.12,.06,0,.015);shape.bezierCurveTo(.12,.06,.23,.08,.3,.012);
  shape.bezierCurveTo(.29,-.06,.235,-.09,.19,-.052);
  shape.bezierCurveTo(.175,-.12,.095,-.12,.08,-.075);
  shape.bezierCurveTo(.045,-.125,-.045,-.125,-.08,-.075);
  shape.bezierCurveTo(-.095,-.12,-.175,-.12,-.19,-.052);
  shape.bezierCurveTo(-.235,-.09,-.29,-.06,-.3,.012);
  return new T.ExtrudeGeometry(shape,{depth:.035,bevelEnabled:true,bevelSize:.017,bevelThickness:.014,bevelSegments:3,curveSegments:6,steps:1});
}
