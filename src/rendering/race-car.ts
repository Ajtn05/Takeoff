import * as THREE from 'three';
import type { TrainingEnvironment } from './training-environment';

export function buildFormulaCar(environment: TrainingEnvironment): void {
  environment.group.add(environment.subject);
  const red = '#e63830';
  const carbon = '#20272c';
  environment.box([1.45, 0.1, 3.65], carbon, [0, 0.2, 0.15], environment.subject);
  environment.box([0.72, 0.43, 2.15], red, [0, 0.54, 0.58], environment.subject);
  const nose = environment.mesh(
    new THREE.CylinderGeometry(0.1, 0.34, 1.9, 4),
    red,
    [0, 0.43, -1.45],
    environment.subject,
  );
  nose.rotation.x = -Math.PI / 2;
  nose.rotation.z = Math.PI / 4;
  for (const side of [-1, 1]) {
    environment.box([0.43, 0.36, 1.8], red, [side * 0.55, 0.4, 0.5], environment.subject);
    environment.box([0.3, 0.18, 0.05], carbon, [side * 0.53, 0.48, -0.42], environment.subject);
    for (const z of [-1.68, 1.65]) {
      const arm = environment.box(
        [0.72, 0.035, 0.07],
        carbon,
        [side * 0.5, 0.39, z + 0.15],
        environment.subject,
      );
      arm.rotation.y = side * 0.25;
      const wheel = new THREE.Group();
      wheel.position.set(side * 0.8, 0.36, z);
      environment.subject.add(wheel);
      const tyre = environment.mesh(
        new THREE.CylinderGeometry(0.36, 0.36, 0.4, 24),
        '#14191c',
        [0, 0, 0],
        wheel,
      );
      tyre.rotation.z = Math.PI / 2;
      const hub = environment.mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.405, 16),
        '#545d64',
        [0, 0, 0],
        wheel,
      );
      hub.rotation.z = Math.PI / 2;
      const stripe = environment.mesh(
        new THREE.TorusGeometry(0.29, 0.012, 6, 32),
        '#eac646',
        [side * 0.205, 0, 0],
        wheel,
      );
      stripe.rotation.y = Math.PI / 2;
      environment.rallyWheels.push(wheel);
      environment.batchStaticMeshes(wheel);
    }
  }
  for (const z of [-2.58, -2.36])
    environment.box([1.94, 0.06, 0.23], carbon, [0, 0.23, z], environment.subject);
  for (const side of [-1, 1]) {
    environment.box([0.06, 0.25, 0.5], red, [side * 0.95, 0.3, -2.48], environment.subject);
    environment.box([0.07, 0.34, 0.55], red, [side * 0.85, 0.95, 2.37], environment.subject);
  }
  environment.box([0.12, 0.56, 0.22], carbon, [0, 0.68, 2.18], environment.subject);
  environment.box([1.76, 0.1, 0.53], red, [0, 1.04, 2.37], environment.subject);
  environment.box([1.4, 0.014, 0.18], '#f1ede7', [0, 1.098, 2.37], environment.subject);
  const cockpit = environment.mesh(
    new THREE.CylinderGeometry(0.28, 0.24, 0.05, 24),
    carbon,
    [0, 0.78, -0.05],
    environment.subject,
  );
  cockpit.scale.z = 1.5;
  environment.mesh(
    new THREE.SphereGeometry(0.16, 16, 12),
    '#f5d360',
    [0, 0.89, 0.02],
    environment.subject,
  );
  const halo = environment.mesh(
    new THREE.TorusGeometry(0.34, 0.03, 8, 32),
    carbon,
    [0, 1.06, -0.1],
    environment.subject,
  );
  halo.rotation.x = Math.PI / 2;
  halo.scale.y = 1.3;
  environment.box([0.04, 0.27, 0.06], carbon, [0, 0.93, -0.53], environment.subject);
  environment.box([0.35, 0.015, 0.5], '#f1ede7', [0, 0.55, -1.65], environment.subject);
  environment.batchStaticMeshes(environment.subject);
}
