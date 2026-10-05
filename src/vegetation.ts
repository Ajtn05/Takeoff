import type { CampusData } from './maps';
import { pointInPolygon, overlapsFootprint, type MapPoint, type Obstacle } from './simulation';
import type { GroundSampler } from './terrain';

type Point3 = [number, number, number];
export interface TreeLimb { from: Point3; to: Point3; bottomRadius: number; topRadius: number }
export interface TreeCrown { center: Point3; radii: Point3; shade: number }
export interface AcaciaTree { x: number; z: number; base: number; height: number; limbs: TreeLimb[]; crowns: TreeCrown[] }

// Approximate canopy regions traced from the user's satellite reference, in campus meters.
// They supplement the two OSM tree nodes; individual trunks are estimated, not surveyed.
export const SATELLITE_GROVES: { name: string; spacing: number; points: MapPoint[] }[] = [
  { name: 'Areté and northwest gardens', spacing: 20, points: [[-435,-230],[-155,-235],[-160,-115],[-315,-90],[-435,-95]] },
  { name: 'West campus woodland', spacing: 17, points: [[-440,-75],[-322,-80],[-303,120],[-290,268],[-420,265],[-449,170]] },
  { name: 'Academic gardens', spacing: 27, points: [[-317,-120],[-80,-145],[-68,250],[-245,282],[-312,167]] },
  { name: 'Bellarmine and Gesù tree belt', spacing: 18, points: [[-65,-236],[133,-297],[367,-278],[369,-109],[221,-68],[180,28],[42,32],[-59,-104]] },
  { name: 'Residence and eastern woodland', spacing: 17, points: [[145,-108],[326,-144],[346,-46],[278,121],[330,181],[290,380],[128,402],[34,280],[17,176],[63,47]] },
  { name: 'Central acacia belt', spacing: 18, points: [[-134,129],[37,111],[105,212],[81,412],[-86,418],[-148,311]] },
  { name: 'Athletics field edges', spacing: 19, points: [[-319,275],[-168,268],[-118,412],[-172,477],[-310,468]] },
  { name: 'Gym and Katipunan edge', spacing: 19, points: [[-449,383],[-315,377],[-293,566],[-456,572]] },
  { name: 'Observatory and southern woodland', spacing: 17, points: [[-126,414],[76,383],[288,431],[305,543],[233,634],[85,731],[-76,765],[-114,593],[-168,534]] },
  { name: 'Grade school gardens', spacing: 23, points: [[-346,553],[-97,545],[-73,771],[-211,728],[-330,641]] },
];
const OPEN_LAWNS: MapPoint[][] = [
  // Bellarmine lawn, the oval surrounding the football pitch, and observatory lawn.
  [[-30,-132],[60,-132],[69,-54],[25,-11],[-27,-29],[-44,-70]],
  [[-416,239],[-326,238],[-306,272],[-309,370],[-325,393],[-407,391],[-422,367],[-423,271]],
  [[-132,438],[19,440],[23,483],[-32,506],[-153,505]],
];
const noise = (seed: number) => { const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
export const campusRoadWidth = (type?: string): number => ['footway', 'path', 'steps', 'pedestrian'].includes(type!) ? 2.5 : type === 'service' ? 5 : 7;
const distanceToSegment = (x: number, z: number, a: MapPoint, b: MapPoint): number => {
  const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz || 1)));
  return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
};

export function createAcacia(x: number, z: number, ground: GroundSampler): AcaciaTree {
  const seed = x * 0.71 + z * 2.13, height = 13 + noise(seed) * 6;
  const base = ground(x, z), fork = Math.max(6.3,height * 0.45), reach = (9.5 + noise(seed + 1) * 3)*(0.86+(height-13)*0.025);
  const limbs: TreeLimb[] = [], crowns: TreeCrown[] = [];
  const add = (from: Point3, to: Point3, bottomRadius: number, topRadius: number) => limbs.push({ from, to, bottomRadius, topRadius });
  const trunkTop: Point3 = [x + (noise(seed+2)-0.5)*1.4, base+fork, z + (noise(seed+3)-0.5)*1.4];
  const trunkRadius=0.55+noise(seed+4)*0.2;
  add([x,base-0.15,z],trunkTop,trunkRadius,trunkRadius*0.5);
  for (let i = 0; i < 4; i++) {
    const angle = i*Math.PI/2+noise(seed+5)*Math.PI*2+(noise(seed+i+8)-0.5)*0.35;
    const dx = Math.cos(angle), dz = Math.sin(angle), spread = reach*(0.78+noise(seed+i+15)*0.22);
    const elbow: Point3 = [trunkTop[0]+dx*spread*0.37,base+height*0.66,trunkTop[2]+dz*spread*0.37];
    const tip: Point3 = [x+dx*spread,base+height*0.82+(noise(seed+i+20)-0.5),z+dz*spread];
    // Four main boughs retain the swept umbrella silhouette without tiny twig meshes.
    add(trunkTop,elbow,0.34,0.17); add(elbow,tip,0.17,0.085);
    crowns.push({ center: [x+dx*spread*0.72,base+height-2.3-noise(seed+i+30)*0.5,z+dz*spread*0.72],
      radii: [5+noise(seed+i+40)*1.3,2.3,4.8+noise(seed+i+50)*1.2], shade: i % 3 });
  }
  crowns.push({ center: [trunkTop[0],base+height-3,trunkTop[2]], radii: [6.5,2.5,6.5], shade: 1 });
  return { x,z,base,height,limbs,crowns };
}

export function campusTrees(data: CampusData, ground: GroundSampler): AcaciaTree[] {
  const trees = data.trees.map(([x,z]) => createAcacia(x,z,ground));
  const buildings = data.features.filter(f => f.kind === 'building');
  const lawns = [...OPEN_LAWNS,...data.features.filter(f => f.kind === 'pitch' || ['Science Education Complex Field','Matteo Field'].includes(f.name)).map(f => f.points)];
  const roads = data.features.filter(f => f.kind === 'road').flatMap(f => f.points.slice(1).map((b,i) => ({ a: f.points[i], b, clearance: campusRoadWidth(f.type)/2+1.2 })));
  // A spatial hash avoids comparing every new trunk to every existing tree.
  const cells = new Map<string, AcaciaTree[]>(), key = (x: number,z: number) => `${Math.floor(x/14)},${Math.floor(z/14)}`;
  const insert = (tree: AcaciaTree) => { const k=key(tree.x,tree.z); const cell=cells.get(k) ?? []; cell.push(tree); cells.set(k,cell); };
  trees.forEach(insert);
  const add = (x: number,z: number) => {
    if (!pointInPolygon(x,z,data.boundary) || lawns.some(p=>overlapsFootprint(x,z,p,5)) || buildings.some(f=>overlapsFootprint(x,z,f.points,6))) return;
    if (roads.some(r=>distanceToSegment(x,z,r.a,r.b)<r.clearance)) return;
    const col=Math.floor(x/14),row=Math.floor(z/14);
    for(let i=col-1;i<=col+1;i++) for(let j=row-1;j<=row+1;j++) if(cells.get(`${i},${j}`)?.some(t=>Math.hypot(t.x-x,t.z-z)<14)) return;
    const tree=createAcacia(x,z,ground); trees.push(tree); insert(tree);
  };
  // Plant roadside trunks first: canopies meet overhead while the road surface stays clear.
  for (const f of data.features.filter(f=>f.kind==='road' && campusRoadWidth(f.type)>2.5)) {
    for(let i=1;i<f.points.length;i++) {
      const a=f.points[i-1],b=f.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const offset=campusRoadWidth(f.type)/2+3;
      for(let d=9;d<length;d+=22) for(const side of [-1,1]) {
        const x=a[0]+(b[0]-a[0])*d/length+(b[1]-a[1])/length*offset*side;
        const z=a[1]+(b[1]-a[1])*d/length-(b[0]-a[0])/length*offset*side;
        if(SATELLITE_GROVES.some(g=>pointInPolygon(x,z,g.points))) add(x,z);
      }
    }
  }
  for(const [index,grove] of SATELLITE_GROVES.entries()) {
    const minX=Math.min(...grove.points.map(p=>p[0])),maxX=Math.max(...grove.points.map(p=>p[0]));
    const minZ=Math.min(...grove.points.map(p=>p[1])),maxZ=Math.max(...grove.points.map(p=>p[1]));
    for(let row=0,z=minZ;z<=maxZ;row++,z+=grove.spacing) for(let col=0,x=minX;x<=maxX;col++,x+=grove.spacing) {
      const seed=index*1031+row*83+col*17, px=x+(noise(seed)-0.5)*grove.spacing*0.7, pz=z+(noise(seed+1)-0.5)*grove.spacing*0.7;
      if(pointInPolygon(px,pz,grove.points)) add(px,pz);
    }
  }
  return trees;
}

export function acaciaObstacle(tree: AcaciaTree): Obstacle {
  const {limbs,crowns}=tree, min: Point3=[Infinity,Infinity,Infinity],max: Point3=[-Infinity,-Infinity,-Infinity];
  for(const limb of limbs) for(let axis=0;axis<3;axis++) {
    min[axis]=Math.min(min[axis],limb.from[axis]-limb.bottomRadius,limb.to[axis]-limb.topRadius);
    max[axis]=Math.max(max[axis],limb.from[axis]+limb.bottomRadius,limb.to[axis]+limb.topRadius);
  }
  for(const crown of crowns) for(let axis=0;axis<3;axis++) {
    min[axis]=Math.min(min[axis],crown.center[axis]-crown.radii[axis]); max[axis]=Math.max(max[axis],crown.center[axis]+crown.radii[axis]);
  }
  return { name: 'acacia tree',min,max,intersects(x,y,z,radius,halfHeight) {
    // Ellipsoid crowns leave genuine empty space underneath and between the lobes.
    if(crowns.some(c=>((x-c.center[0])/(c.radii[0]+radius))**2+((y-c.center[1])/(c.radii[1]+halfHeight))**2+((z-c.center[2])/(c.radii[2]+radius))**2<1)) return true;
    return limbs.some(l=> {
      // Scale vertical distance to account for the much flatter aircraft envelope.
      const vertical=(l.bottomRadius+radius)/(l.bottomRadius+halfHeight);
      const dx=l.to[0]-l.from[0],dy=(l.to[1]-l.from[1])*vertical,dz=l.to[2]-l.from[2];
      const px=x-l.from[0],py=(y-l.from[1])*vertical,pz=z-l.from[2];
      const t=Math.max(0,Math.min(1,(px*dx+py*dy+pz*dz)/(dx*dx+dy*dy+dz*dz)));
      const r=l.bottomRadius+(l.topRadius-l.bottomRadius)*t+radius;
      return (px-t*dx)**2+(py-t*dy)**2+(pz-t*dz)**2<r*r;
    });
  }};
}
