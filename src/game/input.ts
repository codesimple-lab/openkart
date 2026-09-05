import { type Controls, neutral } from '../network/protocol';
export class Keyboard {
  private pressed=new Set<string>();
  private held=new Set<string>();
  constructor(onPause:()=>void) {
    const driving=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','KeyZ','KeyQ','Space','ShiftLeft','ShiftRight','KeyE','KeyB','KeyR'];
    window.addEventListener('keydown',e=>{if((e.target as HTMLElement)?.matches?.('input,textarea'))return;if(driving.includes(e.code))e.preventDefault();if((e.code==='Escape'||e.code==='KeyP')&&!e.repeat)onPause();if(!e.repeat)this.pressed.add(e.code);this.held.add(e.code);});
    window.addEventListener('keyup',e=>this.held.delete(e.code));window.addEventListener('blur',()=>this.clear());
  }
  clear(){this.held.clear();this.pressed.clear();}
  read():Controls {
    const has=(...codes:string[])=>codes.some(c=>this.held.has(c));
    const itemBackward=has('KeyB')||this.pressed.has('KeyB');
    const item=has('KeyE')||this.pressed.has('KeyE')||itemBackward,reset=has('KeyR')||this.pressed.has('KeyR');this.pressed.clear();
    return {...neutral(),steer:Number(has('KeyD','ArrowRight'))-Number(has('KeyA','KeyQ','ArrowLeft')),throttle:Number(has('KeyW','KeyZ','ArrowUp')),brake:Number(has('KeyS','ArrowDown')),drift:has('Space','ShiftLeft','ShiftRight'),item,itemBackward,reset};
  }
}
