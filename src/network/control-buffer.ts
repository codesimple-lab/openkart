import { neutral, type Controls } from './protocol';
/** Preserve a short button tap even when press and release arrive between two physics ticks. */
export class ControlBuffer {
  private latest=neutral();
  private item=false;
  private reset=false;
  private itemBackward:boolean|undefined;
  push(controls:Controls){
    if(controls.item&&!this.latest.item)this.itemBackward=controls.itemBackward;
    this.item ||= controls.item&&!this.latest.item;
    this.reset ||= controls.reset&&!this.latest.reset;
    this.latest={...controls};
  }
  read():Controls {
    const result={...this.latest,item:this.latest.item||this.item,reset:this.latest.reset||this.reset};
    if(this.item&&this.itemBackward!==undefined)result.itemBackward=this.itemBackward;
    this.item=false;this.itemBackward=undefined;this.reset=false;return result;
  }
  clear(){this.latest=neutral();this.item=false;this.itemBackward=undefined;this.reset=false;}
}
