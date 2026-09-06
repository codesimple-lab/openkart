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
  private lastPacket=0;
  private retry=0;
  private suspended=false;
  onAction:(action:string)=>void = ()=>{};
  onChange:()=>void = ()=>{};
  constructor() {
    this.connect();
    window.addEventListener('pagehide',()=>{this.suspended=true;clearTimeout(this.retry);this.socket?.close();});
    window.addEventListener('pageshow',()=>{this.suspended=false;if(!this.socket||this.socket.readyState>WebSocket.OPEN){this.socket=null;this.clearConnection();this.connect();}});
    setInterval(()=>{
      if(this.suspended||document.hidden)return;
      if(this.socket&&performance.now()-this.lastPacket>5000){const old=this.socket;this.socket=null;old.close();this.clearConnection();this.connect();}
      this.send({type:'ping',time:performance.now()});
    },1800);
  }
  clearControls(){this.input.clear();}
  private clearConnection(){this.ready=false;this.connected=false;this.lastInput=0;this.input.clear();this.onChange();}
  get active() { return this.ready && this.connected && this.lastInput>0 && performance.now()-this.lastInput<600; }
  private connect() {
    if(this.suspended||this.socket?.readyState===WebSocket.OPEN||this.socket?.readyState===WebSocket.CONNECTING)return;
    clearTimeout(this.retry);this.lastPacket=performance.now();
    const socket=this.socket = new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/relay`);
    socket.onopen = () => this.send({type:'join',role:'host',room:this.room,key:this.key});
    socket.onmessage = e => {
      if(this.socket!==socket)return;this.lastPacket=performance.now();
      let m; try {m=JSON.parse(e.data);} catch {return;}
      if (m.type==='ready') this.ready=true;
      if (m.type==='peer') { this.connected=!!m.connected; if(!m.connected){this.input.clear();this.lastInput=0;} }
      if (m.type==='input') {this.input.push(m.controls);this.lastInput=performance.now();}
      if (m.type==='action') this.onAction(m.action);
      if (m.type==='pong') this.latency=Math.round(performance.now()-m.time);
      this.onChange();
    };
    socket.onclose = () => {if(this.socket!==socket)return;this.socket=null;this.clearConnection();if(!this.suspended)this.retry=window.setTimeout(()=>this.connect(),900);};
    socket.onerror = ()=>socket.close();
  }
  send(data:object) { if(this.socket?.readyState===WebSocket.OPEN) this.socket.send(JSON.stringify(data)); }
  status(speed:number,lap:number,flight:boolean,phase:Phase,item:Item|null=null,roulette=false,reserveItem:Item|null=null,coins=0) { this.send({type:'status',speed,lap,flight,phase,item,roulette,reserveItem,coins}); }
}
