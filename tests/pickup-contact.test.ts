import {describe,it,expect} from 'vitest';
import {Quaternion,Vector3} from 'three';
import {sweptBoxContact,kartBoxContact} from '../src/game/pickup-contact';
import {Course} from '../src/game/course';
import {ItemBoxes} from '../src/game/items';
const identity=new Quaternion(),cube=new Vector3(.75,.75,.75);

describe('visible item-box contacts',()=>{
  it('collects the flat face and corner at speed but rejects a real side gap',()=>{
    const half=new Vector3(1.25,.55,2.05);
    const sweep=(x:number,y:number)=>sweptBoxContact(new Vector3(x,y,-20),new Vector3(x,y,20),identity,half,new Vector3(),identity,cube);
    expect(sweep(1.99,1.29)).not.toBeNull();
    expect(sweep(2.01,0)).toBeNull();expect(sweep(0,1.31)).toBeNull();
  });
  it('follows cube rotation instead of using its enclosing sphere',()=>{
    const turn=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/4),small=new Vector3(.05,.05,.05);
    const p=new Vector3(.9,0,.9);
    expect(sweptBoxContact(p,p,identity,small,new Vector3(),turn,cube)).toBeNull();
    p.set(1,0,0);expect(sweptBoxContact(p,p,identity,small,new Vector3(),turn,cube)).not.toBeNull();
  });
  it('accounts for a sideways kart without filling empty space above the wheels',()=>{
    const turn=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2),center=new Vector3(2.5,1.3,0),p=new Vector3(0,1.15,0);
    expect(kartBoxContact(p,p,identity,center,identity)).toBeNull();
    expect(kartBoxContact(p,p,turn,center,identity)).not.toBeNull();
    expect(kartBoxContact(p,p,identity,new Vector3(1.8,2.5,0),identity)).toBeNull();
  });
  it('collects side contact on every banked row throughout the float animation',()=>{
    const course=new Course();
    for(const distance of course.boxes)for(const time of [0,.6,1.8,3.2]){
      const field=new ItemBoxes(course);field.update(time);
      // Isolate the central cube so a neighbouring lane cannot hide a missed contact.
      for(const box of field.boxes)if(box.distance!==distance||box.lane!==0)box.cooldown=Infinity;
      expect(field.collect(course.position(distance-5,1.55,1.15),course.position(distance+5,1.55,1.15)),`row ${distance}, phase ${time}`).not.toBeNull();
      field.reset();for(const box of field.boxes)if(box.distance!==distance||box.lane!==0)box.cooldown=Infinity;
      expect(field.collect(course.position(distance-5,3.1,1.15),course.position(distance+5,3.1,1.15))).toBeNull();
    }
  });
  it('rewards a visible side overlap between two cubes without consuming the whole row',()=>{
    const course=new Course(),field=new ItemBoxes(course),distance=course.boxes[0];
    expect(field.collect(course.position(distance-4,2,1.15),course.position(distance+4,2,1.15))).not.toBeNull();
    expect(field.boxes.filter(box=>box.cooldown>0)).toHaveLength(1);
  });
  it('consumes the first physical contact even if boxes are stored in reverse order',()=>{
    const course=new Course(),field=new ItemBoxes(course),first=field.boxes[1];
    const second={...first,id:100,position:first.position.clone(),visualPosition:first.visualPosition.clone().addScaledVector(first.tangent,8),cooldown:0};
    field.boxes.splice(0,field.boxes.length,second,first);
    expect(field.collect(first.visualPosition.clone().addScaledVector(first.tangent,-10),first.visualPosition.clone().addScaledVector(first.tangent,20))).toBe(first);
    expect(second.cooldown).toBe(0);
  });
});
