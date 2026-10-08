import * as THREE from 'three';
import { buildingModel, footprintCenter } from '../maps/landmarks';
import type { CampusFeature, TrainingMap } from '../maps/maps';
import { pointInPolygon } from '../flight/simulation';

type MeshBuilder = (
  geometry: THREE.BufferGeometry,
  color: string,
  position: [number, number, number],
  parent?: THREE.Object3D,
) => THREE.Mesh;

export function buildCampusBuilding(
  feature: CampusFeature,
  map: TrainingMap,
  parent: THREE.Object3D,
  mesh: MeshBuilder,
): void {
  const model = buildingModel(feature.id, feature.height!);
  const center = footprintCenter(feature.points);
  const base = map.ground(...center);
  const lowest = Math.min(base, ...feature.points.map(([x, z]) => map.ground(x, z))) - 0.4;
  const shape = new THREE.Shape(feature.points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const walls = new THREE.ExtrudeGeometry(shape, {
    depth: base + model.wallHeight - lowest,
    bevelEnabled: false,
  });
  walls.rotateX(-Math.PI / 2);
  mesh(walls, model.color, [0, lowest, 0], parent);
  const box = (size: [number, number, number], color: string, p: [number, number, number]) =>
    mesh(new THREE.BoxGeometry(...size), color, p, parent);

  if (model.kind === 'gesu') {
    // Tetrahedral roof: same fan and vertical profile as the collision surface.
    const positions: number[] = [];
    const peak = model.height - 7;
    for (let i = 0; i < feature.points.length; i++) {
      const a = feature.points[i];
      const b = feature.points[(i + 1) % feature.points.length];
      positions.push(
        a[0],
        base + model.wallHeight,
        a[1],
        center[0],
        base + peak,
        center[1],
        b[0],
        base + model.wallHeight,
        b[1],
      );
    }
    const roof = new THREE.BufferGeometry();
    roof.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    roof.computeVertexNormals();
    const shell = mesh(roof, model.roofColor, [0, 0, 0], parent);
    shell.material = (shell.material as THREE.MeshStandardMaterial).clone();
    (shell.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    shell.userData.ownedMaterial = true;
    // Small glass cupola and its cross, with estimated proportions from exterior photographs.
    const cupola = mesh(
      new THREE.ConeGeometry(2.5, 5, 3),
      '#789e9e',
      [center[0], base + peak + 2.5, center[1]],
      parent,
    );
    cupola.rotation.y = Math.PI;
    box([0.16, 2.3, 0.16], '#e8e9df', [center[0], base + 26, center[1]]);
    box([1.4, 0.14, 0.14], '#e8e9df', [center[0], base + 26.3, center[1]]);
    // Open entrance colonnade along the wide southern edge.
    const a = feature.points[1];
    const b = feature.points[2];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      box([0.4, 4.6, 0.4], '#e5e6dc', [
        a[0] + (b[0] - a[0]) * t,
        base + 2.3,
        a[1] + (b[1] - a[1]) * t + 0.3,
      ]);
    }
    // Front glazing is a triangle, rather than horizontal office-window bands.
    const glazing = new THREE.BufferGeometry();
    glazing.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          a[0],
          base + 1,
          a[1] + 0.2,
          b[0],
          base + 1,
          b[1] + 0.2,
          center[0],
          base + peak - 1,
          center[1] + 0.2,
        ],
        3,
      ),
    );
    glazing.computeVertexNormals();
    const glass = mesh(glazing, '#729798', [0, 0, 0], parent);
    glass.material = (glass.material as THREE.MeshStandardMaterial).clone();
    (glass.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    glass.userData.ownedMaterial = true;
    return;
  }

  if (model.kind === 'gym' && feature.points.length === 4) {
    const [a, b, c, d] = feature.points;
    const positions: number[] = [];
    const uv: number[] = [];
    const point = (u: number, v: number): [number, number, number] => [
      (a[0] + (b[0] - a[0]) * u) * (1 - v) + (d[0] + (c[0] - d[0]) * u) * v,
      base + model.wallHeight + (model.height - model.wallHeight) * Math.sin(Math.PI * u),
      (a[1] + (b[1] - a[1]) * u) * (1 - v) + (d[1] + (c[1] - d[1]) * u) * v,
    ];
    for (let i = 0; i < 32; i++) {
      const u = i / 32;
      const next = (i + 1) / 32;
      for (const [s, v] of [
        [u, 0],
        [u, 1],
        [next, 0],
        [next, 0],
        [u, 1],
        [next, 1],
      ]) {
        positions.push(...point(s, v));
        uv.push(s, v);
      }
      for (const v of [0, 1]) {
        const left = point(u, v);
        const right = point(next, v);
        positions.push(...left, right[0], base + model.wallHeight, right[2], ...right);
        uv.push(u, v, next, v, next, v);
        positions.push(
          ...left,
          left[0],
          base + model.wallHeight,
          left[2],
          right[0],
          base + model.wallHeight,
          right[2],
        );
        uv.push(u, v, u, v, next, v);
      }
    }
    const roof = new THREE.BufferGeometry();
    roof.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    roof.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    roof.computeVertexNormals();
    const shell = mesh(roof, model.roofColor, [0, 0, 0], parent);
    shell.material = (shell.material as THREE.MeshStandardMaterial).clone();
    (shell.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    shell.userData.ownedMaterial = true;
  } else {
    const roof = new THREE.ShapeGeometry(shape);
    roof.rotateX(-Math.PI / 2);
    mesh(roof, model.roofColor, [0, base + model.height + 0.04, 0], parent);
  }
  // Facades follow the mapped edges; bays, piers and bands use physical meter dimensions.
  const academic = ['science', 'delaCosta', 'leong', 'jgsom'].includes(model.kind);
  const cream = '#ece8db';
  const glass = academic ? '#365c70' : '#486873';
  const edges = feature.points.map((a, i) => ({
    a,
    b: feature.points[(i + 1) % feature.points.length],
  }));
  const longest = edges.reduce((best, e) =>
    Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) >
    Math.hypot(best.b[0] - best.a[0], best.b[1] - best.a[1])
      ? e
      : best,
  );
  for (let i = 0; i < feature.points.length; i++) {
    const [ax, az] = feature.points[i];
    const [bx, bz] = feature.points[(i + 1) % feature.points.length];
    const length = Math.hypot(bx - ax, bz - az);
    const angle = -Math.atan2(bz - az, bx - ax);
    if (length < 1.5) continue;
    let nx = (bz - az) / length;
    let nz = -(bx - ax) / length;
    if (pointInPolygon((ax + bx) / 2 + nx * 0.3, (az + bz) / 2 + nz * 0.3, feature.points)) {
      nx = -nx;
      nz = -nz;
    }
    const along = (distance: number, y: number, offset = 0.06): [number, number, number] => [
      ax + ((bx - ax) * distance) / length + nx * offset,
      y,
      az + ((bz - az) * distance) / length + nz * offset,
    ];
    const facade = (
      size: [number, number, number],
      color: string,
      distance: number,
      y: number,
      offset = 0.06,
    ) => {
      const panel = box(size, color, along(distance, y, offset));
      panel.rotation.y = angle;
      return panel;
    };
    const floorHeight = model.wallHeight / model.floors;
    if (['arete', 'library'].includes(model.kind)) {
      for (let floor = 0; floor < model.floors; floor++)
        facade(
          [length - 0.8, Math.min(1.8, floorHeight * 0.48), 0.08],
          glass,
          length / 2,
          base + floor * floorHeight + floorHeight * 0.58,
        );
      const spacing = model.kind === 'arete' ? 1.2 : 3.8;
      for (let d = 1; d < length - 0.5; d += spacing)
        facade(
          [
            model.kind === 'arete' ? 0.16 : 0.28,
            model.wallHeight - 0.5,
            model.kind === 'arete' ? 0.8 : 0.28,
          ],
          model.kind === 'arete' ? '#b6b1a6' : '#9c6852',
          d,
          base + model.wallHeight / 2,
        );
    } else {
      const spacing =
        model.kind === 'jgsom' ? 5.6 : model.kind === 'residence' ? 3.2 : academic ? 4.2 : 4.8;
      const bays = Math.max(1, Math.floor(length / spacing));
      const step = (length - 1.1) / bays;
      for (let bay = 0; bay < bays; bay++) {
        const d = 0.55 + (bay + 0.5) * step;
        const width = Math.max(0.35, step * (model.kind === 'jgsom' ? 0.7 : 0.76));
        for (let floor = 0; floor < model.floors; floor++) {
          const y = base + floor * floorHeight + floorHeight * 0.59;
          const h = floorHeight * (model.kind === 'jgsom' ? 0.72 : 0.48);
          facade([width, h, 0.08], bay % 3 === 0 ? '#284859' : glass, d, y);
          facade([0.055, h, 0.1], cream, d, y, 0.1);
          facade([width, 0.055, 0.1], cream, d, y - h / 2, 0.1);
        }
      }
      if (model.kind === 'jgsom') {
        for (let d = 0.55; d < length; d += step)
          facade(
            [Math.min(1.3, step * 0.24), model.height - 0.25, 0.38],
            model.color,
            d,
            base + model.height / 2,
            0.1,
          );
      }
      if (['science', 'delaCosta', 'leong', 'residence'].includes(model.kind)) {
        for (let floor = 1; floor < model.floors; floor++)
          facade(
            [length, model.kind === 'delaCosta' ? 0.9 : model.kind === 'leong' ? 0.72 : 0.36, 0.3],
            cream,
            length / 2,
            base + floor * floorHeight - 0.3,
            0.1,
          );
      }
    }
    if (model.kind === 'library') {
      for (let floor = 1; floor <= model.floors; floor++) {
        const fascia = box([length, 0.32, 0.32], '#b48c72', [
          (ax + bx) / 2,
          base + floor * floorHeight,
          (az + bz) / 2,
        ]);
        fascia.rotation.y = angle;
      }
    }
    facade(
      [length, academic ? 0.32 : 0.18, 0.24],
      academic ? cream : '#d5cdb7',
      length / 2,
      base + model.height - 0.12,
      0.06,
    );
    if (academic && feature.points[i] === longest.a && length > 15) {
      const d = model.kind === 'delaCosta' ? length * 0.22 : length * 0.18;
      if (['delaCosta', 'leong'].includes(model.kind)) {
        const width = model.kind === 'leong' ? 5 : 4.8;
        facade([width, model.height - 0.45, 0.32], model.color, d, base + model.height / 2, 0.18);
        facade(
          [model.kind === 'leong' ? 3.8 : 1.15, model.height - 2, 0.08],
          '#47778a',
          d,
          base + model.height / 2 + 0.2,
          0.38,
        );
        for (let floor = 1; floor < model.floors; floor++)
          facade([width - 0.9, 0.07, 0.09], cream, d, base + floor * floorHeight, 0.44);
      }
      // An entrance lintel stays close to the footprint and provides a recognizable hall name.
      const signWidth = Math.min(model.kind === 'jgsom' ? 9 : 12, length * 0.42);
      const signY = base + floorHeight - 0.65;
      facade([signWidth, 0.8, 0.3], cream, length / 2, signY, 0.17);
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 96;
        const context = canvas.getContext('2d')!;
        context.fillStyle = cream;
        context.fillRect(0, 0, 1024, 96);
        context.fillStyle = '#41443f';
        context.font = '600 38px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(
          model.kind === 'delaCosta'
            ? 'HORACIO DE LA COSTA HALL'
            : model.kind === 'jgsom'
              ? 'JOHN GOKONGWEI SCHOOL OF MANAGEMENT'
              : model.kind === 'leong'
                ? 'RICARDO & ROSITA LEONG HALL'
                : 'SCIENCE EDUCATION COMPLEX',
          512,
          48,
          980,
        );
        const sign = mesh(
          new THREE.PlaneGeometry(signWidth, 0.8),
          cream,
          along(length / 2, signY, 0.34),
          parent,
        );
        sign.rotation.y = Math.atan2(nx, nz);
        sign.material = new THREE.MeshStandardMaterial({
          map: new THREE.CanvasTexture(canvas),
          roughness: 0.9,
        });
        sign.userData.ownedMaterial = sign.userData.ownedTexture = true;
      }
    }
  }
}
