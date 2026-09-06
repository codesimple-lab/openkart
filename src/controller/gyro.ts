/** Screen-relative steering from the W3C Z-X-Y device orientation matrix.
 * Gravity projection avoids Euler-angle flips in landscape. No compass required.
 */
const radians=Math.PI/180;
export const angleDelta=(a:number,b:number)=>((a-b+540)%360+360)%360-180;
export function screenRoll(beta:number|null,gamma:number|null,orientation:number):number|null {
  if(beta===null||gamma===null||!Number.isFinite(beta)||!Number.isFinite(gamma)||!Number.isFinite(orientation))return null;
  const b=beta*radians,g=gamma*radians,s=orientation*radians;
  const x=-Math.cos(b)*Math.sin(g),y=Math.sin(b);
  const across=x*Math.cos(s)+y*Math.sin(s),up=-x*Math.sin(s)+y*Math.cos(s);
  // Almost flat: gravity cannot provide a stable steering-wheel angle.
  if(Math.hypot(across,up)<.2)return null;
  return Math.atan2(-across,up)/radians;
}
export class GyroSteering {
  sensitivity=24;
  inverted=false;
  ready=false;
  private center=0;
  private samples=0;
  private started=0;
  private last=0;
  private output=0;
  private orientation:number|null=null;
  reset(){this.ready=false;this.samples=0;this.output=0;this.last=0;this.orientation=null;}
  update(beta:number|null,gamma:number|null,orientation:number,now:number){
    orientation=((orientation%360)+360)%360;
    if(this.orientation!==orientation){this.reset();this.orientation=orientation;}
    const roll=screenRoll(beta,gamma,orientation);
    if(roll===null){this.output=0;return false;}
    if(this.last&&now-this.last>650){this.reset();this.orientation=orientation;}
    const dt=this.last?Math.min(.1,Math.max(0,(now-this.last)/1000)):1/60;this.last=now;
    if(!this.ready){
      if(!this.samples||Math.abs(angleDelta(roll,this.center))>4){this.center=roll;this.samples=1;this.started=now;}
      else {this.samples++;this.center+=angleDelta(roll,this.center)/this.samples;}
      this.ready=this.samples>=5&&now-this.started>=300;
      this.output=0;return true;
    }
    const tilt=angleDelta(roll,this.center),magnitude=Math.max(0,Math.abs(tilt)-2)/(this.sensitivity-2);
    const target=Math.sign(tilt)*Math.min(1,magnitude)*(this.inverted?-1:1);
    this.output+=(target-this.output)*(1-Math.exp(-dt/.065));
    return true;
  }
  read(now:number){return this.ready&&now-this.last<650?this.output:0;}
  active(now:number){return this.ready&&now-this.last<650;}
}
