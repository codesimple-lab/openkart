import * as T from 'three';
export const wrap = (v:number,n:number) => ((v%n)+n)%n;
export const clamp = (v:number,a:number,b:number) => Math.max(a,Math.min(b,v));
export const angle = (v:number) => Math.atan2(Math.sin(v),Math.cos(v));
const anchors = [
  [-155,10,140],[-80,10,160],[10,11,155],[90,14,145],[150,20,110],
  [177,31,55],[163,43,2],[120,52,-18],[78,56,14],[62,57,60],
  [25,61,93],[-20,57,62],[-6,45,10],[-22,35,-35],[-75,27,-58],
  [-89,29,-110],[-39,36,-160],[30,44,-180],[93,50,-159],[149,51,-178],
  [174,43,-224],[120,22,-259],[37,12,-256],[-53,9,-230],[-131,11,-181],
  [-165,15,-125],[-142,20,-72],[-108,23,-28],[-125,18,19],[-176,12,48],[-188,10,95],
];
export interface RoadSample { p:T.Vector3; tangent:T.Vector3; right:T.Vector3; heading:number; bank:number; width:number; curvature:number }
export interface ShortcutRoute {id:string;name:string;start:number;end:number;side:number;offset:number;width:number}
export interface RouteBoost {routeId:string;distance:number;lane:number;width:number;duration:number}
export class Course {
  readonly curve = new T.CatmullRomCurve3(anchors.map(v=>new T.Vector3(...v as [number,number,number])),true,'centripetal');
  readonly length:number;
  readonly samples:RoadSample[]=[];
  readonly resolution=1400;
  readonly flight:[number,number];
  readonly tunnel:[number,number];
  readonly boosts:number[];
  readonly boxes:number[];
  readonly routeBoosts:RouteBoost[];
  readonly shortcut={start:425,end:550,side:-1,extra:6.5};
  readonly routes:ShortcutRoute[]=[
    {id:'orchard',name:'PASSAGE DU VERGER',start:900,end:1160,side:1,offset:17,width:7},
    {id:'ridge',name:'CORNICHE DES AIGUILLES',start:1370,end:1630,side:-1,offset:26,width:7},
  ];
  constructor() {
    this.curve.arcLengthDivisions=5000; this.curve.updateArcLengths(); this.length=this.curve.getLength();
    for(let i=0;i<this.resolution;i++) {
      const u=i/this.resolution, p=this.curve.getPointAt(u), tangent=this.curve.getTangentAt(u).normalize();
      const right=new T.Vector3(-tangent.z,0,tangent.x).normalize();
      const before=this.curve.getTangentAt(wrap(u-.002,1)), after=this.curve.getTangentAt(wrap(u+.002,1));
      const curvature=-angle(Math.atan2(after.x,after.z)-Math.atan2(before.x,before.z))/(this.length*.004);
      this.samples.push({p,tangent,right,heading:Math.atan2(tangent.x,tangent.z),curvature,bank:clamp(curvature*6,-.19,.19),width:17});
    }
    const atAnchor=(index:number)=>this.samples.reduce((best,s,i)=>s.p.distanceToSquared(this.curve.points[index])<this.samples[best].p.distanceToSquared(this.curve.points[index])?i:best,0)/this.resolution*this.length;
    this.flight=[atAnchor(9)-10,atAnchor(12)-8];
    this.tunnel=[atAnchor(23)-8,atAnchor(24)+8];
    this.boosts=[.06,.20,.45,.68,.9].map(p=>p*this.length);
    this.boxes=[.04,.24,.40,.60,.82].map(p=>p*this.length);
    this.routeBoosts=this.routes.flatMap(route=>[.38,.62].map(fraction=>{
      const distance=route.start+(route.end-route.start)*fraction;
      return {routeId:route.id,distance,lane:this.routeLane(route,distance),width:4.6,duration:2};
    }));
  }
  at(distance:number):RoadSample {
    const idx=wrap(distance,this.length)/this.length*this.resolution;
    const a=this.samples[Math.floor(idx)],b=this.samples[(Math.floor(idx)+1)%this.resolution],t=idx%1;
    const tangent=a.tangent.clone().lerp(b.tangent,t).normalize();
    return {p:a.p.clone().lerp(b.p,t),tangent,right:a.right.clone().lerp(b.right,t).normalize(),heading:a.heading+angle(b.heading-a.heading)*t,bank:T.MathUtils.lerp(a.bank,b.bank,t),width:T.MathUtils.lerp(a.width,b.width,t),curvature:T.MathUtils.lerp(a.curvature,b.curvature,t)};
  }
  inFlight(_distance:number) { return false; }
  inVoid(_distance:number) { return false; }
  routeAt(distance:number) {const s=wrap(distance,this.length);return this.routes.find(r=>s>=r.start&&s<=r.end);}
  routeLane(route:ShortcutRoute,distance:number) {
    const t=clamp((wrap(distance,this.length)-route.start)/(route.end-route.start),0,1);
    return route.side*route.offset*Math.sin(Math.PI*t)**2;
  }
  /** Exact opening/closing of the island between the main road and a branch. */
  splitRange(route:ShortcutRoute):[number,number] {
    const t=Math.asin(Math.sqrt((this.at(route.start).width/2+.6+route.width/2)/route.offset))/Math.PI;
    return [route.start+t*(route.end-route.start),route.end-t*(route.end-route.start)];
  }
  /** Drivable boundaries, including the two faces of a separated median. */
  laneBounds(distance:number,lane:number):[number,number] {
    const low=this.railLane(distance,-1),high=this.railLane(distance,1),route=this.routeAt(distance);
    if(!route)return [low,high];
    const center=this.routeLane(route,distance),inner=Math.abs(center)-route.width/2,edge=this.at(distance).width/2+.6;
    if(inner<=edge)return [low,high];
    if(route.side*lane>(edge+inner)/2)return center>0?[inner,high]:[low,-inner];
    return center>0?[low,edge]:[-edge,high];
  }
  shoulder(distance:number,side:number) {
    const s=wrap(distance,this.length),cut=this.shortcut;
    let extra=0;
    if(Math.sign(side)===cut.side&&s>cut.start&&s<cut.end) {
      const t=clamp(Math.min(s-cut.start,cut.end-s)/28,0,1);extra=cut.extra*t*t*(3-2*t);
    }
    const route=this.routeAt(s);
    if(route&&route.side===Math.sign(side))extra=Math.max(extra,Math.abs(this.routeLane(route,s))+route.width/2-(this.at(s).width/2+.6));
    return Math.max(0,extra);
  }
  maxShoulder(distance:number) {return Math.max(this.shoulder(distance,-1),this.shoulder(distance,1));}
  /** Signed inner face of the visible barrier, shared by rendering and collision. */
  railLane(distance:number,side:number) {return Math.sign(side)*(this.at(distance).width/2+.6+this.shoulder(distance,side));}
  surface(distance:number,lane:number):'asphalt'|'curb'|'grass' {
    const edge=this.at(distance).width/2;
    const route=this.routeAt(distance);
    if(route&&Math.abs(lane-this.routeLane(route,distance))<=route.width/2+1e-7)return 'asphalt';
    return Math.abs(lane)<=edge?'asphalt':Math.abs(lane)<=edge+.65?'curb':'grass';
  }
  position(distance:number,lane=0,height=0):T.Vector3 { const sample=this.at(distance);return sample.p.addScaledVector(sample.right,lane).add(new T.Vector3(0,height+lane*Math.sin(sample.bank),0)); }
  section(distance:number):string {
    const s=wrap(distance,this.length);
    if(s>this.tunnel[0]&&s<this.tunnel[1])return 'GROTTE AUX CRISTAUX';
    const p=s/this.length;
    return p<.14?'PROMENADE DU PORT':p<.42?'LACETS DES AIGUILLES':p<.67?'VIADUC DES CRÊTES':p<.86?'CÔTE SAUVAGE':'RETOUR AU PHARE';
  }
}
