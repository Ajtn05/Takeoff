import * as THREE from 'three';
import { DRONE_DIMENSIONS } from '../flight/simulation';

export function createDrone(): { body: THREE.Group; propellers: THREE.Mesh[] } {
  const body = new THREE.Group();
  const propellers: THREE.Mesh[] = [];
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const mesh = (
    geometry: THREE.BufferGeometry,
    color: string,
    position: [number, number, number],
  ) => {
    if (!materials.has(color))
      materials.set(
        color,
        new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15 }),
      );
    const object = new THREE.Mesh(geometry, materials.get(color));
    object.position.set(...position);
    object.castShadow = object.receiveShadow = true;
    body.add(object);
    return object;
  };
  const box = (size: [number, number, number], color: string, position: [number, number, number]) =>
    mesh(new THREE.BoxGeometry(...size), color, position);
  box([0.09, 0.047, 0.19], '#c5cdd0', [0, 0.006, 0]);
  box([0.064, 0.018, 0.035], '#e69f4e', [0, 0.018, -0.106]);
  const motorX = (DRONE_DIMENSIONS.width - 0.03) / 2;
  const motorZ = (DRONE_DIMENSIONS.length - 0.03) / 2;
  for (const [x, z] of [
    [-motorX, -motorZ],
    [motorX, -motorZ],
    [-motorX, motorZ],
    [motorX, motorZ],
  ]) {
    const arm = box([Math.hypot(x, z), 0.018, 0.019], '#414c4b', [x / 2, 0, z / 2]);
    arm.rotation.y = -Math.atan2(z, x);
    mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.032, 12), '#37433f', [x, 0.0338, z]);
    const blade = box([DRONE_DIMENSIONS.rotorDiameter, 0.003, 0.014], '#334141', [x, 0.0525, z]);
    blade.name = 'propeller';
    propellers.push(blade);
    box([0.012, 0.038, 0.014], '#8c9c98', [x * 0.8, -0.037, z * 0.8]);
  }
  mesh(new THREE.SphereGeometry(0.022, 12, 8), '#213a44', [0, -0.025, -0.105]);
  body.traverse((object) => object.layers.set(1));
  return { body, propellers };
}
