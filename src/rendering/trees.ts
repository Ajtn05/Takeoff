import * as THREE from 'three';
import type { AcaciaTree } from '../maps/vegetation';

export function buildCampusTrees(
  trees: AcaciaTree[],
  parent: THREE.Object3D,
  material: (color: string) => THREE.Material,
): THREE.Group {
  const forest = new THREE.Group();
  forest.name = 'Campus acacias';
  parent.add(forest);
  // Raycaster otherwise visits invisible descendants, leaving hidden trees in photos/framing checks.
  forest.raycast = () => (forest.visible ? undefined : false);
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const patches = new Map<string, AcaciaTree[]>();
  for (const tree of trees) {
    const key = `${Math.floor(tree.x / 192)},${Math.floor(tree.z / 192)}`;
    const patch = patches.get(key) ?? [];
    patch.push(tree);
    patches.set(key, patch);
  }
  // Open five-sided cylinders and 20-face crowns replace the previous capped,
  // seven-sided branches and 80-face crowns. All instances share these geometries.
  const limbGeometry = new THREE.CylinderGeometry(0.5, 1, 1, 5, 1, true);
  const crownGeometry = new THREE.IcosahedronGeometry(1, 0);
  const vertices = crownGeometry.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i);
    const y = vertices.getY(i);
    const z = vertices.getZ(i);
    const variation = 0.97 + Math.sin(x * 17 + y * 23 + z * 13) * 0.03;
    vertices.setXYZ(i, x * variation, y * variation, z * variation);
  }
  crownGeometry.computeVertexNormals();
  const crownMaterial = material('#416f3a').clone();
  if (crownMaterial instanceof THREE.MeshStandardMaterial) crownMaterial.color.set('#ffffff');
  const shades = ['#325c36', '#416f3a', '#578341'].map((color) => new THREE.Color(color));
  // Local instance batches let rendering, shadows and camera rays skip distant groves.
  for (const patch of patches.values()) {
    const limbs = patch.flatMap((tree) => tree.limbs);
    const trunks = new THREE.InstancedMesh(limbGeometry, material('#625b46'), limbs.length);
    limbs.forEach((limb, i) => {
      direction.set(
        limb.to[0] - limb.from[0],
        limb.to[1] - limb.from[1],
        limb.to[2] - limb.from[2],
      );
      const length = direction.length();
      rotation.setFromUnitVectors(up, direction.normalize());
      position.set(
        (limb.from[0] + limb.to[0]) / 2,
        (limb.from[1] + limb.to[1]) / 2,
        (limb.from[2] + limb.to[2]) / 2,
      );
      scale.set(limb.bottomRadius, length, limb.bottomRadius);
      matrix.compose(position, rotation, scale);
      trunks.setMatrixAt(i, matrix);
    });
    trunks.name = 'Acacia trunks and swept branches';
    trunks.castShadow = trunks.receiveShadow = true;
    forest.add(trunks);
    const crowns = patch.flatMap((tree) => tree.crowns);
    const canopy = new THREE.InstancedMesh(crownGeometry, crownMaterial, crowns.length);
    crowns.forEach((c, i) => {
      position.set(...c.center);
      scale.set(...c.radii);
      rotation.identity();
      matrix.compose(position, rotation, scale);
      canopy.setMatrixAt(i, matrix);
      canopy.setColorAt(i, shades[c.shade]);
    });
    canopy.userData.ownedMaterial = true;
    canopy.name = 'Raised acacia canopy';
    canopy.castShadow = canopy.receiveShadow = true;
    forest.add(canopy);
  }
  return forest;
}
