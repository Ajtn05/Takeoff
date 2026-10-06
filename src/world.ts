import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GENERIC_PROFILE, type DroneState } from './simulation';
import { PRACTICE_MAP, translationMarker, type TrainingMap, type PhotoSpot } from './maps';
import { buildCampusBuilding, buildCampusTrees, terrainGeometry, terrainSurface } from './campus';
import { buildingModel } from './landmarks';
import { createDrone } from './drone';
import { campusRoadWidth } from './vegetation';
import { campusMaterial } from './campus-materials';
import { PRACTICE_COURSES } from './practice';

export class TrainingWorld {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(GENERIC_PROFILE.fov, 16 / 9, 0.01, 2500);
  readonly observer = new THREE.PerspectiveCamera(47, 1, 0.1, 3000);
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
  private environment = new THREE.Group();
  private forest?: THREE.Group;
  private courseMarkers = new Map<string, (THREE.Mesh | THREE.Line)[][]>();
  private treesVisible = true;
  private shadowPose: number[] = [];
  private lastShadowUpdate = 0;
  private aidPosition = new THREE.Vector3(NaN, NaN, NaN);
  private aidRotation = new THREE.Quaternion();
  private framingPose: number[] = [];
  private framingResult = false;
  private map = PRACTICE_MAP;
  private spot = PRACTICE_MAP.spots[0];
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private sun = new THREE.DirectionalLight('#fff1d1', 3.2);
  private hemisphere = new THREE.HemisphereLight('#dceaff', '#647147', 1.4);
  private droneMarker = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#b7f7d4', depthTest: false }));
  aids = true;
  follow = false;
  overview = false;

  constructor(private stage: HTMLElement, private observerView: HTMLElement, private cameraView: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Reuse the same shadow map for both views and while the aircraft is stationary.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.className = 'world-canvas';
    this.renderer.domElement.setAttribute('aria-label', 'Practice park rendered from the observer and drone cameras');
    stage.prepend(this.renderer.domElement);
    this.scene.background = new THREE.Color('#bdd8ec');
    this.scene.fog = new THREE.Fog('#c8dfdf', 65, 140);
    this.scene.add(this.hemisphere); this.sun.intensity = 2.2;
    const sun = this.sun;
    sun.position.set(-20, 35, 18); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 40, bottom: -40, near: 1, far: 100 });
    sun.shadow.bias = -0.001; this.scene.add(sun);
    this.scene.add(sun.target);
    this.scene.add(this.environment);
    this.setMap(PRACTICE_MAP, this.spot); this.buildDrone();
    this.observer.layers.enable(1); this.observer.layers.enable(2);
    this.frustum.layers.set(2); this.direction.layers.set(2); this.trail.layers.set(2);
    this.scene.add(this.frustum, this.direction, this.trail);
    const markerCanvas = document.createElement('canvas'); markerCanvas.width = markerCanvas.height = 64;
    const markerContext = markerCanvas.getContext('2d')!;
    markerContext.strokeStyle = '#b7f7d4'; markerContext.lineWidth = 4;
    markerContext.beginPath(); markerContext.arc(32, 32, 20, 0, Math.PI * 2); markerContext.stroke();
    markerContext.fillStyle = '#b7f7d4'; markerContext.beginPath(); markerContext.arc(32, 32, 4, 0, Math.PI * 2); markerContext.fill();
    this.droneMarker.material.map = new THREE.CanvasTexture(markerCanvas); this.droneMarker.material.color.set('#ffffff');
    this.droneMarker.layers.set(2); this.droneMarker.scale.set(0.6, 0.6, 1); this.scene.add(this.droneMarker);
    this.photoTarget.texture.colorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault(); window.dispatchEvent(new CustomEvent('trainer-context-lost'));
    });
  }
  private material(color: string) {
    if (!this.materials.has(color)) this.materials.set(color, campusMaterial(color));
    return this.materials.get(color)!;
  }
  private mesh(geometry: THREE.BufferGeometry, color: string, position: [number, number, number], parent: THREE.Object3D = this.environment): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, this.material(color)); mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  private box(size: [number, number, number], color: string, position: [number, number, number], parent?: THREE.Object3D) {
    return this.mesh(new THREE.BoxGeometry(...size), color, position, parent);
  }
  private label(text: string, position: [number, number, number], width = 5, observerOnly = true) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#12282edd'; ctx.beginPath(); ctx.roundRect(0, 0, 512, 100, 18); ctx.fill();
    ctx.font = 'bold 32px sans-serif'; ctx.fillStyle = '#d8f3e8'; ctx.textAlign = 'center'; ctx.fillText(text, 256, 62);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: !observerOnly }));
    // Labels are annotations, so camera direction and framing rays pass through them.
    sprite.raycast = () => {};
    sprite.position.set(...position); sprite.scale.set(width, width / 5, 1); sprite.layers.set(observerOnly ? 2 : 0); this.environment.add(sprite);
  }
  setMap(map: TrainingMap, spot: PhotoSpot): void {
    const disposedGeometry=new Set<THREE.BufferGeometry>();
    const disposedMaterial=new Set<THREE.Material>();
    this.environment.traverse((object) => {
      if ((object instanceof THREE.Mesh || object instanceof THREE.Line) && !disposedGeometry.has(object.geometry)) {
        object.geometry.dispose();disposedGeometry.add(object.geometry);
      }
      if (object instanceof THREE.InstancedMesh) object.dispose();
      if (object instanceof THREE.Mesh && object.userData.ownedMaterial) {
        if(object.userData.ownedTexture) (object.material as THREE.MeshStandardMaterial).map?.dispose();
        const material=object.material as THREE.Material;
        if (!disposedMaterial.has(material)) { material.dispose(); disposedMaterial.add(material); }
      }
      if (object instanceof THREE.Sprite) { object.material.map?.dispose(); object.material.dispose(); }
      if (object instanceof THREE.Line) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.environment.clear(); this.courseMarkers.clear(); this.forest = undefined; this.subject = new THREE.Group(); this.map = map; this.spot = spot;
    this.framingPose = []; this.shadowPose = []; this.aidPosition.set(NaN, NaN, NaN);
    this.renderer.shadowMap.needsUpdate = true;
    this.target.set(...spot.target); this.resetTrail();
    const campus = map.id === 'ateneo';
    this.renderer.domElement.setAttribute('aria-label', `${map.name} rendered from the observer and drone cameras`);
    this.scene.fog = new THREE.Fog('#bdd8ec', campus ? 900 : 200, campus ? 2800 : 700);
    if (campus) this.buildCampus(); else this.buildPark();
    this.buildPracticeAids();
    const base = map.ground(spot.pad.x, spot.pad.z);
    this.sun.position.set(spot.pad.x - 60, base + 100, spot.pad.z + 45);
    this.sun.target.position.set(spot.pad.x, base, spot.pad.z);
    Object.assign(this.sun.shadow.camera, { left: -100, right: 100, top: 100, bottom: -100, near: 1, far: 250 });
    this.sun.shadow.camera.updateProjectionMatrix();
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
    this.subject.position.set(0, 0, -13); this.environment.add(this.subject);
    this.mesh(new THREE.CylinderGeometry(1.25, 1.4, 0.35, 24), '#d8d3bd', [0, 0.23, 0], this.subject);
    this.mesh(new THREE.CylinderGeometry(0.7, 0.95, 2.3, 12), '#efd5a8', [0, 1.5, 0], this.subject);
    const sculpture = this.mesh(new THREE.TorusKnotGeometry(0.78, 0.22, 64, 8), '#d86c3b', [0, 3.65, 0], this.subject);
    sculpture.rotation.x = 0.3;
    this.box([7, 0.05, 195], '#d9d0b9', [35, 0, 0]);
    this.box([210, 0.05, 6], '#d9d0b9', [0, 0, -35]);
    for (const [x, z, w, h, d] of [[-70, -53, 26, 12, 18], [64, -65, 24, 9, 20], [58, 62, 20, 8, 16]]) {
      this.box([w, h, d], '#e9dfcb', [x, h / 2, z]);
      this.box([w + 0.4, 0.2, d + 0.4], '#777d72', [x, h + 0.1, z]);
    }
    const grid = new THREE.GridHelper(240, 60, '#829790', '#94a99b'); grid.position.y = 0.075; grid.layers.set(2); this.environment.add(grid);
    for (const [x, z] of [[-4, -5], [5, -22], [20, 5]]) {
      this.box([2.3, 0.15, 0.65], '#ad8660', [x, 0.8, z]);
      this.box([0.15, 0.8, 0.5], '#626b61', [x - 0.8, 0.4, z]);
      this.box([0.15, 0.8, 0.5], '#626b61', [x + 0.8, 0.4, z]);
    }
    this.buildCourses();
    this.batchStaticMeshes(this.environment); this.batchStaticMeshes(this.subject);
  }
  private buildCourses() {
    for (const course of PRACTICE_COURSES) {
      const markers: (THREE.Mesh | THREE.Line)[][] = course.gates.map(() => []);
      this.courseMarkers.set(course.id, markers);
      for (const part of course.boxes) {
        const mesh = this.box(part.size, part.accent ? course.color : '#728087', part.center);
        mesh.rotation.y = -part.heading;
        if (part.accent && part.gate !== undefined) { mesh.userData.noBatch = true; markers[part.gate].push(mesh); }
      }
      course.gates.forEach((gate, i) => {
        const [x, y, z] = gate.center;
        if (gate.kind === 'hoop') {
          const hoop = this.mesh(new THREE.TorusGeometry(gate.radius!, gate.tube!, 10, 96), course.color, gate.center);
          hoop.rotation.y = -gate.heading; hoop.userData.noBatch = true; markers[i].push(hoop);
        } else if (gate.kind === 'passage') {
          const w = gate.width / 2, h = gate.height / 2, c = Math.cos(gate.heading), s = Math.sin(gate.heading);
          const points = [[-w, -h], [w, -h], [w, h], [-w, h], [-w, -h]]
            .map(([right, up]) => new THREE.Vector3(x + right * c, y + up, z + right * s));
          const outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: course.color }));
          outline.layers.set(2); this.environment.add(outline); markers[i].push(outline);
        }
        // Gate numbers remain visible from the drone camera and with observer aids off.
        const front = gate.kind === 'gap' ? 0.48 : 0;
        this.label(String(i + 1).padStart(2, '0'), [x - Math.sin(gate.heading) * front,
          gate.kind === 'passage' ? y + 0.65 : y + gate.height / 2 + 0.65, z + Math.cos(gate.heading) * front], 1.8, false);
      });
      const points = course.path ? course.path.map(point => new THREE.Vector3(...point))
        : [new THREE.Vector3(course.pad.x, 3.065, course.pad.z), ...course.gates.map(gate => new THREE.Vector3(...gate.center))];
      const route = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({ color: course.color, dashSize: 0.7, gapSize: 0.65, transparent: true, opacity: 0.65 }));
      route.computeLineDistances(); route.layers.set(2); this.environment.add(route);
      if (course.id !== this.spot.courseId) this.label(course.name.toUpperCase(), [course.pad.x, 1, course.pad.z + 3], 8);
      const start = this.mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.025, 32), course.color, [course.pad.x, 0.005, course.pad.z]);
      start.castShadow = false;
    }
    this.setCourseProgress(0);
  }
  setCourseProgress(next: number): void {
    for (const course of PRACTICE_COURSES) this.courseMarkers.get(course.id)?.forEach((markers, i) => {
      const selected = course.id === this.spot.courseId;
      const color = selected && i < next ? '#75c69b' : selected && i === next ? '#ffe6a0' : course.color;
      markers.forEach(marker => {
        if (marker instanceof THREE.Mesh) marker.material = this.material(color);
        else (marker.material as THREE.LineBasicMaterial).color.set(color);
      });
    });
  }
  private buildPracticeAids() {
    const { x, z } = this.spot.pad;
    const base = this.map.ground(x, z);
    if (this.map.terrain) {
      const point = (radius: number, angle: number): [number, number] => [x + Math.sin(angle) * radius, z + Math.cos(angle) * radius];
      const circle = Array.from({ length: 48 }, (_, i) => point(2.3, i * Math.PI / 24));
      this.mesh(terrainSurface(circle, this.map, 0.004), '#354e55', [0, 0, 0]).castShadow = false;
      const rings = Array.from({ length: 48 }, (_, i) => terrainSurface([
        point(1.88, i * Math.PI / 24), point(1.92, i * Math.PI / 24),
        point(1.92, (i + 1) * Math.PI / 24), point(1.88, (i + 1) * Math.PI / 24),
      ], this.map, 0.006));
      this.mesh(mergeGeometries(rings), '#e4d9ba', [0, 0, 0]).castShadow = false; rings.forEach((g) => g.dispose());
      for (const [cx, width, depth] of [[x - 0.35, 0.08, 1.1], [x + 0.35, 0.08, 1.1], [x, 0.7, 0.08]]) {
        this.mesh(terrainSurface([[cx - width / 2, z - depth / 2], [cx + width / 2, z - depth / 2], [cx + width / 2, z + depth / 2], [cx - width / 2, z + depth / 2]], this.map, 0.006), '#e4d9ba', [0, 0, 0]).castShadow = false;
      }
    } else {
      this.mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.005, 48), '#354e55', [x, base, z]);
      const ring = this.mesh(new THREE.TorusGeometry(1.9, 0.006, 8, 48), '#e4d9ba', [x, base + 0.005, z]); ring.rotation.x = Math.PI / 2;
      this.box([0.08, 0.004, 1.1], '#e4d9ba', [x - 0.35, base + 0.005, z]);
      this.box([0.08, 0.004, 1.1], '#e4d9ba', [x + 0.35, base + 0.005, z]);
      this.box([0.7, 0.004, 0.08], '#e4d9ba', [x, base + 0.005, z]);
    }
    if (!this.spot.courseId) {
      const markerPosition = translationMarker(this.spot, this.map.ground);
      const marker = this.mesh(new THREE.TorusGeometry(1, 0.055, 8, 40), '#e6b95c', markerPosition);
      marker.layers.set(2); this.label('02  ·  TRANSLATE', [markerPosition[0], markerPosition[1] + 2, markerPosition[2]]);
    }
    if (!this.spot.courseId) this.label('HOME', [x, base + 1.2, z + 2]);
    if (this.map.id === 'park') this.label('PHOTO SUBJECT', [0, 6.2, -13]);
    const b = this.map.bounds;
    const points = (b.footprint ?? [[b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ]])
      .map(([px, pz]) => new THREE.Vector3(px, this.map.ground(px, pz) + 0.12, pz)); points.push(points[0].clone());
    const outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#e8c783' }));
    outline.layers.set(2); this.environment.add(outline);
  }
  private buildCampus() {
    const data = this.map.data!;
    const ground = this.mesh(terrainGeometry(this.map), '#ffffff', [0, 0, 0]); ground.castShadow = false;
    ground.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }); ground.userData.ownedMaterial = ground.userData.noBatch = true;
    const roads: THREE.BufferGeometry[] = [], paths: THREE.BufferGeometry[] = [];
    for (const feature of data.features) {
      if (feature.kind === 'road') {
        const footpath = ['footway', 'path', 'steps', 'pedestrian'].includes(feature.type!);
        const width = campusRoadWidth(feature.type);
        for (let i = 1; i < feature.points.length; i++) {
          const [ax, az] = feature.points[i - 1], [bx, bz] = feature.points[i];
          const length = Math.hypot(bx - ax, bz - az); if (length < 0.1) continue;
          const nx = (bz - az) / length * width / 2, nz = -(bx - ax) / length * width / 2;
          const geometry = terrainSurface([[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]], this.map, footpath ? 0.06 : 0.04);
          (footpath ? paths : roads).push(geometry);
        }
        continue;
      }
      if (feature.kind !== 'building') {
        const geometry = terrainSurface(feature.points, this.map, 0.02);
        const mesh = this.mesh(geometry, feature.kind === 'pitch' ? '#729f77' : '#699277', [0, 0.01, 0]); mesh.castShadow = false;
        continue;
      }
      const selected = feature.id === this.spot.featureId;
      const parent = selected ? this.subject : this.environment;
      if (selected) this.environment.add(this.subject);
      buildCampusBuilding(feature, this.map, parent, (geometry, color, position, group) => this.mesh(geometry, color, position, group));
    }
    for (const [geometries, color] of [[roads, '#777c75'], [paths, '#c8c1ac']] as const) {
      if (geometries.length) { const merged = mergeGeometries(geometries); const mesh = this.mesh(merged, color, [0, 0, 0]); mesh.castShadow = false; }
      geometries.forEach((geometry) => geometry.dispose());
    }
    this.forest = buildCampusTrees(this.map.trees!,this.environment,color=>this.material(color));
    this.forest.visible = this.treesVisible;
    for (const spot of this.map.spots) {
      const feature = data.features.find((f) => f.id === spot.featureId)!;
      this.label(spot.name, [spot.target[0], this.map.ground(spot.target[0], spot.target[2]) + buildingModel(feature.id, feature.height!).height + 6, spot.target[2]], 20);
    }
    this.batchStaticMeshes(this.environment); this.batchStaticMeshes(this.subject);
  }
  private batchStaticMeshes(group: THREE.Group) {
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const object of [...group.children]) {
      if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || object.userData.noBatch || object.userData.ownedMaterial || Array.isArray(object.material)) continue;
      object.updateMatrix(); const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone(); geometry.applyMatrix4(object.matrix);
      const geometries = batches.get(object.material) ?? []; geometries.push(geometry); batches.set(object.material, geometries);
      object.geometry.dispose(); group.remove(object);
    }
    for (const [material, geometries] of batches) {
      const geometry = mergeGeometries(geometries); geometries.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
    }
  }
  private buildDrone() {
    const drone = createDrone(); this.body = drone.body; this.propellers = drone.propellers;
    this.drone.add(this.body); this.scene.add(this.drone); this.drone.layers.set(1);
  }
  setQuality(low: boolean): void {
    this.pixelRatio = low ? 1 : Math.min(devicePixelRatio, 2); this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = !low;
    this.renderer.shadowMap.needsUpdate = true;
  }
  setTreesVisible(visible: boolean): void {
    this.treesVisible = visible;
    if (this.forest) this.forest.visible = visible;
    this.renderer.shadowMap.needsUpdate = true;
    this.framingPose = []; this.aidPosition.set(NaN, NaN, NaN);
  }
  resetTrail(): void { this.trailPoints = []; this.trail.geometry.dispose(); this.trail.geometry = new THREE.BufferGeometry(); }
  update(s: DroneState, time: number): void {
    this.drone.position.set(s.x, s.y, s.z); this.drone.rotation.y = -s.heading;
    this.body.rotation.set(s.pitch, 0, s.bank);
    this.propellers.forEach((p, i) => p.rotation.y = time * (i % 2 ? -0.06 : 0.06));
    this.camera.position.set(s.x + Math.sin(s.heading) * 0.105, s.y - 0.025, s.z - Math.cos(s.heading) * 0.105);
    this.camera.rotation.set(THREE.MathUtils.degToRad(s.gimbal), -s.heading, 0, 'YXZ');
    this.camera.updateMatrixWorld();
    this.droneMarker.position.set(s.x, s.y + 0.8, s.z);
    const ground = this.map.ground(s.x, s.z);
    this.sun.position.set(s.x - 60, ground + 100, s.z + 45); this.sun.target.position.set(s.x, ground, s.z);
    const shadowPose = [s.x, s.y, s.z, s.heading, s.pitch, s.bank];
    if (shadowPose.some((value, i) => value !== this.shadowPose[i]) && (time === 0 || time - this.lastShadowUpdate >= 100)) {
      this.renderer.shadowMap.needsUpdate = true; this.shadowPose = shadowPose; this.lastShadowUpdate = time;
    }
    if (this.aids && (!this.aidPosition.equals(this.camera.position) || !this.aidRotation.equals(this.camera.quaternion))) {
      this.aidPosition.copy(this.camera.position); this.aidRotation.copy(this.camera.quaternion);
      this.aidCamera.position.copy(this.camera.position); this.aidCamera.quaternion.copy(this.camera.quaternion);
      this.aidCamera.updateMatrixWorld(); this.frustum.update();
      const direction = this.camera.getWorldDirection(new THREE.Vector3());
      this.ray.set(this.camera.position, direction); this.ray.far = 25;
      const hit = this.ray.intersectObjects(this.scene.children, true)[0];
      const end = this.camera.position.clone().addScaledVector(direction, hit?.distance ?? 14);
      this.direction.geometry.setFromPoints([this.camera.position, end]);
    }
    if (s.mode !== 'grounded' && (this.trailPoints.length === 0 || this.trailPoints.at(-1)!.distanceTo(this.drone.position) > 0.3)) {
      this.trailPoints.push(this.drone.position.clone()); if (this.trailPoints.length > 400) this.trailPoints.shift();
      this.trail.geometry.dispose(); this.trail.geometry = new THREE.BufferGeometry().setFromPoints(this.trailPoints);
    }
    if (this.follow) {
      this.observer.position.lerp(new THREE.Vector3(s.x - Math.sin(s.heading) * 9 + 3, s.y + 6, s.z + Math.cos(s.heading) * 9), 0.06);
      this.observer.lookAt(s.x, s.y, s.z);
    } else if (this.overview) {
      const b = this.map.bounds;
      const distance = Math.max(b.maxZ - b.minZ, (b.maxX - b.minX) / this.observer.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(this.observer.fov / 2))) * 1.12;
      this.observer.position.set((b.minX + b.maxX) / 2, distance, (b.minZ + b.maxZ) / 2 + 0.01);
      this.observer.position.y += this.map.ground(0, 0); this.observer.lookAt((b.minX + b.maxX) / 2, this.map.ground(0, 0), (b.minZ + b.maxZ) / 2);
    } else if (this.map.id === 'ateneo') {
      this.observer.position.set(this.spot.pad.x + 80, this.map.ground(this.spot.pad.x, this.spot.pad.z) + 90, this.spot.pad.z + 100);
      this.observer.lookAt(...this.spot.target);
    } else if (this.spot.courseId) {
      this.observer.position.set(this.spot.pad.x + 18, 20, this.spot.pad.z + 22); this.observer.lookAt(...this.spot.target);
    } else { this.observer.position.set(27, 24, 34); this.observer.lookAt(0, 1, -5); }
    this.frustum.visible = this.direction.visible = this.trail.visible = this.aids;
    this.droneMarker.visible = this.aids && s.mode !== 'grounded';
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
    this.renderer.setScissorTest(false); this.renderer.setClearColor('#181c20'); this.renderer.clear();
    this.renderer.setScissorTest(true);
    const fog = this.scene.fog;
    if (this.overview) this.scene.fog = null;
    this.renderView(this.observerView, this.observer);
    this.scene.fog = fog; this.renderView(this.cameraView, this.camera);
  }
  subjectInFrame(): boolean {
    const pose = [...this.camera.position.toArray(), ...this.camera.quaternion.toArray(), this.camera.aspect];
    if (pose.every((value, i) => value === this.framingPose[i])) return this.framingResult;
    this.framingPose = pose;
    this.framingResult = this.checkSubjectInFrame();
    return this.framingResult;
  }
  private checkSubjectInFrame(): boolean {
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
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, camera);
    const pixels = new Uint8Array(1280 * 720 * 4);
    // Queue the GPU copy, then restore the screen target before yielding to animation frames.
    const readback = this.renderer.readRenderTargetPixelsAsync(this.photoTarget, 0, 0, 1280, 720, pixels);
    this.renderer.setRenderTarget(null);
    await readback;
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
    const ctx = canvas.getContext('2d')!, output = ctx.createImageData(1280, 720);
    for (let y = 0; y < 720; y++) output.data.set(pixels.subarray((719 - y) * 1280 * 4, (720 - y) * 1280 * 4), y * 1280 * 4);
    ctx.putImageData(output, 0, 0);
    return new Promise((accept, reject) => canvas.toBlob((blob) => blob ? accept(blob) : reject(new Error('Photo could not be saved')), 'image/png'));
  }
}
