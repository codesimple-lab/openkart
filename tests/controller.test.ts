// @vitest-environment happy-dom
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {Controller} from '../src/controller/controller';
class Socket {
  static OPEN=1;static CONNECTING=0;static instances:Socket[]=[];
  readyState=0;bufferedAmount=0;sent:any[]=[];
  onopen:(()=>void)|null=null;onclose:(()=>void)|null=null;onerror:(()=>void)|null=null;onmessage:((event:{data:string})=>void)|null=null;
  constructor(public url:string){Socket.instances.push(this);}
  send(data:string){this.sent.push(JSON.parse(data));}
  open(){this.readyState=1;this.onopen?.();}
  receive(data:object){this.onmessage?.({data:JSON.stringify(data)});}
  close(){this.readyState=3;this.onclose?.();}
}
let controller:Controller,root:HTMLElement,socket:Socket;
const button=(id:string)=>root.querySelector<HTMLButtonElement>(id)!;
const pointer=(id:number,type:string,target:EventTarget)=>target.dispatchEvent(new PointerEvent(type,{pointerId:id,bubbles:true,cancelable:true}));
const lastInput=()=>socket.sent.filter(p=>p.type==='input').at(-1)?.controls;
beforeEach(()=>{
  vi.useFakeTimers();vi.spyOn(performance,'now').mockImplementation(()=>Date.now());vi.stubGlobal('WebSocket',Socket);Socket.instances=[];
  window.history.replaceState({},'', '/controller?room=ABC234');
  Object.defineProperty(document,'hidden',{configurable:true,value:false});
  Object.defineProperty(window,'isSecureContext',{configurable:true,value:true});
  root=document.createElement('div');document.body.replaceChildren(root);controller=new Controller(root);socket=Socket.instances[0];socket.open();socket.receive({type:'ready'});socket.receive({type:'peer',connected:true});
});
afterEach(()=>{controller.dispose();vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();document.body.replaceChildren();});
describe('phone controller lifecycle',()=>{
  it('preserves simultaneous fingers and releases outside the original button',()=>{
    button('#activate').click();const gas=button('[data-action="gas"]');
    pointer(1,'pointerdown',gas);pointer(2,'pointerdown',gas);pointer(3,'pointerdown',button('[data-action="left"]'));
    expect(lastInput()).toMatchObject({throttle:1,steer:-1});pointer(1,'pointerup',gas);
    expect(lastInput().throttle).toBe(1);expect(gas.classList.contains('pressed')).toBe(true);
    pointer(2,'pointercancel',window);expect(lastInput()).toMatchObject({throttle:0,steer:-1});
    pointer(3,'pointerup',window);expect(lastInput().steer).toBe(0);
  });
  it('restores the controller after a bfcache return, with no stuck accelerator',()=>{
    button('#activate').click();pointer(1,'pointerdown',button('[data-action="gas"]'));
    window.dispatchEvent(new Event('pagehide'));expect(lastInput().throttle).toBe(0);
    window.dispatchEvent(new Event('pageshow'));socket=Socket.instances.at(-1)!;socket.open();socket.receive({type:'ready'});socket.receive({type:'peer',connected:true});vi.advanceTimersByTime(50);
    expect(lastInput().throttle).toBe(0);pointer(2,'pointerdown',button('[data-action="gas"]'));expect(lastInput().throttle).toBe(1);
    const joins=Socket.instances.flatMap(s=>s.sent).filter(p=>p.type==='join');expect(new Set(joins.map(j=>j.clientId)).size).toBe(1);
  });
  it('reconnects an OPEN socket that stopped answering without replaying gas',()=>{
    button('#activate').click();pointer(1,'pointerdown',button('[data-action="gas"]'));vi.advanceTimersByTime(5100);
    const replacement=Socket.instances.at(-1)!;expect(replacement).not.toBe(socket);expect(socket.readyState).toBe(3);
    socket=replacement;socket.open();socket.receive({type:'ready'});socket.receive({type:'peer',connected:true});vi.advanceTimersByTime(50);expect(lastInput().throttle).toBe(0);
  });
  it('cancels held commands when the desktop pauses',()=>{
    button('#activate').click();pointer(1,'pointerdown',button('[data-action="backthrow"]'));pointer(2,'pointerdown',button('[data-action="gas"]'));
    socket.receive({type:'status',phase:'paused',speed:0,lap:1});expect(lastInput()).toMatchObject({item:false,throttle:0});
  });
  it('requests iOS permission on the click and activates only after consent',async()=>{
    let resolve!:(permission:string)=>void;
    const permission=vi.fn(()=>new Promise<string>(r=>{resolve=r;}));
    Object.defineProperty(window.DeviceOrientationEvent,'requestPermission',{configurable:true,value:permission});
    button('#activate-gyro').click();expect(permission).toHaveBeenCalledOnce();expect(button('#activate-overlay').hidden).toBe(false);
    resolve('granted');await vi.advanceTimersByTimeAsync(1);expect(button('#activate-overlay').hidden).toBe(true);expect(button('#gyro-settings').hidden).toBe(false);
    Object.defineProperty(window.DeviceOrientationEvent,'requestPermission',{configurable:true,value:undefined});
  });
  it('calibrates orientation events, then transmits analog steering and stops on sensor loss',async()=>{
    Object.defineProperty(window.DeviceOrientationEvent,'requestPermission',{configurable:true,value:undefined});
    button('#activate-gyro').click();await vi.advanceTimersByTimeAsync(1);
    for(let i=0;i<20;i++){window.dispatchEvent(Object.assign(new Event('deviceorientation'),{beta:60,gamma:0}));vi.advanceTimersByTime(20);}
    pointer(1,'pointerdown',button('[data-action="gas"]'));
    for(let i=0;i<20;i++){window.dispatchEvent(Object.assign(new Event('deviceorientation'),{beta:60,gamma:40}));vi.advanceTimersByTime(20);}
    expect(lastInput().steer).toBeGreaterThan(.4);expect(lastInput().throttle).toBe(1);
    socket.receive({type:'status',phase:'race',speed:80,lap:1});vi.advanceTimersByTime(700);
    expect(lastInput()).toMatchObject({steer:0,throttle:0});expect(socket.sent.some(p=>p.type==='action'&&p.action==='suspend')).toBe(true);
  });
  it('offers tactile control and an HTTPS explanation on an insecure phone page',()=>{
    controller.dispose();Object.defineProperty(window,'isSecureContext',{configurable:true,value:false});controller=new Controller(root);
    expect(button('#activate-gyro').disabled).toBe(true);expect(button('#activation-help').textContent).toContain('HTTPS');expect(button('#activate').disabled).toBe(false);
  });
  it('keeps buttons available after denied sensor permission',async()=>{
    Object.defineProperty(window.DeviceOrientationEvent,'requestPermission',{configurable:true,value:async()=> 'denied'});
    button('#activate-gyro').click();await vi.advanceTimersByTimeAsync(1);expect(button('#activate-overlay').hidden).toBe(false);expect(button('#activation-help').textContent).toContain('refusé');
    button('#activate').click();expect(button('#activate-overlay').hidden).toBe(true);pointer(1,'pointerdown',button('[data-action="gas"]'));expect(lastInput().throttle).toBe(1);
    Object.defineProperty(window.DeviceOrientationEvent,'requestPermission',{configurable:true,value:undefined});
  });
});
