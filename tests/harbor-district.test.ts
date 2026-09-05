import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {Course} from '../src/game/course';
import {HarborDistrict} from '../src/game/harbor-district';
const course=new Course();
describe('coherent harbor district',()=>{
 it('builds street fronts and two towers with a bounded batch count and finite geometry',()=>{
  const district=new HarborDistrict(course,()=>5);
  console.log('harbor',{batches:district.root.children.length,footprints:district.footprints.length,towers:district.footprints.filter(f=>f.name.includes('tour')).length,terraces:district.footprints.filter(f=>f.name==='terrasse').length});
  expect(district.root.children.length).toBeLessThanOrEqual(15);expect(district.root.children.length).toBeGreaterThan(10);
  expect(district.footprints.filter(f=>f.name.includes('tour'))).toHaveLength(2);
  expect(district.footprints.filter(f=>f.name==='terrasse').length).toBeGreaterThanOrEqual(10);
  district.root.traverse(o=>{if(o instanceof T.Mesh){expect(Array.from(o.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);expect(o.geometry.boundingSphere?.radius).toBeGreaterThan(0);}});
  district.dispose();expect(district.root.children).toHaveLength(0);
 });
 it('keeps all masonry footprints outside the whole racing surface and reserves the gate opening',()=>{
  const district=new HarborDistrict(course,()=>5);
  for(const footprint of district.footprints)expect(HarborDistrict.footprintClear(course,footprint,0),footprint.name).toBe(true);
  district.root.updateMatrixWorld(true);
  const ray=new T.Raycaster();
  for(const s of [222,225,228])for(const lane of [-8.5,-4,0,4,8.5]){
   const origin=course.position(s,lane,.1);ray.set(origin,new T.Vector3(0,1,0));ray.near=0;ray.far=11.8;
   expect(ray.intersectObject(district.root,true),`gate s${s} lane${lane}`).toHaveLength(0);
  }
  const f=district.footprints.find(p=>p.name==='terrasse')!;expect(district.occupies(f.center,.5)).toBe(true);expect(district.occupies(course.position(110,0),1)).toBe(false);
  district.dispose();
 });
 it('has visible upward-facing terracotta roofs, including hipped street roofs',()=>{
  const district=new HarborDistrict(course,()=>5),roof=district.root.children.find(o=>o.name==='harbor-roof') as T.Mesh;
  district.root.updateMatrixWorld(true);
  for(const building of district.footprints.filter(f=>f.name==='terrasse')){
    const ray=new T.Raycaster(building.center.clone().add(new T.Vector3(0,55,0)),new T.Vector3(0,-1,0));
    const hit=ray.intersectObject(roof)[0];expect(hit,'roof covers its building').toBeDefined();expect(hit.face!.normal.y).toBeGreaterThan(.35);
  }
  district.dispose();
 });
});
