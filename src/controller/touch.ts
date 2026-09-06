import { type Controls, neutral } from '../network/protocol';
export type TouchAction='left'|'right'|'gas'|'brake'|'drift'|'item'|'backthrow'|'reset';
export class TouchState {
  private fingers=new Map<number,TouchAction>();
  press(id:number,action:TouchAction){this.fingers.set(id,action);}
  release(id:number){this.fingers.delete(id);}
  held(action:TouchAction){return [...this.fingers.values()].includes(action);}
  clear(){this.fingers.clear();}
  read():Controls {
    const values=[...this.fingers.values()],has=(v:TouchAction)=>values.includes(v);
    return {...neutral(),steer:Number(has('right'))-Number(has('left')),throttle:Number(has('gas')),brake:Number(has('brake')),drift:has('drift'),item:has('item')||has('backthrow'),...(has('backthrow')?{itemBackward:true}:{}),reset:has('reset')};
  }
}
