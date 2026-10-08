export interface TerrainGrid {
  minX: number;
  minZ: number;
  step: number;
  columns: number;
  rows: number;
  heights: number[];
}
export type GroundSampler = (x: number, z: number) => number;
export const FLAT_GROUND: GroundSampler = () => 0;
export function terrainHeight(grid: TerrainGrid, x: number, z: number): number {
  const u = Math.max(0, Math.min(grid.columns - 1, (x - grid.minX) / grid.step));
  const v = Math.max(0, Math.min(grid.rows - 1, (z - grid.minZ) / grid.step));
  const col = Math.min(grid.columns - 2, Math.floor(u));
  const row = Math.min(grid.rows - 2, Math.floor(v));
  const tx = u - col;
  const tz = v - row;
  const index = row * grid.columns + col;
  const a = grid.heights[index];
  const b = grid.heights[index + 1];
  const c = grid.heights[index + grid.columns];
  const d = grid.heights[index + grid.columns + 1];
  // Match the terrain mesh's a–d diagonal exactly, including the last grid edge.
  return tx >= tz ? a + tx * (b - a) + tz * (d - b) : a + tz * (c - a) + tx * (d - c);
}
