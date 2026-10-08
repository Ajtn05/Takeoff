import * as THREE from 'three';

const rendererSize = new THREE.Vector2();

export function resizeRenderer(renderer: THREE.WebGLRenderer, stage: HTMLElement): void {
  const size = renderer.getSize(rendererSize);
  if (size.x !== stage.clientWidth || size.y !== stage.clientHeight) {
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  }
}

export function renderViewport(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  view: HTMLElement,
  stage: HTMLElement,
): void {
  if (!view.offsetWidth || !view.offsetHeight) return;
  const bounds = view.getBoundingClientRect();
  const stageBounds = stage.getBoundingClientRect();
  const x = bounds.left - stageBounds.left;
  const y = stageBounds.bottom - bounds.bottom;
  renderer.setViewport(x, y, bounds.width, bounds.height);
  renderer.setScissor(x, y, bounds.width, bounds.height);
  const aspect = bounds.width / bounds.height;
  if (camera.aspect !== aspect) {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
  renderer.render(scene, camera);
}
