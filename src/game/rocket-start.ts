/** Charge timing is measured against the countdown, never keyboard repeat frequency. */
export class RocketStart {
  private heldAt:number|null=null;
  reset(){this.heldAt=null;}
  update(throttle:number,remaining:number){
    if(throttle<.5)this.heldAt=null;
    else this.heldAt??=remaining;
  }
  result(){
    if(this.heldAt===null)return {boost:0,stall:0};
    if(this.heldAt>2.25)return {boost:0,stall:.85};
    if(this.heldAt<.75)return {boost:0,stall:0};
    return {boost:.6+Math.max(0,1-Math.abs(this.heldAt-1.7)/.95)*.8,stall:0};
  }
}
