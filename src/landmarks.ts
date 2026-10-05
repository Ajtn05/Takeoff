import type { MapPoint } from './simulation';

export interface BuildingModel {
  kind: 'gesu' | 'arete' | 'library' | 'gym' | 'observatory' | 'science' | 'delaCosta' | 'leong' | 'jgsom' | 'residence' | 'generic';
  height: number; wallHeight: number; color: string; roofColor: string; floors: number;
}
// Published references establish form and floor counts, rather than surveyed heights.
export const LANDMARK_MODELS: Record<number, BuildingModel> = {
  25766778: { kind: 'gesu', height: 27, wallHeight: 5, color: '#e9e7dd', roofColor: '#dce0db', floors: 1 },
  568930822: { kind: 'arete', height: 17, wallHeight: 17, color: '#e0d9c8', roofColor: '#8b928c', floors: 4 },
  160456354: { kind: 'library', height: 20, wallHeight: 20, color: '#c7b79e', roofColor: '#aaa794', floors: 5 },
  24911828: { kind: 'gym', height: 16, wallHeight: 10, color: '#dcd9c9', roofColor: '#789aa1', floors: 1 },
  25850724: { kind: 'observatory', height: 14, wallHeight: 14, color: '#e1decc', roofColor: '#a4978b', floors: 4 },
  // Exterior colors and facade rhythms from the supplied photographs and Commons gallery.
  25766477: { kind: 'science', height: 11.5, wallHeight: 11.5, color: '#a8543d', roofColor: '#994d3e', floors: 3 },
  25766486: { kind: 'science', height: 11.5, wallHeight: 11.5, color: '#a8543d', roofColor: '#994d3e', floors: 3 },
  25766491: { kind: 'science', height: 11.5, wallHeight: 11.5, color: '#a8543d', roofColor: '#994d3e', floors: 3 },
  25766701: { kind: 'delaCosta', height: 11.5, wallHeight: 11.5, color: '#bb6244', roofColor: '#a65343', floors: 3 },
  25766779: { kind: 'leong', height: 15, wallHeight: 15, color: '#ad5844', roofColor: '#92958e', floors: 4 },
  25766555: { kind: 'jgsom', height: 14, wallHeight: 14, color: '#b3664c', roofColor: '#a9a59b', floors: 4 },
  1363092068: { kind: 'residence', height: 17.5, wallHeight: 17.5, color: '#eee4cf', roofColor: '#a65343', floors: 5 },
};
export function buildingModel(id: number, height: number): BuildingModel {
  return LANDMARK_MODELS[id] ?? { kind: 'generic', height, wallHeight: height, color: '#e2d9c3', roofColor: '#a65343', floors: Math.max(1, Math.round(height / 3.5)) };
}
export function footprintCenter(points: MapPoint[]): MapPoint {
  return [points.reduce((sum, p) => sum + p[0], 0) / points.length, points.reduce((sum, p) => sum + p[1], 0) / points.length];
}
// Piecewise roof height for the same triangular fan used by the Gesù mesh.
export function pyramidHeight(points: MapPoint[], apex: MapPoint, eave: number, peak: number, x: number, z: number): number {
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const denominator = (b[1] - apex[1]) * (a[0] - apex[0]) + (apex[0] - b[0]) * (a[1] - apex[1]);
    if (Math.abs(denominator) < 1e-8) continue;
    const u = ((b[1] - apex[1]) * (x - apex[0]) + (apex[0] - b[0]) * (z - apex[1])) / denominator;
    const v = ((apex[1] - a[1]) * (x - apex[0]) + (a[0] - apex[0]) * (z - apex[1])) / denominator;
    if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6) return eave + (peak - eave) * (1 - u - v);
  }
  return eave;
}
export function barrelHeight(points: MapPoint[], eave: number, peak: number, x: number, z: number): number {
  const [a, b] = points, dx = b[0] - a[0], dz = b[1] - a[1];
  const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return eave + (peak - eave) * Math.sin(Math.PI * u);
}
