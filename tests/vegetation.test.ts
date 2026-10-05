import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { campusTrees, createAcacia, acaciaObstacle, campusRoadWidth } from '../src/vegetation';
import { buildCampusTrees } from '../src/campus';
import { initialState, stepFlight, GENERIC_PROFILE, pointInPolygon, overlapsFootprint } from '../src/simulation';
import { neutralControls } from '../shared/protocol';
import type { CampusData } from '../src/maps';

const data=JSON.parse(readFileSync(new URL('../public/data/ateneo-campus.json',import.meta.url),'utf8')) as CampusData;
const bounds={minX:-2000,maxX:2000,minZ:-2000,maxZ:2000,ceiling:80};

test('shorter acacias retain a clear flight corridor beneath spreading branches',()=> {
  const tree=createAcacia(0,0,()=>0),obstacle=acaciaObstacle(tree);
  assert.ok(tree.height>=13 && tree.height<=19);
  const state=initialState({x:-18,z:4});state.mode='flying';state.y=5;state.vx=5;
  for(let i=0;i<420;i++) stepFlight(state,{...neutralControls(),right:1},1/60,{...GENERIC_PROFILE,speed:5},[obstacle],bounds);
  assert.equal(state.mode,'flying');assert.ok(state.x>16);
  const above=initialState({x:0,z:0});above.mode='flying';above.y=tree.height+2;
  stepFlight(above,neutralControls(),1/60,GENERIC_PROFILE,[obstacle],bounds);assert.equal(above.mode,'flying');
});

test('tree trunks, raised branches and foliage still stop the aircraft at terrain-relative heights',()=> {
  const tree=createAcacia(0,0,()=>70),obstacle=acaciaObstacle(tree);
  for(const [x,y,z] of [[0,72,0],tree.limbs[2].to,tree.crowns[0].center]) {
    const state=initialState({x,z},0,()=>70);state.mode='flying';state.y=y;
    stepFlight(state,neutralControls(),1/60,GENERIC_PROFILE,[obstacle],bounds,()=>70);
    assert.equal(state.collision,'acacia tree');
  }
  const below=initialState({x:6,z:0},0,()=>70);below.mode='flying';below.y=75;
  stepFlight(below,neutralControls(),1/60,GENERIC_PROFILE,[obstacle],bounds,()=>70);assert.equal(below.mode,'flying');
});

test('satellite vegetation is deterministic and trunks leave buildings, fields and streets clear',()=> {
  const trees=campusTrees(data,()=>0);
  assert.ok(trees.length>700);assert.ok(trees.length<1200);
  const heights=trees.map(t=>t.height),mean=heights.reduce((sum,h)=>sum+h,0)/heights.length;
  assert.ok(Math.min(...heights)>=13 && Math.max(...heights)<=19);
  assert.ok(Math.max(...heights)-Math.min(...heights)>5.5);
  assert.ok(mean>15 && mean<17);
  assert.deepEqual(trees.map(t=>[t.x,t.z]),campusTrees(data,()=>0).map(t=>[t.x,t.z]));
  for(const tree of trees.slice(data.trees.length)) {
    assert.ok(pointInPolygon(tree.x,tree.z,data.boundary));
    for(const feature of data.features) {
      if(feature.kind==='building') assert.equal(overlapsFootprint(tree.x,tree.z,feature.points,6),false,feature.name);
      if(feature.kind==='pitch') assert.equal(overlapsFootprint(tree.x,tree.z,feature.points,5),false,feature.name);
      if(feature.kind==='road') for(let i=1;i<feature.points.length;i++) {
        const a=feature.points[i-1],b=feature.points[i],dx=b[0]-a[0],dz=b[1]-a[1];
        const t=Math.max(0,Math.min(1,((tree.x-a[0])*dx+(tree.z-a[1])*dz)/(dx*dx+dz*dz||1)));
        assert.ok(Math.hypot(tree.x-a[0]-t*dx,tree.z-a[1]-t*dz)>=campusRoadWidth(feature.type)/2+1.2);
      }
    }
  }
});

test('forest stays within its rendering budget and hidden trees are excluded from camera rays',()=> {
  const trees=[createAcacia(0,0,()=>0),createAcacia(40,0,()=>12)],group=new THREE.Group(),material=new THREE.MeshStandardMaterial();
  const forest=buildCampusTrees(trees,group,()=>material);group.updateMatrixWorld(true);
  assert.ok(forest.children.every(c=>c instanceof THREE.InstancedMesh));
  const canopy=forest.children.filter(c=>c.name==='Raised acacia canopy');
  for(const c of canopy) {
    const box=new THREE.Box3().setFromObject(c);assert.ok(box.min.y>7);
  }
  const ray=new THREE.Raycaster(new THREE.Vector3(-10,2,0),new THREE.Vector3(1,0,0),0,20);
  assert.ok(ray.intersectObject(group,true).length>0);
  forest.visible=false;assert.equal(ray.intersectObject(group,true).length,0);
  forest.visible=true;assert.ok(ray.intersectObject(group,true).length>0);
  const complete=buildCampusTrees(campusTrees(data,()=>0),group,()=>material);
  const triangles=complete.children.reduce((sum,child)=> {
    const mesh=child as THREE.InstancedMesh;
    return sum+mesh.count*(mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count)/3;
  },0);
  assert.ok(triangles<=175_000,`forest triangle budget: ${triangles}`);
  assert.ok(complete.children.length<=80,`forest rendering batches: ${complete.children.length}`);
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  group.traverse(c=> { if(c instanceof THREE.InstancedMesh) {
    geometries.add(c.geometry);if(c.userData.ownedMaterial) materials.add(c.material as THREE.Material);c.dispose();
  }});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  material.dispose();
});
