import * as THREE from 'three';
import type { TrainingEnvironment } from './training-environment';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PRACTICE_COURSES } from '../maps/practice';
import { translationMarker } from '../maps/maps';
import { terrainSurface } from './terrain';

export function buildCourses(environment: TrainingEnvironment): void {
  for (const course of PRACTICE_COURSES) {
    const markers: (THREE.Mesh | THREE.Line)[][] = course.gates.map(() => []);
    environment.courseMarkers.set(course.id, markers);
    for (const part of course.boxes) {
      const mesh = environment.box(part.size, part.accent ? course.color : '#728087', part.center);
      mesh.rotation.y = -part.heading;
      if (part.accent && part.gate !== undefined) {
        mesh.userData.noBatch = true;
        markers[part.gate].push(mesh);
      }
    }
    course.gates.forEach((gate, i) => {
      const [x, y, z] = gate.center;
      if (gate.kind === 'hoop') {
        const hoop = environment.mesh(
          new THREE.TorusGeometry(gate.radius!, gate.tube!, 10, 96),
          course.color,
          gate.center,
        );
        hoop.rotation.y = -gate.heading;
        hoop.userData.noBatch = true;
        markers[i].push(hoop);
      } else if (gate.kind === 'passage') {
        const w = gate.width / 2;
        const h = gate.height / 2;
        const c = Math.cos(gate.heading);
        const s = Math.sin(gate.heading);
        const points = [
          [-w, -h],
          [w, -h],
          [w, h],
          [-w, h],
          [-w, -h],
        ].map(([right, up]) => new THREE.Vector3(x + right * c, y + up, z + right * s));
        const outline = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: course.color }),
        );
        outline.layers.set(2);
        environment.group.add(outline);
        markers[i].push(outline);
      }
      // Gate numbers remain visible from the drone camera and with observer aids off.
      const front = gate.kind === 'gap' ? 0.48 : 0;
      environment.label(
        String(i + 1).padStart(2, '0'),
        [
          x - Math.sin(gate.heading) * front,
          gate.kind === 'passage' ? y + 0.65 : y + gate.height / 2 + 0.65,
          z + Math.cos(gate.heading) * front,
        ],
        1.8,
        false,
      );
    });
    const points = course.path
      ? course.path.map((point) => new THREE.Vector3(...point))
      : [
          new THREE.Vector3(course.pad.x, 3.065, course.pad.z),
          ...course.gates.map((gate) => new THREE.Vector3(...gate.center)),
        ];
    const route = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineDashedMaterial({
        color: course.color,
        dashSize: 0.7,
        gapSize: 0.65,
        transparent: true,
        opacity: 0.65,
      }),
    );
    route.computeLineDistances();
    route.layers.set(2);
    environment.group.add(route);
    if (course.id !== environment.spot.courseId)
      environment.label(course.name.toUpperCase(), [course.pad.x, 1, course.pad.z + 3], 8);
    const start = environment.mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.025, 32), course.color, [
      course.pad.x,
      0.005,
      course.pad.z,
    ]);
    start.castShadow = false;
  }
  environment.setCourseProgress(0);
}
export function buildPracticeAids(environment: TrainingEnvironment): void {
  const { x, z } = environment.spot.pad;
  const base = environment.map.ground(x, z);
  if (environment.map.terrain) {
    const point = (radius: number, angle: number): [number, number] => [
      x + Math.sin(angle) * radius,
      z + Math.cos(angle) * radius,
    ];
    const circle = Array.from({ length: 48 }, (_, i) => point(2.3, (i * Math.PI) / 24));
    environment.mesh(
      terrainSurface(circle, environment.map, 0.004),
      '#354e55',
      [0, 0, 0],
    ).castShadow = false;
    const rings = Array.from({ length: 48 }, (_, i) =>
      terrainSurface(
        [
          point(1.88, (i * Math.PI) / 24),
          point(1.92, (i * Math.PI) / 24),
          point(1.92, ((i + 1) * Math.PI) / 24),
          point(1.88, ((i + 1) * Math.PI) / 24),
        ],
        environment.map,
        0.006,
      ),
    );
    environment.mesh(mergeGeometries(rings), '#e4d9ba', [0, 0, 0]).castShadow = false;
    rings.forEach((g) => g.dispose());
    for (const [cx, width, depth] of [
      [x - 0.35, 0.08, 1.1],
      [x + 0.35, 0.08, 1.1],
      [x, 0.7, 0.08],
    ]) {
      environment.mesh(
        terrainSurface(
          [
            [cx - width / 2, z - depth / 2],
            [cx + width / 2, z - depth / 2],
            [cx + width / 2, z + depth / 2],
            [cx - width / 2, z + depth / 2],
          ],
          environment.map,
          0.006,
        ),
        '#e4d9ba',
        [0, 0, 0],
      ).castShadow = false;
    }
  } else {
    environment.mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.005, 48), '#354e55', [x, base, z]);
    const ring = environment.mesh(new THREE.TorusGeometry(1.9, 0.006, 8, 48), '#e4d9ba', [
      x,
      base + 0.005,
      z,
    ]);
    ring.rotation.x = Math.PI / 2;
    environment.box([0.08, 0.004, 1.1], '#e4d9ba', [x - 0.35, base + 0.005, z]);
    environment.box([0.08, 0.004, 1.1], '#e4d9ba', [x + 0.35, base + 0.005, z]);
    environment.box([0.7, 0.004, 0.08], '#e4d9ba', [x, base + 0.005, z]);
  }
  if (!environment.spot.courseId && !environment.map.circuit) {
    const markerPosition = translationMarker(environment.spot, environment.map.ground);
    const marker = environment.mesh(
      new THREE.TorusGeometry(1, 0.055, 8, 40),
      '#e6b95c',
      markerPosition,
    );
    marker.layers.set(2);
    environment.label('02  ·  TRANSLATE', [
      markerPosition[0],
      markerPosition[1] + 2,
      markerPosition[2],
    ]);
  }
  if (!environment.spot.courseId) environment.label('HOME', [x, base + 1.2, z + 2]);
  if (environment.map.id === 'park') environment.label('PHOTO SUBJECT', [0, 6.2, -13]);
  const b = environment.map.bounds;
  const points = (
    b.footprint ?? [
      [b.minX, b.minZ],
      [b.maxX, b.minZ],
      [b.maxX, b.maxZ],
      [b.minX, b.maxZ],
    ]
  ).map(([px, pz]) => new THREE.Vector3(px, environment.map.ground(px, pz) + 0.12, pz));
  points.push(points[0].clone());
  const outline = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: '#e8c783' }),
  );
  outline.layers.set(2);
  environment.group.add(outline);
}
