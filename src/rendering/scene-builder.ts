import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { campusMaterial } from './campus-materials';

export class SceneBuilder {
  readonly group = new THREE.Group();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  material(color: string) {
    if (!this.materials.has(color)) this.materials.set(color, campusMaterial(color));
    return this.materials.get(color)!;
  }
  mesh(
    geometry: THREE.BufferGeometry,
    color: string,
    position: [number, number, number],
    parent: THREE.Object3D = this.group,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, this.material(color));
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  box(
    size: [number, number, number],
    color: string,
    position: [number, number, number],
    parent?: THREE.Object3D,
  ) {
    return this.mesh(new THREE.BoxGeometry(...size), color, position, parent);
  }
  label(text: string, position: [number, number, number], width = 5, observerOnly = true) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#12282edd';
    ctx.beginPath();
    ctx.roundRect(0, 0, 512, 100, 18);
    ctx.fill();
    ctx.font = 'bold 32px sans-serif';
    ctx.fillStyle = '#d8f3e8';
    ctx.textAlign = 'center';
    ctx.fillText(text, 256, 62);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: !observerOnly }),
    );
    // Labels are annotations, so camera direction and framing rays pass through them.
    sprite.raycast = () => {};
    sprite.position.set(...position);
    sprite.scale.set(width, width / 5, 1);
    sprite.layers.set(observerOnly ? 2 : 0);
    this.group.add(sprite);
  }
  batchStaticMeshes(group: THREE.Group) {
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const object of [...group.children]) {
      if (
        !(object instanceof THREE.Mesh) ||
        object instanceof THREE.InstancedMesh ||
        object.userData.noBatch ||
        object.userData.ownedMaterial ||
        Array.isArray(object.material)
      )
        continue;
      object.updateMatrix();
      const geometry = object.geometry.index
        ? object.geometry.toNonIndexed()
        : object.geometry.clone();
      geometry.applyMatrix4(object.matrix);
      const geometries = batches.get(object.material) ?? [];
      geometries.push(geometry);
      batches.set(object.material, geometries);
      object.geometry.dispose();
      group.remove(object);
    }
    for (const [material, geometries] of batches) {
      const geometry = mergeGeometries(geometries);
      geometries.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
}
