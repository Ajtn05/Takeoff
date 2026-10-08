import { renderViewport, resizeRenderer } from './viewport';
import * as THREE from 'three';
import { createDrone } from './drone';
import { gateZ, nextRushGate, type RushGate, type RushRun } from '../game/engine';

export class RushWorld {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(58, 1, 0.1, 320);
  private fpv = new THREE.PerspectiveCamera(64, 16 / 9, 0.01, 320);
  private renderer: THREE.WebGLRenderer;
  private drone = new THREE.Group();
  private body: THREE.Group;
  private propellers: THREE.Mesh[];
  private gates = new Map<number, THREE.Group>();
  private scenery: { group: THREE.Group; z: number }[] = [];
  private stripes: THREE.Mesh[] = [];
  private flightLine: THREE.Line;
  private wall = new THREE.MeshStandardMaterial({
    color: '#193942',
    transparent: true,
    opacity: 0.7,
    roughness: 0.85,
  });
  private architecture = new THREE.MeshStandardMaterial({
    color: '#254b57',
    roughness: 0.8,
    metalness: 0.15,
  });
  private accent = new THREE.MeshBasicMaterial({ color: '#5aafa0' });
  private initializedCamera = false;

  constructor(
    private stage: HTMLElement,
    private inset: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Flight Rush endless course · third-person follow drone view',
    );
    stage.prepend(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('rush-context-lost'));
    });
    this.scene.background = new THREE.Color('#122b39');
    this.scene.fog = new THREE.Fog('#122b39', 55, 225);
    this.scene.add(new THREE.HemisphereLight('#b9eee5', '#203f53', 2.4));
    const sun = new THREE.DirectionalLight('#ffe2b5', 2.8);
    sun.position.set(-20, 45, 15);
    this.scene.add(sun);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 340),
      new THREE.MeshStandardMaterial({ color: '#183c49', roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.03, -125);
    this.scene.add(ground);
    const horizon = new THREE.Mesh(
      new THREE.PlaneGeometry(1000, 1000),
      new THREE.MeshStandardMaterial({ color: '#102733' }),
    );
    horizon.rotation.x = -Math.PI / 2;
    horizon.position.y = -0.12;
    this.scene.add(horizon);
    for (let i = 0; i < 42; i++) {
      const stripe = this.box([0.1, 0.03, 2.6], this.accent, [0, 0, 0]);
      this.stripes.push(stripe);
    }
    for (const x of [-14, 14]) this.box([0.12, 0.12, 330], this.accent, [x, 0.06, -125]);
    for (let i = 0; i < 32; i++) {
      const group = new THREE.Group();
      const side = i % 2 ? 1 : -1;
      const h = 9 + ((i * 17) % 24);
      const x = side * (19 + (i % 3) * 5);
      const z = -i * 11;
      this.box([6, h, 7], this.architecture, [x, h / 2, 0], group);
      this.box([0.07, h * 0.8, 0.1], this.accent, [x - side * 3.02, h / 2, 3.55], group);
      group.position.z = z;
      this.scene.add(group);
      this.scenery.push({ group, z });
    }
    const aircraft = createDrone();
    this.body = aircraft.body;
    this.propellers = aircraft.propellers;
    this.drone.add(this.body);
    this.scene.add(this.drone);
    this.camera.layers.enable(1);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    lineGeometry.setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(2), 1));
    this.flightLine = new THREE.Line(
      lineGeometry,
      new THREE.LineDashedMaterial({
        color: '#bcecaa',
        dashSize: 0.7,
        gapSize: 0.6,
        transparent: true,
        opacity: 0.4,
      }),
    );
    this.scene.add(this.flightLine);
  }
  private box(
    size: [number, number, number],
    material: THREE.Material,
    at: [number, number, number],
    parent: THREE.Object3D = this.scene,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...at);
    parent.add(mesh);
    return mesh;
  }
  private makeGate(gate: RushGate): THREE.Group {
    const group = new THREE.Group();
    const move = gate.maneuver;
    const w = gate.width;
    const h = gate.height;
    const edge = new THREE.MeshBasicMaterial({ color: '#c3f0a6' });
    group.userData.edge = edge;
    const left = move.x - w / 2;
    const right = move.x + w / 2;
    const bottom = move.y - h / 2;
    const top = move.y + h / 2;
    this.box([left + 14, 18, 0.24], this.wall, [(-14 + left) / 2, 9, 0], group);
    this.box([14 - right, 18, 0.24], this.wall, [(14 + right) / 2, 9, 0], group);
    this.box([w, bottom, 0.24], this.wall, [move.x, bottom / 2, 0], group);
    this.box([w, 18 - top, 0.24], this.wall, [move.x, (18 + top) / 2, 0], group);
    for (const y of [bottom, top]) this.box([w + 0.2, 0.12, 0.32], edge, [move.x, y, 0], group);
    for (const x of [left, right]) this.box([0.12, h, 0.32], edge, [x, move.y, 0], group);
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), edge);
    beacon.position.set(move.x, move.y, 0);
    group.add(beacon);
    group.userData.beacon = beacon;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#102934ee';
    ctx.beginPath();
    ctx.roundRect(0, 0, 512, 128, 16);
    ctx.fill();
    ctx.fillStyle = '#d7f1df';
    ctx.font = '600 32px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`${String(gate.id + 1).padStart(2, '0')}  ${move.label.toUpperCase()}`, 256, 54);
    ctx.font = '24px system-ui';
    ctx.fillStyle = '#a8cbc8';
    ctx.fillText(move.key, 256, 98);
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthWrite: false }),
    );
    label.position.set(move.x, top + 1.0, 0.5);
    label.scale.set(7, 1.75, 1);
    group.add(label);
    this.scene.add(group);
    return group;
  }
  resetCamera(): void {
    this.initializedCamera = false;
  }
  update(run: RushRun, dt: number, time: number): void {
    const s = run.drone;
    this.drone.position.set(s.x, s.y, s.z);
    this.drone.rotation.y = -s.heading;
    this.body.rotation.set(s.pitch, 0, s.bank);
    this.propellers.forEach(
      (propeller, i) => (propeller.rotation.y = time * (i % 2 ? -0.06 : 0.06)),
    );
    // Chase position follows the aircraft; the forward view stays on the approaching course during yaw exercises.
    const targetPosition = new THREE.Vector3(s.x * 0.65 + 0.6, Math.max(4.5, s.y + 1.8), s.z + 3.6);
    if (!this.initializedCamera) {
      this.camera.position.copy(targetPosition);
      this.initializedCamera = true;
    } else this.camera.position.lerp(targetPosition, 1 - Math.exp(-6 * dt));
    this.camera.lookAt(s.x * 0.7, s.y + 0.4, s.z - 14);
    this.fpv.position.set(
      s.x + Math.sin(s.heading) * 0.105,
      s.y - 0.025,
      s.z - Math.cos(s.heading) * 0.105,
    );
    this.fpv.rotation.set(THREE.MathUtils.degToRad(s.gimbal), -s.heading, 0, 'YXZ');
    for (const { group, z } of this.scenery)
      group.position.z = ((((run.distance + z + 300) % 352) + 352) % 352) - 300;
    this.stripes.forEach((stripe, i) => (stripe.position.z = ((run.distance + i * 8) % 336) - 300));
    const next = nextRushGate(run);
    const visible = new Set(run.gates.map((gate) => gate.id));
    for (const [id, group] of this.gates) {
      if (visible.has(id)) continue;
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
        if (object instanceof THREE.Sprite) {
          object.material.map?.dispose();
          object.material.dispose();
        }
      });
      (group.userData.edge as THREE.Material).dispose();
      this.scene.remove(group);
      this.gates.delete(id);
    }
    for (const gate of run.gates) {
      let group = this.gates.get(gate.id);
      if (!group) {
        group = this.makeGate(gate);
        this.gates.set(gate.id, group);
      }
      group.position.z = gateZ(run, gate);
      const color =
        gate.result === 'clear'
          ? '#92ebaf'
          : gate.result === 'miss'
            ? '#ef8c70'
            : next?.id === gate.id
              ? '#c3f0a6'
              : '#498d8b';
      (group.userData.edge as THREE.MeshBasicMaterial).color.set(color);
      const beacon = group.userData.beacon as THREE.Mesh;
      beacon.rotation.y = time * 0.001;
      beacon.rotation.z = Math.PI / 4;
      beacon.visible = !gate.result && (gate.maneuver.photo || next?.id === gate.id);
    }
    this.flightLine.visible = !!next && run.phase !== 'over';
    if (next) {
      const points = this.flightLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      points.setXYZ(0, s.x, s.y, s.z - 0.4);
      points.setXYZ(1, next.maneuver.x, next.maneuver.y, gateZ(run, next));
      points.needsUpdate = true;
      this.flightLine.geometry.computeBoundingSphere();
      const distances = this.flightLine.geometry.getAttribute(
        'lineDistance',
      ) as THREE.BufferAttribute;
      distances.setX(0, 0);
      distances.setX(
        1,
        Math.hypot(next.maneuver.x - s.x, next.maneuver.y - s.y, gateZ(run, next) - s.z + 0.4),
      );
      distances.needsUpdate = true;
    }
  }
  render(): void {
    resizeRenderer(this.renderer, this.stage);
    this.renderer.setScissorTest(false);
    renderViewport(this.renderer, this.scene, this.camera, this.stage, this.stage);
    if (!this.inset.hidden) {
      this.renderer.setScissorTest(true);
      renderViewport(this.renderer, this.scene, this.fpv, this.inset, this.stage);
    }
  }
}
