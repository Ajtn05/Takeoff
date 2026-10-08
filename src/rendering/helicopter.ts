import * as THREE from 'three';

export function createHelicopter(): { body: THREE.Group; propellers: THREE.Mesh[] } {
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
        new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.2 }),
      );
    const object = new THREE.Mesh(geometry, materials.get(color));
    object.position.set(...position);
    object.castShadow = object.receiveShadow = true;
    body.add(object);
    return object;
  };
  const box = (size: [number, number, number], color: string, position: [number, number, number]) =>
    mesh(new THREE.BoxGeometry(...size), color, position);
  const fuselage = mesh(new THREE.SphereGeometry(1, 24, 16), '#e2e7e7', [0, 0, -0.45]);
  fuselage.scale.set(0.78, 0.73, 1.72);
  const cockpit = mesh(new THREE.SphereGeometry(1, 24, 16), '#2c596b', [0, 0.15, -1.35]);
  cockpit.scale.set(0.72, 0.53, 0.88);
  box([0.08, 0.74, 0.05], '#dae2e3', [0, 0.17, -2.18]);
  for (const side of [-1, 1]) {
    box([0.05, 0.2, 2.15], '#e49a3c', [side * 0.75, -0.1, -0.3]);
    box([0.12, 0.1, 3.1], '#3c484e', [side * 0.85, -1.08, -0.35]);
    for (const z of [-1.1, 0.65]) {
      const strut = box([0.08, 0.47, 0.08], '#67767e', [side * 0.7, -0.84, z]);
      strut.rotation.z = side * 0.4;
    }
  }
  const tail = mesh(new THREE.CylinderGeometry(0.1, 0.28, 3.2, 12), '#e2e7e7', [0, 0.13, 2.1]);
  tail.rotation.x = Math.PI / 2;
  const fin = box([0.1, 1.22, 0.58], '#e49a3c', [0, 0.28, 3.92]);
  fin.rotation.x = -0.25;
  box([1.6, 0.07, 0.45], '#e2e7e7', [0, 0.05, 3.4]);
  mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.45, 12), '#46545d', [0, 0.88, -0.2]);
  const mainRotor = box([6, 0.025, 0.16], '#2f393f', [0, 1.1, -0.2]);
  mainRotor.name = 'main-rotor';
  propellers.push(mainRotor);
  const tailRotor = box([0.04, 1.1, 0.1], '#2f393f', [0.28, 0.33, 3.8]);
  tailRotor.name = 'tail-rotor';
  tailRotor.userData.spinAxis = 'x';
  propellers.push(tailRotor);
  const axle = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 12), '#74848b', [0.12, 0.33, 3.8]);
  axle.rotation.z = Math.PI / 2;
  box([0.2, 0.26, 0.2], '#67767e', [0, -0.5, -1.35]);
  mesh(new THREE.SphereGeometry(0.2, 16, 12), '#1a343f', [0, -0.63, -1.35]);
  body.traverse((object) => object.layers.set(1));
  return { body, propellers };
}
