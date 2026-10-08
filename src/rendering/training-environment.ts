import * as THREE from 'three';
import { PRACTICE_MAP, type TrainingMap, type PhotoSpot } from '../maps/maps';
import { PRACTICE_COURSES } from '../maps/practice';
import { rallyPose } from '../maps/rally';
import { SceneBuilder } from './scene-builder';
import { buildPark } from './park-scene';
import { buildCampus } from './campus-scene';
import { buildRally, buildSilverstone } from './circuit-scene';
import { buildPracticeAids } from './practice-scene';

export class TrainingEnvironment extends SceneBuilder {
  subject = new THREE.Group();
  readonly target = new THREE.Vector3(0, 3.5, -13);
  map = PRACTICE_MAP;
  spot = PRACTICE_MAP.spots[0];
  forest?: THREE.Group;
  readonly courseMarkers = new Map<string, (THREE.Mesh | THREE.Line)[][]>();
  rallyWheels: THREE.Group[] = [];
  rallyDust?: THREE.InstancedMesh;
  rallyDistance = 0;
  private treesEnabled = true;
  get treesVisible(): boolean {
    return this.treesEnabled;
  }
  private dustParticle = new THREE.Object3D();
  setMap(map: TrainingMap, spot: PhotoSpot): void {
    const disposedGeometry = new Set<THREE.BufferGeometry>();
    const disposedMaterial = new Set<THREE.Material>();
    this.group.traverse((object) => {
      if (
        (object instanceof THREE.Mesh || object instanceof THREE.Line) &&
        !disposedGeometry.has(object.geometry)
      ) {
        object.geometry.dispose();
        disposedGeometry.add(object.geometry);
      }
      if (object instanceof THREE.InstancedMesh) object.dispose();
      if (object instanceof THREE.Mesh && object.userData.ownedMaterial) {
        if (object.userData.ownedTexture)
          (object.material as THREE.MeshStandardMaterial).map?.dispose();
        const material = object.material as THREE.Material;
        if (!disposedMaterial.has(material)) {
          material.dispose();
          disposedMaterial.add(material);
        }
      }
      if (object instanceof THREE.Sprite) {
        object.material.map?.dispose();
        object.material.dispose();
      }
      if (object instanceof THREE.Line) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.group.clear();
    this.courseMarkers.clear();
    this.forest = undefined;
    this.subject = new THREE.Group();
    this.map = map;
    this.spot = spot;
    this.rallyWheels = [];
    this.rallyDust = undefined;
    this.rallyDistance = map.circuit ? NaN : 0;
    this.target.set(...spot.target);
    if (map.id === 'ateneo') buildCampus(this);
    else if (map.id === 'silverstone') buildSilverstone(this);
    else if (map.id === 'rally') buildRally(this);
    else buildPark(this);
    buildPracticeAids(this);
  }
  setCourseProgress(next: number): void {
    for (const course of PRACTICE_COURSES)
      this.courseMarkers.get(course.id)?.forEach((markers, i) => {
        const selected = course.id === this.spot.courseId;
        const color =
          selected && i < next ? '#75c69b' : selected && i === next ? '#ffe6a0' : course.color;
        markers.forEach((marker) => {
          if (marker instanceof THREE.Mesh) marker.material = this.material(color);
          else (marker.material as THREE.LineBasicMaterial).color.set(color);
        });
      });
  }
  updateRally(distance: number): boolean {
    const circuit = this.map.circuit;
    if (!circuit || distance === this.rallyDistance) return false;
    const pose = circuit.pose(distance);
    this.rallyDistance = distance;
    this.subject.position.set(pose.x, 0, pose.z);
    this.subject.rotation.y = -pose.heading;
    this.rallyWheels.forEach((wheel) => (wheel.rotation.x = -distance / circuit.car.wheelRadius));
    this.target.set(pose.x, this.map.id === 'silverstone' ? 0.6 : 0.95, pose.z);
    this.subject.updateMatrixWorld(true);
    if (this.rallyDust) {
      // Render zero-sized dust at the start so its shader is ready before flight.
      const particle = this.dustParticle;
      for (let i = 0; i < 16; i++) {
        const trail = rallyPose(Math.max(0, distance - 3 - i * 0.9));
        const spread = (i % 2 ? -1 : 1) * (0.4 + i * 0.05);
        particle.position.set(
          trail.x + Math.cos(trail.heading) * spread,
          0.25 + i * 0.045,
          trail.z + Math.sin(trail.heading) * spread,
        );
        particle.scale.setScalar(distance > 0 ? 0.3 + i * 0.065 : 0);
        particle.updateMatrix();
        this.rallyDust.setMatrixAt(i, particle.matrix);
      }
      this.rallyDust.instanceMatrix.needsUpdate = true;
    }
    return true;
  }
  setTreesVisible(visible: boolean): void {
    this.treesEnabled = visible;
    if (this.forest) this.forest.visible = visible;
  }
}
