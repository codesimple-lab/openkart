import type { Item } from '../game/item-types';
import { ControlBuffer } from './control-buffer';
import { roomCode } from './protocol';
export type Phase = 'garage'|'countdown'|'race'|'paused'|'finish';
export class HostLink {
  readonly room = roomCode();
  private readonly key = [...crypto.getRandomValues(new Uint8Array(16))].map(v=>v.toString(16).padStart(2,'0')).join('');
  socket:WebSocket|null = null;
  connected = false;
  ready = false;
  latency = 0;
  private readonly input=new ControlBuffer();
  get controls(){return this.input.read();}
  lastInput = 0;
  onAction:(action:string)=>void = ()=>{};
  onChange:()=>void = ()=>{};
  constructor() { this.connect(); }
  get active() { return this.connected && performance.now()-this.lastInput<600; }
  private connect() {
    this.socket = new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/relay`);
    this.socket.onopen = () => this.send({type:'join',role:'host',room:this.room,key:this.key});
    this.socket.onmessage = e => {
      let m; try {m=JSON.parse(e.data);} catch {return;}
      if (m.type==='ready') this.ready=true;
      if (m.type==='peer') { this.connected=!!m.connected; if(!m.connected) this.input.clear(); }
      if (m.type==='input') {this.input.push(m.controls);this.lastInput=performance.now();}
      if (m.type==='action') this.onAction(m.action);
      if (m.type==='pong') this.latency=Math.round(performance.now()-m.time);
      this.onChange();
    };
    this.socket.onclose = () => { this.ready=false;this.connected=false;this.input.clear();this.onChange();setTimeout(()=>this.connect(),900); };
    this.socket.onerror = ()=>this.socket?.close();
  }
  send(data:object) { if(this.socket?.readyState===WebSocket.OPEN) this.socket.send(JSON.stringify(data)); }
  status(speed:number,lap:number,flight:boolean,phase:Phase,item:Item|null=null,roulette=false,reserveItem:Item|null=null,coins=0) { this.send({type:'status',speed,lap,flight,phase,item,roulette,reserveItem,coins}); }
}
