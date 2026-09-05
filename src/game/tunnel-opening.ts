import type {Course} from './course';

export interface TunnelOpening {start:number;end:number;side:number}

/** Branch-width crossing, padded for wheel/bumper travel between longitudinal samples. */
export function tunnelOpenings(course:Course):TunnelOpening[]{
  const openings:TunnelOpening[]=[];
  for(const route of course.routes){
    let start:number|null=null;
    const from=Math.max(route.start,course.tunnel[0]),to=Math.min(route.end,course.tunnel[1]);
    for(let s=from;s<=to+.5;s+=.5){
      const center=Math.abs(course.routeLane(route,Math.min(s,to)));
      const crosses=s<=to&&Math.abs(center-10.8)<route.width/2+1;
      if(crosses&&start===null)start=Math.max(from,s-1);
      if(!crosses&&start!==null){openings.push({start,end:Math.min(to,s+1),side:route.side});start=null;}
    }
    if(start!==null)openings.push({start,end:to,side:route.side});
  }
  return openings;
}
