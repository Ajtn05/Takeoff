import * as THREE from 'three';
import { GENERIC_PROFILE, PAD, type DroneState } from './simulation';

export class TrainingWorld {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(GENERIC_PROFILE.fov, 16 / 9, 0.1, 180);
  readonly observer = new THREE.PerspectiveCamera(47, 1, 0.1, 220);
  readonly renderer: THREE.WebGLRenderer;
  readonly drone = new THREE.Group();
  private body = new THREE.Group();
  private aidCamera = new THREE.PerspectiveCamera(GENERIC_PROFILE.fov, 16 / 9, 0.15, 12);
  private frustum = new THREE.CameraHelper(this.aidCamera);
  private direction = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xe8ac49 }));
  private trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x428980, transparent: true, opacity: 0.65 }));
  private trailPoints: THREE.Vector3[] = [];
  private propellers: THREE.Mesh[] = [];
  private ray = new THREE.Raycaster();
  private target = new THREE.Vector3(0, 3.5, -13);
  private subject = new THREE.Group();
  private photoTarget = new THREE.WebGLRenderTarget(1280, 720);
  private pixelRatio = Math.min(devicePixelRatio, 2);
  private lastWidth = 0;
  private lastHeight = 0;
  aids = true;
  follow = false;

  constructor(private stage: HTMLElement, private observerView: HTMLElement, private cameraView: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'world-canvas';
    this.renderer.domElement.setAttribute('aria-label', 'Practice park rendered from the observer and drone cameras');
    stage.prepend(this.renderer.domElement);
    this.scene.background = new THREE.Color('#c8dfdf');
    this.scene.fog = new THREE.Fog('#c8dfdf', 65, 140);
    this.scene.add(new THREE.HemisphereLight('#e7f7ff', '#a59c7a', 2.3));
    const sun = new THREE.DirectionalLight('#fff1d1', 3.2);
    sun.position.set(-20, 35, 18); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 40, bottom: -40, near: 1, far: 100 });
    sun.shadow.bias = -0.001; this.scene.add(sun);
    this.buildPark(); this.buildDrone();
    this.observer.layers.enable(1); this.observer.layers.enable(2);
    this.frustum.layers.set(2); this.direction.layers.set(2); this.trail.layers.set(2);
    this.scene.add(this.frustum, this.direction, this.trail);
    this.photoTarget.texture.colorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault(); window.dispatchEvent(new CustomEvent('trainer-context-lost'));
    });
  }
  private material(color: string) { return new THREE.MeshStandardMaterial({ color, roughness: 0.83 }); }
  private mesh(geometry: THREE.BufferGeometry, color: string, position: [number, number, number], parent: THREE.Object3D = this.scene): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, this.material(color)); mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  private box(size: [number, number, number], color: string, position: [number, number, number], parent?: THREE.Object3D) {
    return this.mesh(new THREE.BoxGeometry(...size), color, position, parent);
  }
  private label(text: string, position: [number, number, number]) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#12282edd'; ctx.beginPath(); ctx.roundRect(0, 0, 512, 100, 18); ctx.fill();
    ctx.font = 'bold 32px sans-serif'; ctx.fillStyle = '#d8f3e8'; ctx.textAlign = 'center'; ctx.fillText(text, 256, 62);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
    sprite.position.set(...position); sprite.scale.set(5, 1, 1); sprite.layers.set(2); this.scene.add(sprite);
  }
  private buildPark() {
    const ground = this.mesh(new THREE.PlaneGeometry(240, 240), '#a6b795', [0, -0.04, 0]);
    ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
    this.box([13, 0.06, 47], '#d9d0b9', [0, 0, -7]);
    this.box([51, 0.05, 6], '#d9d0b9', [0, 0, 3]);
    this.box([10, 7, 12], '#e9dfcb', [-14, 3.5, -13]);
    this.box([10.4, 0.3, 12.4], '#777d72', [-14, 7.15, -13]);
    for (let i = 0; i < 5; i++) {
      this.box([0.04, 3.7, 1.6], '#477980', [-8.97, 3.7, -17.7 + i * 2.3]);
      this.box([0.15, 0.15, 1.8], '#a5997d', [-8.85, 1.8, -17.7 + i * 2.3]);
    }
    this.box([4, 0.4, 2], '#bca887', [-6.5, 0.2, -13]);
    for (const [x, z] of [[12, -15], [17, -5], [-16, 8], [11, 16], [-5, -25]]) {
      this.mesh(new THREE.CylinderGeometry(0.25, 0.4, 4, 7), '#84735b', [x, 2, z]);
      this.mesh(new THREE.IcosahedronGeometry(2.1, 1), '#54846b', [x, 5, z]);
      this.mesh(new THREE.IcosahedronGeometry(1.65, 1), '#72987a', [x + 0.15, 6.6, z]);
    }
    this.subject.position.set(0, 0, -13); this.scene.add(this.subject);
    this.mesh(new THREE.CylinderGeometry(1.25, 1.4, 0.35, 24), '#d8d3bd', [0, 0.23, 0], this.subject);
    this.mesh(new THREE.CylinderGeometry(0.7, 0.95, 2.3, 12), '#efd5a8', [0, 1.5, 0], this.subject);
    const sculpture = this.mesh(new THREE.TorusKnotGeometry(0.78, 0.22, 64, 8), '#d86c3b', [0, 3.65, 0], this.subject);
    sculpture.rotation.x = 0.3;
    this.mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.05, 48), '#354e55', [PAD.x, 0.1, PAD.z]);
    const padRing = this.mesh(new THREE.TorusGeometry(1.9, 0.045, 8, 48), '#e4d9ba', [PAD.x, 0.14, PAD.z]);
    padRing.rotation.x = Math.PI / 2;
    this.box([0.12, 0.02, 1.4], '#e4d9ba', [-0.45, 0.15, PAD.z]);
    this.box([0.12, 0.02, 1.4], '#e4d9ba', [0.45, 0.15, PAD.z]);
    this.box([0.9, 0.02, 0.12], '#e4d9ba', [0, 0.15, PAD.z]);
    const grid = new THREE.GridHelper(80, 40, '#829790', '#94a99b'); grid.position.y = 0.075; grid.layers.set(2); this.scene.add(grid);
    const marker = this.mesh(new THREE.TorusGeometry(1, 0.055, 8, 40), '#e6b95c', [8, 4, 3]);
    marker.layers.set(2); this.label('02  ·  TRANSLATE', [8, 6, 3]);
    this.label('HOME', [0, 1.2, 11]); this.label('PHOTO SUBJECT', [0, 6.2, -13]);
    for (const [x, z] of [[-4, -5], [5, -22], [20, 5]]) {
      this.box([2.3, 0.15, 0.65], '#ad8660', [x, 0.8, z]);
      this.box([0.15, 0.8, 0.5], '#626b61', [x - 0.8, 0.4, z]);
      this.box([0.15, 0.8, 0.5], '#626b61', [x + 0.8, 0.4, z]);
    }
  }
  private buildDrone() {
    this.drone.add(this.body); this.scene.add(this.drone);
    this.box([0.7, 0.24, 0.95], '#e3e8e7', [0, 0, 0], this.body);
    this.box([0.35, 0.1, 0.18], '#e69f4e', [0, 0.05, -0.5], this.body);
    for (const [x, z] of [[-0.65, -0.6], [0.65, -0.6], [-0.65, 0.6], [0.65, 0.6]]) {
      const arm = this.box([0.9, 0.12, 0.12], '#414c4b', [x / 2, 0, z / 2], this.body);
      arm.rotation.y = x * z > 0 ? -Math.PI / 4 : Math.PI / 4;
      this.mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.18, 12), '#37433f', [x, 0.1, z], this.body);
      const blade = this.box([0.78, 0.025, 0.07], '#334141', [x, 0.21, z], this.body); this.propellers.push(blade);
      this.box([0.06, 0.2, 0.07], '#8c9c98', [x * 0.65, -0.16, z * 0.65], this.body);
    }
    this.mesh(new THREE.SphereGeometry(0.12, 12, 8), '#213a44', [0, -0.17, -0.43], this.body);
    this.drone.traverse((object) => object.layers.set(1));
  }
  setQuality(low: boolean): void {
    this.pixelRatio = low ? 1 : Math.min(devicePixelRatio, 2); this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = !low;
  }
  resetTrail(): void { this.trailPoints = []; this.trail.geometry.dispose(); this.trail.geometry = new THREE.BufferGeometry(); }
  update(s: DroneState, time: number): void {
    this.drone.position.set(s.x, s.y, s.z); this.drone.rotation.y = -s.heading;
    this.body.rotation.set(s.pitch, 0, s.bank);
    this.propellers.forEach((p, i) => p.rotation.y = time * (i % 2 ? -0.06 : 0.06));
    this.camera.position.set(s.x + Math.sin(s.heading) * 0.55, s.y - 0.12, s.z - Math.cos(s.heading) * 0.55);
    this.camera.rotation.set(THREE.MathUtils.degToRad(s.gimbal), -s.heading, 0, 'YXZ');
    this.camera.updateMatrixWorld();
    this.aidCamera.position.copy(this.camera.position); this.aidCamera.quaternion.copy(this.camera.quaternion);
    this.aidCamera.updateMatrixWorld(); this.frustum.update();
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    this.ray.set(this.camera.position, direction); this.ray.far = 25;
    const hit = this.ray.intersectObjects(this.scene.children, true)[0];
    const end = this.camera.position.clone().addScaledVector(direction, hit?.distance ?? 14);
    this.direction.geometry.setFromPoints([this.camera.position, end]);
    if (s.mode !== 'grounded' && (this.trailPoints.length === 0 || this.trailPoints.at(-1)!.distanceTo(this.drone.position) > 0.3)) {
      this.trailPoints.push(this.drone.position.clone()); if (this.trailPoints.length > 400) this.trailPoints.shift();
      this.trail.geometry.dispose(); this.trail.geometry = new THREE.BufferGeometry().setFromPoints(this.trailPoints);
    }
    if (this.follow) {
      this.observer.position.lerp(new THREE.Vector3(s.x - Math.sin(s.heading) * 13 + 5, s.y + 10, s.z + Math.cos(s.heading) * 13), 0.04);
      this.observer.lookAt(s.x, s.y, s.z);
    } else { this.observer.position.set(27, 24, 34); this.observer.lookAt(0, 1, -5); }
    this.frustum.visible = this.direction.visible = this.trail.visible = this.aids;
    if (this.aids) this.observer.layers.enable(2); else this.observer.layers.disable(2);
  }
  private renderView(view: HTMLElement, camera: THREE.PerspectiveCamera): void {
    if (!view.offsetWidth || !view.offsetHeight) return;
    const rect = view.getBoundingClientRect(), stage = this.stage.getBoundingClientRect();
    const x = rect.left - stage.left, y = stage.bottom - rect.bottom;
    this.renderer.setViewport(x, y, rect.width, rect.height); this.renderer.setScissor(x, y, rect.width, rect.height);
    camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix();
    this.renderer.render(this.scene, camera);
  }
  render(): void {
    const width = this.stage.clientWidth, height = this.stage.clientHeight;
    if (width !== this.lastWidth || height !== this.lastHeight) {
      this.renderer.setSize(width, height, false); this.lastWidth = width; this.lastHeight = height;
    }
    this.renderer.setScissorTest(false); this.renderer.setClearColor('#15232b'); this.renderer.clear();
    this.renderer.setScissorTest(true);
    this.renderView(this.observerView, this.observer); this.renderView(this.cameraView, this.camera);
  }
  subjectInFrame(): boolean {
    this.camera.updateMatrixWorld();
    const projected = this.target.clone().project(this.camera);
    if (Math.abs(projected.x) > 0.85 || Math.abs(projected.y) > 0.8 || projected.z < -1 || projected.z > 1) return false;
    const delta = this.target.clone().sub(this.camera.position);
    this.ray.set(this.camera.position, delta.clone().normalize()); this.ray.far = delta.length() + 1;
    const hit = this.ray.intersectObjects(this.scene.children, true)[0];
    if (!hit) return false;
    let object: THREE.Object3D | null = hit.object;
    while (object) { if (object === this.subject) return true; object = object.parent; }
    return false;
  }
  async capture(): Promise<Blob> {
    const camera = this.camera.clone(); camera.aspect = 16 / 9; camera.updateProjectionMatrix(); camera.layers.set(0);
    this.renderer.setScissorTest(false); this.renderer.setRenderTarget(this.photoTarget);
    this.renderer.render(this.scene, camera);
    const pixels = new Uint8Array(1280 * 720 * 4);
    this.renderer.readRenderTargetPixels(this.photoTarget, 0, 0, 1280, 720, pixels);
    this.renderer.setRenderTarget(null);
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
    const ctx = canvas.getContext('2d')!, output = ctx.createImageData(1280, 720);
    for (let y = 0; y < 720; y++) output.data.set(pixels.subarray((719 - y) * 1280 * 4, (720 - y) * 1280 * 4), y * 1280 * 4);
    ctx.putImageData(output, 0, 0);
    this.render();
    return new Promise((accept, reject) => canvas.toBlob((blob) => blob ? accept(blob) : reject(new Error('Photo could not be saved')), 'image/png'));
  }
}
