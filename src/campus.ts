import * as THREE from 'three';
import { buildingModel, footprintCenter } from './landmarks';
import type { CampusFeature, TrainingMap } from './maps';
import { pointInPolygon, type MapPoint } from './simulation';
import type { AcaciaTree } from './vegetation';

type MeshBuilder = (geometry: THREE.BufferGeometry, color: string, position: [number, number, number], parent?: THREE.Object3D) => THREE.Mesh;

export function buildCampusTrees(trees: AcaciaTree[], parent: THREE.Object3D, material: (color: string) => THREE.Material): THREE.Group {
  const forest = new THREE.Group(); forest.name = 'Campus acacias'; parent.add(forest);
  // Raycaster otherwise visits invisible descendants, leaving hidden trees in photos/framing checks.
  forest.raycast = () => forest.visible ? undefined : false;
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), up = new THREE.Vector3(0,1,0);
  const direction = new THREE.Vector3(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const patches=new Map<string,AcaciaTree[]>();
  for(const tree of trees) {
    const key=`${Math.floor(tree.x/192)},${Math.floor(tree.z/192)}`,patch=patches.get(key)??[];patch.push(tree);patches.set(key,patch);
  }
  // Open five-sided cylinders and 20-face crowns replace the previous capped,
  // seven-sided branches and 80-face crowns. All instances share these geometries.
  const limbGeometry=new THREE.CylinderGeometry(0.5,1,1,5,1,true);
  const crownGeometry=new THREE.IcosahedronGeometry(1,0),vertices=crownGeometry.getAttribute('position');
  for(let i=0;i<vertices.count;i++) {
    const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i),variation=0.97+Math.sin(x*17+y*23+z*13)*0.03;
    vertices.setXYZ(i,x*variation,y*variation,z*variation);
  }
  crownGeometry.computeVertexNormals();
  const crownMaterial=material('#416f3a').clone();
  if(crownMaterial instanceof THREE.MeshStandardMaterial) crownMaterial.color.set('#ffffff');
  const shades=['#325c36','#416f3a','#578341'].map(color=>new THREE.Color(color));
  // Local instance batches let rendering, shadows and camera rays skip distant groves.
  for(const patch of patches.values()) {
    const limbs=patch.flatMap(tree=>tree.limbs);
    const trunks = new THREE.InstancedMesh(limbGeometry,material('#625b46'),limbs.length);
    limbs.forEach((limb,i)=> {
      direction.set(limb.to[0]-limb.from[0],limb.to[1]-limb.from[1],limb.to[2]-limb.from[2]);
      const length=direction.length(); rotation.setFromUnitVectors(up,direction.normalize());
      position.set((limb.from[0]+limb.to[0])/2,(limb.from[1]+limb.to[1])/2,(limb.from[2]+limb.to[2])/2);
      scale.set(limb.bottomRadius,length,limb.bottomRadius); matrix.compose(position,rotation,scale); trunks.setMatrixAt(i,matrix);
    });
    trunks.name='Acacia trunks and swept branches'; trunks.castShadow=trunks.receiveShadow=true; forest.add(trunks);
    const crowns=patch.flatMap(tree=>tree.crowns);
    const canopy=new THREE.InstancedMesh(crownGeometry,crownMaterial,crowns.length);
    crowns.forEach((c,i)=> {
      position.set(...c.center); scale.set(...c.radii); rotation.identity();
      matrix.compose(position,rotation,scale); canopy.setMatrixAt(i,matrix);canopy.setColorAt(i,shades[c.shade]);
    });
    canopy.userData.ownedMaterial=true;
    canopy.name='Raised acacia canopy'; canopy.castShadow=canopy.receiveShadow=true; forest.add(canopy);
  }
  return forest;
}

export function terrainGeometry(map: TrainingMap): THREE.BufferGeometry {
  const t = map.terrain!, positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const color = new THREE.Color();
  for (let row = 0; row < t.rows; row++) for (let col = 0; col < t.columns; col++) {
    const h = t.heights[row * t.columns + col];
    positions.push(t.minX + col * t.step, h, t.minZ + row * t.step);
    const variation = Math.sin(col * 13.12 + row * 7.73) * 0.015;
    color.setHSL(0.24 + variation, 0.22, 0.31 + h / 1500 + variation); colors.push(color.r, color.g, color.b);
    if (row < t.rows - 1 && col < t.columns - 1) {
      const a = row * t.columns + col, b = a + 1, c = a + t.columns, d = c + 1;
      indices.push(a, d, b, a, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

export function terrainSurface(points: MapPoint[], map: TrainingMap, lift: number): THREE.BufferGeometry {
  const grid = map.terrain!, positions: number[] = [], uv: number[] = [];
  const cross = (a: MapPoint, b: MapPoint, p: MapPoint) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const clip = (polygon: MapPoint[], triangle: MapPoint[]): MapPoint[] => {
    const sign = Math.sign(cross(triangle[0], triangle[1], triangle[2]));
    for (let edge = 0; edge < 3 && polygon.length; edge++) {
      const a = triangle[edge], b = triangle[(edge + 1) % 3], output: MapPoint[] = [];
      for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i], q = polygon[(i + 1) % polygon.length], dp = sign * cross(a, b, p), dq = sign * cross(a, b, q);
        if (dp >= -1e-7) output.push(p);
        if ((dp >= -1e-7) !== (dq >= -1e-7)) {
          const t = dp / (dp - dq); output.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
        }
      }
      polygon = output;
    }
    return polygon;
  };
  for (const face of THREE.ShapeUtils.triangulateShape(points.map(([x, z]) => new THREE.Vector2(x, z)), [])) {
    const triangle = face.map((i) => points[i]);
    const minCol = Math.max(0, Math.floor((Math.min(...triangle.map(([x]) => x)) - grid.minX) / grid.step));
    const maxCol = Math.min(grid.columns - 2, Math.floor((Math.max(...triangle.map(([x]) => x)) - grid.minX) / grid.step));
    const minRow = Math.max(0, Math.floor((Math.min(...triangle.map(([, z]) => z)) - grid.minZ) / grid.step));
    const maxRow = Math.min(grid.rows - 2, Math.floor((Math.max(...triangle.map(([, z]) => z)) - grid.minZ) / grid.step));
    for (let row = minRow; row <= maxRow; row++) for (let col = minCol; col <= maxCol; col++) {
      const x = grid.minX + col * grid.step, z = grid.minZ + row * grid.step;
      const a: MapPoint = [x, z], b: MapPoint = [x + grid.step, z], c: MapPoint = [x, z + grid.step], d: MapPoint = [x + grid.step, z + grid.step];
      for (const cell of [[a, d, b], [a, c, d]]) {
        const polygon = clip(triangle, cell);
        for (let i = 1; i + 1 < polygon.length; i++) {
          const vertices = [polygon[0], polygon[i], polygon[i + 1]];
          if (Math.abs(cross(...vertices as [MapPoint, MapPoint, MapPoint])) < 1e-8) continue;
          if (cross(...vertices as [MapPoint, MapPoint, MapPoint]) > 0) vertices.reverse();
          for (const [px, pz] of vertices) { positions.push(px, map.ground(px, pz) + lift, pz); uv.push(px / 10, pz / 10); }
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.computeVertexNormals(); return geometry;
}

export function buildCampusBuilding(feature: CampusFeature, map: TrainingMap, parent: THREE.Object3D, mesh: MeshBuilder): void {
  const model = buildingModel(feature.id, feature.height!), center = footprintCenter(feature.points);
  const base = map.ground(...center);
  const lowest = Math.min(base, ...feature.points.map(([x, z]) => map.ground(x, z))) - 0.4;
  const shape = new THREE.Shape(feature.points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const walls = new THREE.ExtrudeGeometry(shape, { depth: base + model.wallHeight - lowest, bevelEnabled: false }); walls.rotateX(-Math.PI / 2);
  mesh(walls, model.color, [0, lowest, 0], parent);
  const box = (size: [number, number, number], color: string, p: [number, number, number]) => mesh(new THREE.BoxGeometry(...size), color, p, parent);

  if (model.kind === 'gesu') {
    // Tetrahedral roof: same fan and vertical profile as the collision surface.
    const positions: number[] = [], peak = model.height - 7;
    for (let i = 0; i < feature.points.length; i++) {
      const a = feature.points[i], b = feature.points[(i + 1) % feature.points.length];
      positions.push(a[0], base + model.wallHeight, a[1], center[0], base + peak, center[1], b[0], base + model.wallHeight, b[1]);
    }
    const roof = new THREE.BufferGeometry(); roof.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); roof.computeVertexNormals();
    const shell = mesh(roof, model.roofColor, [0, 0, 0], parent); shell.material = (shell.material as THREE.MeshStandardMaterial).clone();
    (shell.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide; shell.userData.ownedMaterial = true;
    // Small glass cupola and its cross, with estimated proportions from exterior photographs.
    const cupola = mesh(new THREE.ConeGeometry(2.5, 5, 3), '#789e9e', [center[0], base + peak + 2.5, center[1]], parent);
    cupola.rotation.y = Math.PI;
    box([0.16, 2.3, 0.16], '#e8e9df', [center[0], base + 26, center[1]]);
    box([1.4, 0.14, 0.14], '#e8e9df', [center[0], base + 26.3, center[1]]);
    // Open entrance colonnade along the wide southern edge.
    const a = feature.points[1], b = feature.points[2];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      box([0.4, 4.6, 0.4], '#e5e6dc', [a[0] + (b[0] - a[0]) * t, base + 2.3, a[1] + (b[1] - a[1]) * t + 0.3]);
    }
    // Front glazing is a triangle, rather than horizontal office-window bands.
    const glazing = new THREE.BufferGeometry();
    glazing.setAttribute('position', new THREE.Float32BufferAttribute([a[0], base + 1, a[1] + 0.2, b[0], base + 1, b[1] + 0.2, center[0], base + peak - 1, center[1] + 0.2], 3));
    glazing.computeVertexNormals(); const glass = mesh(glazing, '#729798', [0, 0, 0], parent);
    glass.material = (glass.material as THREE.MeshStandardMaterial).clone(); (glass.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide; glass.userData.ownedMaterial = true;
    return;
  }

  if (model.kind === 'gym' && feature.points.length === 4) {
    const [a, b, c, d] = feature.points, positions: number[] = [], uv: number[] = [];
    const point = (u: number, v: number): [number, number, number] => [
      (a[0] + (b[0] - a[0]) * u) * (1 - v) + (d[0] + (c[0] - d[0]) * u) * v,
      base + model.wallHeight + (model.height - model.wallHeight) * Math.sin(Math.PI * u),
      (a[1] + (b[1] - a[1]) * u) * (1 - v) + (d[1] + (c[1] - d[1]) * u) * v,
    ];
    for (let i = 0; i < 32; i++) {
      const u = i / 32, next = (i + 1) / 32;
      for (const [s, v] of [[u, 0], [u, 1], [next, 0], [next, 0], [u, 1], [next, 1]]) { positions.push(...point(s, v)); uv.push(s, v); }
      for (const v of [0, 1]) {
        const left = point(u, v), right = point(next, v);
        positions.push(...left, right[0], base + model.wallHeight, right[2], ...right); uv.push(u, v, next, v, next, v);
        positions.push(...left, left[0], base + model.wallHeight, left[2], right[0], base + model.wallHeight, right[2]); uv.push(u, v, u, v, next, v);
      }
    }
    const roof = new THREE.BufferGeometry(); roof.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); roof.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); roof.computeVertexNormals();
    const shell = mesh(roof, model.roofColor, [0, 0, 0], parent); shell.material = (shell.material as THREE.MeshStandardMaterial).clone();
    (shell.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide; shell.userData.ownedMaterial = true;
  } else {
    const roof = new THREE.ShapeGeometry(shape); roof.rotateX(-Math.PI / 2);
    mesh(roof, model.roofColor, [0, base + model.height + 0.04, 0], parent);
  }
  // Facades follow the mapped edges; bays, piers and bands use physical meter dimensions.
  const academic = ['science','delaCosta','leong','jgsom'].includes(model.kind);
  const cream = '#ece8db', glass = academic ? '#365c70' : '#486873';
  const edges = feature.points.map((a,i)=> ({ a,b: feature.points[(i+1)%feature.points.length] }));
  const longest = edges.reduce((best,e)=>Math.hypot(e.b[0]-e.a[0],e.b[1]-e.a[1])>Math.hypot(best.b[0]-best.a[0],best.b[1]-best.a[1]) ? e : best);
  for (let i = 0; i < feature.points.length; i++) {
    const [ax, az] = feature.points[i], [bx, bz] = feature.points[(i + 1) % feature.points.length];
    const length = Math.hypot(bx - ax, bz - az), angle = -Math.atan2(bz - az, bx - ax);
    if (length < 1.5) continue;
    let nx=(bz-az)/length,nz=-(bx-ax)/length;
    if(pointInPolygon((ax+bx)/2+nx*0.3,(az+bz)/2+nz*0.3,feature.points)) { nx=-nx;nz=-nz; }
    const along = (distance: number,y: number,offset=0.06): [number,number,number] => [ax+(bx-ax)*distance/length+nx*offset,y,az+(bz-az)*distance/length+nz*offset];
    const facade = (size: [number,number,number],color: string,distance: number,y: number,offset=0.06) => {
      const panel=box(size,color,along(distance,y,offset));panel.rotation.y=angle;return panel;
    };
    const floorHeight = model.wallHeight / model.floors;
    if(['arete','library'].includes(model.kind)) {
      for(let floor=0;floor<model.floors;floor++) facade([length-0.8,Math.min(1.8,floorHeight*0.48),0.08],glass,length/2,base+floor*floorHeight+floorHeight*0.58);
      const spacing=model.kind==='arete' ? 1.2 : 3.8;
      for(let d=1;d<length-0.5;d+=spacing) facade([model.kind==='arete' ? 0.16 : 0.28,model.wallHeight-0.5,model.kind==='arete' ? 0.8 : 0.28],model.kind==='arete' ? '#b6b1a6' : '#9c6852',d,base+model.wallHeight/2);
    } else {
      const spacing=model.kind==='jgsom' ? 5.6 : model.kind==='residence' ? 3.2 : academic ? 4.2 : 4.8;
      const bays=Math.max(1,Math.floor(length/spacing)),step=(length-1.1)/bays;
      for(let bay=0;bay<bays;bay++) {
        const d=0.55+(bay+0.5)*step,width=Math.max(0.35,step*(model.kind==='jgsom' ? 0.7 : 0.76));
        for(let floor=0;floor<model.floors;floor++) {
          const y=base+floor*floorHeight+floorHeight*0.59,h=floorHeight*(model.kind==='jgsom' ? 0.72 : 0.48);
          facade([width,h,0.08],bay%3===0 ? '#284859' : glass,d,y);
          facade([0.055,h,0.1],cream,d,y,0.1);
          facade([width,0.055,0.1],cream,d,y-h/2,0.1);
        }
      }
      if(model.kind==='jgsom') {
        for(let d=0.55;d<length;d+=step) facade([Math.min(1.3,step*0.24),model.height-0.25,0.38],model.color,d,base+model.height/2,0.1);
      }
      if(['science','delaCosta','leong','residence'].includes(model.kind)) {
        for(let floor=1;floor<model.floors;floor++) facade([length,model.kind==='delaCosta' ? 0.9 : model.kind==='leong' ? 0.72 : 0.36,0.3],cream,length/2,base+floor*floorHeight-0.3,0.1);
      }
    }
    if (model.kind === 'library') {
      for (let floor = 1; floor <= model.floors; floor++) {
        const fascia = box([length, 0.32, 0.32], '#b48c72', [(ax + bx) / 2, base + floor * floorHeight, (az + bz) / 2]); fascia.rotation.y = angle;
      }
    }
    facade([length,academic ? 0.32 : 0.18,0.24],academic ? cream : '#d5cdb7',length/2,base+model.height-0.12,0.06);
    if(academic && feature.points[i]===longest.a && length>15) {
      const d=model.kind==='delaCosta' ? length*0.22 : length*0.18;
      if(['delaCosta','leong'].includes(model.kind)) {
        const width=model.kind==='leong' ? 5 : 4.8;
        facade([width,model.height-0.45,0.32],model.color,d,base+model.height/2,0.18);
        facade([model.kind==='leong' ? 3.8 : 1.15,model.height-2,0.08],'#47778a',d,base+model.height/2+0.2,0.38);
        for(let floor=1;floor<model.floors;floor++) facade([width-0.9,0.07,0.09],cream,d,base+floor*floorHeight,0.44);
      }
      // An entrance lintel stays close to the footprint and provides a recognizable hall name.
      const signWidth=Math.min(model.kind==='jgsom' ? 9 : 12,length*0.42),signY=base+floorHeight-0.65;
      facade([signWidth,0.8,0.3],cream,length/2,signY,0.17);
      if(typeof document!=='undefined') {
        const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=96;
        const context=canvas.getContext('2d')!;context.fillStyle=cream;context.fillRect(0,0,1024,96);
        context.fillStyle='#41443f';context.font='600 38px sans-serif';context.textAlign='center';context.textBaseline='middle';
        context.fillText(model.kind==='delaCosta' ? 'HORACIO DE LA COSTA HALL' : model.kind==='jgsom' ? 'JOHN GOKONGWEI SCHOOL OF MANAGEMENT' : model.kind==='leong' ? 'RICARDO & ROSITA LEONG HALL' : 'SCIENCE EDUCATION COMPLEX',512,48,980);
        const sign=mesh(new THREE.PlaneGeometry(signWidth,0.8),cream,along(length/2,signY,0.34),parent);
        sign.rotation.y=Math.atan2(nx,nz);sign.material=new THREE.MeshStandardMaterial({ map:new THREE.CanvasTexture(canvas),roughness:0.9 });
        sign.userData.ownedMaterial=sign.userData.ownedTexture=true;
      }
    }
  }
}
