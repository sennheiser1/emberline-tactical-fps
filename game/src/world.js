// Foundry Yard: an original three-lane map. Defenders spawn south, attackers north;
// sites A (west) and B (east) sit behind a mid cross-wall. Every box is a collider
// and a bullet stop, except the flat site pads. Plain geometry, palette colours only.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const padMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent),
    emissiveIntensity: 0.35, roughness: 0.7,
  });
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }
  function pad(w, d, x, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), padMaterial);
    mesh.position.set(x, 0.02, z);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Floor and outer walls: 40 x 32 m, 5 m high, open sky.
  box(40.4, 0.4, 32.4, 0, -0.2, 0, 'canvas');
  box(0.4, 5, 32.4, -20.2, 2.5, 0, 'surface');
  box(0.4, 5, 32.4, 20.2, 2.5, 0, 'surface');
  box(40.4, 5, 0.4, 0, 2.5, -16.2, 'surface');
  box(40.4, 5, 0.4, 0, 2.5, 16.2, 'surface');

  // Mid cross-wall with a central double door; it splits the map into two halves.
  box(15, 3.4, 0.8, -12.5, 1.7, -2, 'surface');
  box(15, 3.4, 0.8, 12.5, 1.7, -2, 'surface');
  box(1, 3.4, 0.8, -4.5, 1.7, -2, 'hairline');
  box(1, 3.4, 0.8, 4.5, 1.7, -2, 'hairline');
  box(9, 1.2, 0.8, 0, 4.4, -2, 'surface');
  // South wall with a wide mid gap: the defenders' courtyard.
  box(12, 3.4, 0.8, -14, 1.7, 6, 'surface');
  box(12, 3.4, 0.8, 14, 1.7, 6, 'surface');
  box(1, 3.4, 0.8, -7.5, 1.7, 6, 'hairline');
  box(1, 3.4, 0.8, 7.5, 1.7, 6, 'hairline');

  // Mid lane: a pillar to play around, crates to crouch behind, an arch at the doors.
  box(1.4, 3.6, 1.4, 0, 1.8, -6, 'hairline');
  box(1.2, 1.1, 1.2, -3, 0.55, 1, 'hairline');
  box(1.2, 1.1, 1.2, 3, 0.55, 1, 'hairline');
  box(2.4, 1.1, 1.2, 0, 0.55, 10, 'hairline');
  box(1.2, 1.1, 3.6, -8, 0.55, -9, 'hairline');
  box(1.2, 1.1, 3.6, 8, 0.55, -9, 'hairline');

  // West lane (to A): staggered cover and a corner stack.
  box(3.6, 1.1, 1.2, -14, 0.55, 2, 'hairline');
  box(1.2, 1.1, 3.6, -17, 0.55, -4, 'hairline');
  box(1.6, 2.2, 1.6, -11, 1.1, -12, 'hairline');
  box(2.4, 0.9, 1.2, -17.5, 0.45, 10, 'hairline');
  // East lane (to B): mirrored cover, different heights so the lanes play differently.
  box(3.6, 1.1, 1.2, 14, 0.55, 2, 'hairline');
  box(1.2, 2.2, 1.2, 17, 1.1, -4, 'hairline');
  box(1.6, 1.1, 1.6, 11, 0.55, -12, 'hairline');
  box(2.4, 0.9, 1.2, 17.5, 0.45, 10, 'hairline');

  // Site A: a jumpable platform, crates, beacon poles and a marked pad.
  box(6, 0.5, 4, -14, 0.25, -12, 'surface');
  box(1.2, 1.1, 1.2, -16, 0.55, -8, 'hairline');
  box(1.2, 1.1, 1.2, -12, 0.55, -8, 'hairline');
  box(0.3, 3.2, 0.3, -17.5, 1.6, -13.5, 'hairline');
  box(0.3, 3.2, 0.3, -10.5, 1.6, -13.5, 'hairline');
  pad(6, 5, -14, -10.5);
  // Site B: low walls to hold behind, crates, beacon poles and a marked pad.
  box(5, 1.3, 0.8, 14, 0.65, -13, 'hairline');
  box(1.2, 1.1, 1.2, 12, 0.55, -8, 'hairline');
  box(1.2, 1.1, 1.2, 16, 0.55, -8, 'hairline');
  box(0.3, 3.2, 0.3, 10.5, 1.6, -13.5, 'hairline');
  box(0.3, 3.2, 0.3, 17.5, 1.6, -13.5, 'hairline');
  pad(6, 5, 14, -10.5);

  // Spawn cover so neither spawn is a shooting gallery.
  box(2.4, 1.1, 1.2, -4, 0.55, 13.5, 'hairline');
  box(2.4, 1.1, 1.2, 4, 0.55, 13.5, 'hairline');
  box(2.4, 1.1, 1.2, -4, 0.55, -13.5, 'hairline');
  box(2.4, 1.1, 1.2, 4, 0.55, -13.5, 'hairline');

  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 1.15);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 2.1);
  key.position.set(14, 20, 10);
  key.target.position.set(0, 0, -2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.55);
  fill.position.set(-12, 12, 14);
  scene.add(fill);

  const v = (x, z) => new THREE.Vector3(x, 0, z);
  return {
    colliders,
    shootables,
    group,
    sites: {
      A: { center: v(-14, -10.5), plant: v(-14, -10.5), minX: -18, maxX: -10, minZ: -14, maxZ: -6 },
      B: { center: v(14, -10.5), plant: v(14, -10.5), minX: 10, maxX: 18, minZ: -14, maxZ: -6 },
    },
    spawns: {
      def: [v(-2, 13.5), v(2, 13.5), v(0, 14.5)],
      atk: [v(-3, -13.5), v(0, -14), v(3, -13.5), v(-1.5, -12)],
    },
    routes: {
      atkToA: [v(-6, -11), v(-11, -9), v(-14, -10.5)],
      atkToB: [v(6, -11), v(11, -9), v(14, -10.5)],
      atkMid: [v(0, -6), v(0, 0), v(0, 5), v(0, 11)],
      toA: [v(0, -6), v(-6, -11), v(-14, -10.5)],
      toB: [v(0, -6), v(6, -11), v(14, -10.5)],
      defA: [v(-13, -7)],
      defB: [v(13, -7)],
      defMid: [v(0, 4)],
    },
  };
}
