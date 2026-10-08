import * as THREE from 'three';
import type { TrainingMap } from '../maps/maps';
import type { MapPoint } from '../flight/simulation';

export function terrainGeometry(map: TrainingMap): THREE.BufferGeometry {
  const t = map.terrain!;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new THREE.Color();
  for (let row = 0; row < t.rows; row++)
    for (let col = 0; col < t.columns; col++) {
      const h = t.heights[row * t.columns + col];
      positions.push(t.minX + col * t.step, h, t.minZ + row * t.step);
      const variation = Math.sin(col * 13.12 + row * 7.73) * 0.015;
      color.setHSL(0.24 + variation, 0.22, 0.31 + h / 1500 + variation);
      colors.push(color.r, color.g, color.b);
      if (row < t.rows - 1 && col < t.columns - 1) {
        const a = row * t.columns + col;
        const b = a + 1;
        const c = a + t.columns;
        const d = c + 1;
        indices.push(a, d, b, a, c, d);
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function terrainSurface(
  points: MapPoint[],
  map: TrainingMap,
  lift: number,
): THREE.BufferGeometry {
  const grid = map.terrain!;
  const positions: number[] = [];
  const uv: number[] = [];
  const cross = (a: MapPoint, b: MapPoint, p: MapPoint) =>
    (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const clip = (polygon: MapPoint[], triangle: MapPoint[]): MapPoint[] => {
    const sign = Math.sign(cross(triangle[0], triangle[1], triangle[2]));
    for (let edge = 0; edge < 3 && polygon.length; edge++) {
      const a = triangle[edge];
      const b = triangle[(edge + 1) % 3];
      const output: MapPoint[] = [];
      for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i];
        const q = polygon[(i + 1) % polygon.length];
        const dp = sign * cross(a, b, p);
        const dq = sign * cross(a, b, q);
        if (dp >= -1e-7) output.push(p);
        if (dp >= -1e-7 !== dq >= -1e-7) {
          const t = dp / (dp - dq);
          output.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
        }
      }
      polygon = output;
    }
    return polygon;
  };
  for (const face of THREE.ShapeUtils.triangulateShape(
    points.map(([x, z]) => new THREE.Vector2(x, z)),
    [],
  )) {
    const triangle = face.map((i) => points[i]);
    const minCol = Math.max(
      0,
      Math.floor((Math.min(...triangle.map(([x]) => x)) - grid.minX) / grid.step),
    );
    const maxCol = Math.min(
      grid.columns - 2,
      Math.floor((Math.max(...triangle.map(([x]) => x)) - grid.minX) / grid.step),
    );
    const minRow = Math.max(
      0,
      Math.floor((Math.min(...triangle.map(([, z]) => z)) - grid.minZ) / grid.step),
    );
    const maxRow = Math.min(
      grid.rows - 2,
      Math.floor((Math.max(...triangle.map(([, z]) => z)) - grid.minZ) / grid.step),
    );
    for (let row = minRow; row <= maxRow; row++)
      for (let col = minCol; col <= maxCol; col++) {
        const x = grid.minX + col * grid.step;
        const z = grid.minZ + row * grid.step;
        const a: MapPoint = [x, z];
        const b: MapPoint = [x + grid.step, z];
        const c: MapPoint = [x, z + grid.step];
        const d: MapPoint = [x + grid.step, z + grid.step];
        for (const cell of [
          [a, d, b],
          [a, c, d],
        ]) {
          const polygon = clip(triangle, cell);
          for (let i = 1; i + 1 < polygon.length; i++) {
            const vertices = [polygon[0], polygon[i], polygon[i + 1]];
            if (Math.abs(cross(...(vertices as [MapPoint, MapPoint, MapPoint]))) < 1e-8) continue;
            if (cross(...(vertices as [MapPoint, MapPoint, MapPoint])) > 0) vertices.reverse();
            for (const [px, pz] of vertices) {
              positions.push(px, map.ground(px, pz) + lift, pz);
              uv.push(px / 10, pz / 10);
            }
          }
        }
      }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}
