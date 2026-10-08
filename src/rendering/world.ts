import { renderViewport, resizeRenderer } from './viewport';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  GENERIC_PROFILE,
  aircraftEnvelope,
  type AircraftType,
  type DroneState,
} from '../flight/simulation';
import { PRACTICE_MAP, type TrainingMap, type PhotoSpot } from '../maps/maps';
import { createDrone } from './drone';
import { createHelicopter } from './helicopter';
import { TrainingEnvironment } from './training-environment';

export class TrainingWorld {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(GENERIC_PROFILE.fov, 16 / 9, 0.01, 2500);
  readonly observer = new THREE.PerspectiveCamera(47, 1, 0.1, 3000);
  readonly renderer: THREE.WebGLRenderer;
  readonly drone = new THREE.Group();
  private body = new THREE.Group();
  private aidCamera = new THREE.PerspectiveCamera(GENERIC_PROFILE.fov, 16 / 9, 0.15, 12);
  private frustum = new THREE.CameraHelper(this.aidCamera);
  private direction = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0xe8ac49 }),
  );
  private trail = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x428980, transparent: true, opacity: 0.65 }),
  );
  private trailPoints: THREE.Vector3[] = [];
  private propellers: THREE.Mesh[] = [];
  private aircraftType: AircraftType = 'quadcopter';
  private ray = new THREE.Raycaster();
  private photoTarget = new THREE.WebGLRenderTarget(1280, 720);
  private pixelRatio = Math.min(devicePixelRatio, 2);
  private environment = new TrainingEnvironment();
  private shadowPose: number[] = [];
  private lastShadowUpdate = 0;
  private aidPosition = new THREE.Vector3(NaN, NaN, NaN);
  private aidRotation = new THREE.Quaternion();
  private framingPose: number[] = [];
  private framingResult = false;
  private map = PRACTICE_MAP;
  private spot = PRACTICE_MAP.spots[0];
  private sun = new THREE.DirectionalLight('#fff1d1', 3.2);
  private hemisphere = new THREE.HemisphereLight('#dceaff', '#647147', 1.4);
  private droneMarker = new THREE.Sprite(
    new THREE.SpriteMaterial({ color: '#b7f7d4', depthTest: false }),
  );
  private observerControls: OrbitControls;
  private fixedPosition = new THREE.Vector3();
  private fixedTarget = new THREE.Vector3();
  aids = true;
  private observerMode: 'fixed' | 'follow' | 'overview' = 'fixed';
  get overview(): boolean {
    return this.observerMode === 'overview';
  }

  constructor(
    private stage: HTMLElement,
    private observerView: HTMLElement,
    private cameraView: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      logarithmicDepthBuffer: true,
    });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Reuse the same shadow map for both views and while the aircraft is stationary.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.className = 'world-canvas';
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Practice park rendered from the observer and drone cameras',
    );
    stage.prepend(this.renderer.domElement);
    this.observerControls = new OrbitControls(this.observer, observerView);
    this.observerControls.minDistance = 2;
    this.observerControls.maxDistance = 2500;
    this.observerControls.maxPolarAngle = Math.PI / 2 - 0.03;
    const observerKeys = document.createElement('div');
    this.observerControls.listenToKeyEvents(observerKeys);
    this.observerControls.addEventListener('change', () => {
      if (this.observerMode === 'fixed') {
        this.fixedPosition.copy(this.observer.position);
        this.fixedTarget.copy(this.observerControls.target);
      }
    });
    // Header controls do not start camera drags.
    observerView
      .querySelector('.view-heading')!
      .addEventListener('pointerdown', (event) => event.stopPropagation());
    observerView.addEventListener('keydown', (event) => {
      if (event.target !== observerView || this.observerMode !== 'fixed' || !event.altKey) return;
      if (event.code.startsWith('Arrow')) {
        observerKeys.dispatchEvent(
          new KeyboardEvent('keydown', { code: event.code, shiftKey: event.shiftKey }),
        );
        event.preventDefault();
        return;
      }
      if (!['Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract'].includes(event.code)) return;
      event.preventDefault();
      const offset = this.observer.position.clone().sub(this.observerControls.target);
      offset.setLength(
        THREE.MathUtils.clamp(
          offset.length() * (['Equal', 'NumpadAdd'].includes(event.code) ? 0.85 : 1.15),
          2,
          this.observerControls.maxDistance,
        ),
      );
      this.observer.position.copy(this.observerControls.target).add(offset);
      this.observerControls.update();
    });
    observerView.addEventListener('contextmenu', (event) => {
      if (this.observerMode === 'fixed') event.preventDefault();
    });
    this.scene.background = new THREE.Color('#bdd8ec');
    this.scene.fog = new THREE.Fog('#c8dfdf', 65, 140);
    this.scene.add(this.hemisphere);
    this.sun.intensity = 2.2;
    const sun = this.sun;
    sun.position.set(-20, 35, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -45,
      right: 45,
      top: 40,
      bottom: -40,
      near: 1,
      far: 100,
    });
    sun.shadow.bias = -0.001;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.scene.add(this.environment.group);
    this.setMap(PRACTICE_MAP, this.spot);
    this.buildDrone();
    this.observer.layers.enable(1);
    this.observer.layers.enable(2);
    this.frustum.layers.set(2);
    this.direction.layers.set(2);
    this.trail.layers.set(2);
    this.scene.add(this.frustum, this.direction, this.trail);
    const markerCanvas = document.createElement('canvas');
    markerCanvas.width = markerCanvas.height = 64;
    const markerContext = markerCanvas.getContext('2d')!;
    markerContext.strokeStyle = '#b7f7d4';
    markerContext.lineWidth = 4;
    markerContext.beginPath();
    markerContext.arc(32, 32, 20, 0, Math.PI * 2);
    markerContext.stroke();
    markerContext.fillStyle = '#b7f7d4';
    markerContext.beginPath();
    markerContext.arc(32, 32, 4, 0, Math.PI * 2);
    markerContext.fill();
    this.droneMarker.material.map = new THREE.CanvasTexture(markerCanvas);
    this.droneMarker.material.color.set('#ffffff');
    this.droneMarker.layers.set(2);
    this.droneMarker.scale.set(0.6, 0.6, 1);
    this.scene.add(this.droneMarker);
    this.photoTarget.texture.colorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('trainer-context-lost'));
    });
  }
  setMap(map: TrainingMap, spot: PhotoSpot): void {
    this.map = map;
    this.spot = spot;
    this.environment.setMap(map, spot);
    this.framingPose = [];
    this.shadowPose = [];
    this.aidPosition.set(NaN, NaN, NaN);
    this.renderer.shadowMap.needsUpdate = true;
    this.resetTrail();
    const campus = map.id === 'ateneo';
    this.renderer.domElement.setAttribute(
      'aria-label',
      `${map.name} rendered from the observer and drone cameras`,
    );
    const silverstone = map.id === 'silverstone';
    this.observerControls.maxDistance = silverstone ? 10000 : 2500;
    this.scene.fog = new THREE.Fog(
      '#bdd8ec',
      silverstone ? 2400 : campus ? 900 : 400,
      silverstone ? 6500 : campus ? 2800 : 1500,
    );
    this.camera.far = silverstone ? 8000 : 2500;
    this.camera.updateProjectionMatrix();
    this.observer.far = silverstone ? 16000 : 3000;
    this.observer.updateProjectionMatrix();
    const base = map.ground(spot.pad.x, spot.pad.z);
    this.sun.position.set(spot.pad.x - 60, base + 100, spot.pad.z + 45);
    this.sun.target.position.set(spot.pad.x, base, spot.pad.z);
    Object.assign(this.sun.shadow.camera, {
      left: -100,
      right: 100,
      top: 100,
      bottom: -100,
      near: 1,
      far: 250,
    });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.resetFixedView();
  }
  setObserverMode(mode: 'fixed' | 'follow' | 'overview'): void {
    this.observerMode = mode;
    this.observerControls.enabled = mode === 'fixed';
    this.observerView.style.touchAction = mode === 'fixed' ? 'none' : 'auto';
    this.observerView.dataset.mode = mode;
    this.observerView.tabIndex = mode === 'fixed' ? 0 : -1;
    if (mode === 'fixed') {
      this.observer.position.copy(this.fixedPosition);
      this.observerControls.target.copy(this.fixedTarget);
      this.observerControls.update();
    }
  }
  resetFixedView(): void {
    const { pad, target, courseId } = this.spot;
    if (this.map.id === 'ateneo') {
      this.fixedPosition.set(pad.x + 80, this.map.ground(pad.x, pad.z) + 90, pad.z + 100);
      this.fixedTarget.set(...target);
    } else if (this.map.id === 'rally') {
      this.fixedPosition.set(0, 290, 220);
      this.fixedTarget.set(0, 0, 0);
    } else if (this.map.id === 'silverstone') {
      this.fixedPosition.set(pad.x + 70, 85, pad.z + 105);
      this.fixedTarget.set(...target);
    } else if (courseId) {
      this.fixedPosition.set(pad.x + 18, 20, pad.z + 22);
      this.fixedTarget.set(...target);
    } else {
      this.fixedPosition.set(27, 24, 34);
      this.fixedTarget.set(0, 1, -5);
    }
    // Update the controls' internal spherical state even when another view is active.
    this.observer.position.copy(this.fixedPosition);
    this.observerControls.target.copy(this.fixedTarget);
    this.observerControls.update();
  }
  setCameraFov(fov: number): void {
    this.camera.fov = this.aidCamera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.aidCamera.updateProjectionMatrix();
    this.aidPosition.set(NaN, NaN, NaN);
    this.framingPose = [];
  }
  setCourseProgress(next: number): void {
    this.environment.setCourseProgress(next);
  }
  updateRally(distance: number): void {
    if (this.environment.updateRally(distance)) {
      this.framingPose = [];
      this.aidPosition.set(NaN, NaN, NaN);
    }
  }
  private buildDrone() {
    const drone = this.aircraftType === 'helicopter' ? createHelicopter() : createDrone();
    this.body = drone.body;
    this.propellers = drone.propellers;
    this.drone.add(this.body);
    this.scene.add(this.drone);
    this.drone.layers.set(1);
    this.renderer.domElement.dataset.aircraftType = this.aircraftType;
  }
  setAircraftType(type: AircraftType): void {
    if (type === this.aircraftType) return;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.body.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material])
        materials.add(material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.drone.remove(this.body);
    this.aircraftType = type;
    this.buildDrone();
    this.shadowPose = [];
    this.framingPose = [];
    this.aidPosition.set(NaN, NaN, NaN);
    this.renderer.shadowMap.needsUpdate = true;
  }
  setQuality(low: boolean): void {
    this.pixelRatio = low ? 1 : Math.min(devicePixelRatio, 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = !low;
    this.renderer.shadowMap.needsUpdate = true;
  }
  setTreesVisible(visible: boolean): void {
    this.environment.setTreesVisible(visible);
    this.renderer.shadowMap.needsUpdate = true;
    this.framingPose = [];
    this.aidPosition.set(NaN, NaN, NaN);
  }
  resetTrail(): void {
    this.trailPoints = [];
    this.trail.geometry.dispose();
    this.trail.geometry = new THREE.BufferGeometry();
  }
  update(s: DroneState, time: number): void {
    this.drone.position.set(s.x, s.y, s.z);
    this.drone.rotation.y = -s.heading;
    this.body.rotation.set(s.pitch, 0, s.bank);
    this.propellers.forEach((p, i) => {
      if (p.userData.spinAxis === 'x') p.rotation.x = time * 0.08;
      else p.rotation.y = time * (i % 2 ? -0.06 : 0.06);
    });
    const envelope = aircraftEnvelope(this.aircraftType);
    this.camera.position.set(
      s.x + Math.sin(s.heading) * envelope.cameraForward,
      s.y + envelope.cameraHeight,
      s.z - Math.cos(s.heading) * envelope.cameraForward,
    );
    this.camera.rotation.set(THREE.MathUtils.degToRad(s.gimbal), -s.heading, 0, 'YXZ');
    this.camera.updateMatrixWorld();
    this.droneMarker.position.set(
      s.x,
      s.y + (this.aircraftType === 'helicopter' ? envelope.halfHeight + 0.4 : 0.8),
      s.z,
    );
    const ground = this.map.ground(s.x, s.z);
    this.sun.position.set(s.x - 60, ground + 100, s.z + 45);
    this.sun.target.position.set(s.x, ground, s.z);
    const shadowPose = [s.x, s.y, s.z, s.heading, s.pitch, s.bank, this.environment.rallyDistance];
    if (
      shadowPose.some((value, i) => value !== this.shadowPose[i]) &&
      (time === 0 || time - this.lastShadowUpdate >= 100)
    ) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowPose = shadowPose;
      this.lastShadowUpdate = time;
    }
    if (
      this.aids &&
      (!this.aidPosition.equals(this.camera.position) ||
        !this.aidRotation.equals(this.camera.quaternion))
    ) {
      this.aidPosition.copy(this.camera.position);
      this.aidRotation.copy(this.camera.quaternion);
      this.aidCamera.position.copy(this.camera.position);
      this.aidCamera.quaternion.copy(this.camera.quaternion);
      this.aidCamera.updateMatrixWorld();
      this.frustum.update();
      const direction = this.camera.getWorldDirection(new THREE.Vector3());
      this.ray.set(this.camera.position, direction);
      this.ray.far = 25;
      const hit = this.ray.intersectObjects(this.scene.children, true)[0];
      const end = this.camera.position.clone().addScaledVector(direction, hit?.distance ?? 14);
      this.direction.geometry.setFromPoints([this.camera.position, end]);
    }
    if (
      s.mode !== 'grounded' &&
      (this.trailPoints.length === 0 ||
        this.trailPoints.at(-1)!.distanceTo(this.drone.position) > 0.3)
    ) {
      this.trailPoints.push(this.drone.position.clone());
      if (this.trailPoints.length > 400) this.trailPoints.shift();
      this.trail.geometry.dispose();
      this.trail.geometry = new THREE.BufferGeometry().setFromPoints(this.trailPoints);
    }
    if (this.observerMode === 'follow') {
      const helicopter = this.aircraftType === 'helicopter';
      const distance = helicopter ? 18 : 9;
      this.observer.position.lerp(
        new THREE.Vector3(
          s.x - Math.sin(s.heading) * distance + (helicopter ? 4 : 3),
          s.y + (helicopter ? 10 : 6),
          s.z + Math.cos(s.heading) * distance,
        ),
        0.06,
      );
      this.observer.lookAt(s.x, s.y, s.z);
    } else if (this.overview) {
      const b = this.map.bounds;
      // Fit the complete map above instruments that cover the bottom of this view.
      const view = this.observerView.getBoundingClientRect();
      const panel = this.stage.querySelector<HTMLElement>('#flight-panel')!.getBoundingClientRect();
      const height = Math.max(1, view.height);
      const width = Math.max(1, view.width);
      const covered =
        panel.right > view.left && panel.left < view.right
          ? THREE.MathUtils.clamp(view.bottom - Math.max(view.top, panel.top), 0, height * 0.75)
          : 0;
      const available = height - covered;
      const tangent = Math.tan(THREE.MathUtils.degToRad(this.observer.fov / 2));
      const distance =
        ((Math.max(b.maxZ - b.minZ, (b.maxX - b.minX) / (width / available)) / (2 * tangent)) *
          1.12 *
          height) /
        available;
      const x = (b.minX + b.maxX) / 2;
      const z = (b.minZ + b.maxZ) / 2 + (distance * tangent * covered) / height;
      const ground = this.map.ground(0, 0);
      this.observer.position.set(x, distance + ground, z + 0.01);
      this.observer.lookAt(x, ground, z);
    } else this.observerControls.update();
    this.frustum.visible = this.direction.visible = this.trail.visible = this.aids;
    this.droneMarker.visible = this.aids && s.mode !== 'grounded';
    if (this.aids) this.observer.layers.enable(2);
    else this.observer.layers.disable(2);
  }
  render(): void {
    resizeRenderer(this.renderer, this.stage);
    this.renderer.setScissorTest(false);
    this.renderer.setClearColor('#181c20');
    this.renderer.clear();
    this.renderer.setScissorTest(true);
    const fog = this.scene.fog;
    if (this.overview) this.scene.fog = null;
    renderViewport(this.renderer, this.scene, this.observer, this.observerView, this.stage);
    this.scene.fog = fog;
    renderViewport(this.renderer, this.scene, this.camera, this.cameraView, this.stage);
  }
  subjectInFrame(): boolean {
    const pose = [
      ...this.camera.position.toArray(),
      ...this.camera.quaternion.toArray(),
      this.camera.aspect,
    ];
    if (pose.every((value, i) => value === this.framingPose[i])) return this.framingResult;
    this.framingPose = pose;
    this.framingResult = this.checkSubjectInFrame();
    return this.framingResult;
  }
  private checkSubjectInFrame(): boolean {
    this.camera.updateMatrixWorld();
    const projected = this.environment.target.clone().project(this.camera);
    if (
      Math.abs(projected.x) > 0.85 ||
      Math.abs(projected.y) > 0.8 ||
      projected.z < -1 ||
      projected.z > 1
    )
      return false;
    const delta = this.environment.target.clone().sub(this.camera.position);
    this.ray.set(this.camera.position, delta.clone().normalize());
    this.ray.far = delta.length() + 1;
    const hit = this.ray.intersectObjects(this.scene.children, true)[0];
    if (!hit) return false;
    let object: THREE.Object3D | null = hit.object;
    while (object) {
      if (object === this.environment.subject) return true;
      object = object.parent;
    }
    return false;
  }
  async capture(): Promise<Blob> {
    const camera = this.camera.clone();
    camera.aspect = 16 / 9;
    camera.updateProjectionMatrix();
    camera.layers.set(0);
    this.renderer.setScissorTest(false);
    this.renderer.setRenderTarget(this.photoTarget);
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, camera);
    const pixels = new Uint8Array(1280 * 720 * 4);
    // Queue the GPU copy, then restore the screen target before yielding to animation frames.
    const readback = this.renderer.readRenderTargetPixelsAsync(
      this.photoTarget,
      0,
      0,
      1280,
      720,
      pixels,
    );
    this.renderer.setRenderTarget(null);
    await readback;
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d')!;
    const output = ctx.createImageData(1280, 720);
    for (let y = 0; y < 720; y++)
      output.data.set(pixels.subarray((719 - y) * 1280 * 4, (720 - y) * 1280 * 4), y * 1280 * 4);
    ctx.putImageData(output, 0, 0);
    return new Promise((accept, reject) =>
      canvas.toBlob(
        (blob) => (blob ? accept(blob) : reject(new Error('Photo could not be saved'))),
        'image/png',
      ),
    );
  }
}
