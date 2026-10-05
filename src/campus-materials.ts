import * as THREE from 'three';

const brickColors = new Set(['#a8543d','#bb6244','#ad5844','#b3664c']);
const tileColors = new Set(['#994d3e','#a65343']);
const foliageColors = new Set(['#325c36','#416f3a','#578341']);
export function campusMaterial(color: string): THREE.MeshStandardMaterial {
  const glass = ['#486873','#365c70','#284859','#47778a'].includes(color);
  const material = new THREE.MeshStandardMaterial({ color,roughness: glass ? 0.28 : 0.86,metalness: glass ? 0.24 : 0 });
  const foliage=foliageColors.has(color),bark=color==='#625b46';
  if (!brickColors.has(color) && !tileColors.has(color) && !foliage && !bark) return material;
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d')!;
  // Neutral procedural surfaces preserve the photographed palette without external assets.
  ctx.fillStyle='#b7b1a4';ctx.fillRect(0,0,256,256);
  if(foliage) {
    ctx.fillStyle='#b6b6b6';ctx.fillRect(0,0,256,256);
    for(let i=0;i<950;i++) {
      const x=(Math.sin(i*127.1)*43758.5453%1+1)%1*256,y=(Math.sin(i*311.7)*19341.31%1+1)%1*256;
      const tone=160+i%90;ctx.fillStyle=`rgb(${tone},${tone},${tone})`;
      ctx.beginPath();ctx.ellipse(x,y,2+i%3,1+i%2,i*2.4,0,Math.PI*2);ctx.fill();
    }
    material.emissive.set(color);material.emissiveIntensity=0.16;material.roughness=1;
  } else if(bark) {
    ctx.fillStyle='#dddddd';ctx.fillRect(0,0,256,256);
    for(let i=0;i<160;i++) {
      const x=(Math.sin(i*73)*13337%1+1)%1*256;
      ctx.strokeStyle=i%3 ? '#b2b2b2' : '#efefef';ctx.lineWidth=1+i%2;
      ctx.beginPath();ctx.moveTo(x,0);ctx.bezierCurveTo(x+6,80,x-5,170,x+2,256);ctx.stroke();
    }
  } else if(brickColors.has(color)) {
    for(let row=0;row<16;row++) for(let col=-1;col<8;col++) {
      const tone=205+Math.floor((Math.sin(row*17+col*31)*0.5+0.5)*42);
      ctx.fillStyle=`rgb(${tone},${tone},${tone})`;ctx.fillRect(col*32+(row%2)*16+1,row*16+1,30,14);
    }
  } else {
    ctx.fillStyle='#eeeeee';ctx.fillRect(0,0,256,256);
    for(let i=0;i<16;i++) {
      ctx.fillStyle=i%2 ? '#e1e1e1' : '#cacaca';ctx.fillRect(i*16,0,2,256);
      ctx.fillStyle='#b9b9b9';ctx.fillRect(0,i*16,256,1);
    }
  }
  const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(0.5,0.5);texture.anisotropy=4;
  // Diffuse detail keeps the leaf/bark pattern without derivative-heavy bump shading.
  if(foliage || bark) texture.repeat.set(foliage ? 3 : 2,foliage ? 2 : 1);
  material.map=texture;
  return material;
}
