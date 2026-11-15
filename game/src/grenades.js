// Frag grenades: thrown on an arc, one bounce, a two-second fuse, then radius
// damage that falls off with distance. A small pool of prebuilt meshes, reused,
// so throwing never allocates in the frame loop.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const FUSE = 2.0;
const RADIUS = 6;
const MAX_DAMAGE = 85;
const GRAVITY = 18;
const POOL = 4;

export function createGrenades(scene, hooks) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.6, metalness: 0.4 });
  const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false });
  const geo = new THREE.SphereGeometry(0.09, 12, 10);
  const ringGeo = new THREE.SphereGeometry(1, 20, 14);
  const items = [];
  const vel = new THREE.Vector3();
  const toTarget = new THREE.Vector3();

  for (let i = 0; i < POOL; i += 1) {
    const mesh = new THREE.Mesh(geo, bodyMat);
    mesh.visible = false;
    mesh.castShadow = true;
    scene.add(mesh);
    const ring = new THREE.Mesh(ringGeo, flashMat.clone());
    ring.visible = false;
    scene.add(ring);
    items.push({ mesh, ring, active: false, fuse: 0, velocity: new THREE.Vector3(), ringAge: 1 });
  }
  const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 14);
  scene.add(light);
  let lightAge = 1;

  function explode(item) {
    item.active = false;
    item.mesh.visible = false;
    item.ringAge = 0;
    item.ring.position.copy(item.mesh.position);
    item.ring.visible = true;
    light.position.copy(item.mesh.position);
    lightAge = 0;
    hooks.onExplode(item.mesh.position.clone(), RADIUS);
    const victims = hooks.targets();
    for (const victim of victims) {
      toTarget.set(victim.pos.x, 1.2, victim.pos.z);
      const dist = toTarget.distanceTo(item.mesh.position);
      if (dist > RADIUS) continue;
      const amount = Math.round(MAX_DAMAGE * (1 - dist / RADIUS) + 10);
      victim.damage(amount);
    }
  }

  return {
    throwFrom(origin, direction) {
      const item = items.find((entry) => !entry.active);
      if (!item) return false;
      item.active = true;
      item.fuse = FUSE;
      item.mesh.position.copy(origin);
      item.velocity.copy(direction).multiplyScalar(14);
      item.velocity.y += 3.5;
      item.mesh.visible = true;
      return true;
    },
    step(dt) {
      lightAge = Math.min(1, lightAge + dt * 5);
      light.intensity = lightAge < 1 ? 60 * (1 - lightAge) : 0;
      for (const item of items) {
        if (item.ringAge < 1) {
          item.ringAge = Math.min(1, item.ringAge + dt * 3);
          const s = 0.5 + item.ringAge * RADIUS;
          item.ring.scale.set(s, s, s);
          item.ring.material.opacity = 0.9 * (1 - item.ringAge);
          if (item.ringAge >= 1) item.ring.visible = false;
        }
        if (!item.active) continue;
        item.fuse -= dt;
        item.velocity.y -= GRAVITY * dt;
        vel.copy(item.velocity).multiplyScalar(dt);
        item.mesh.position.add(vel);
        if (item.mesh.position.y < 0.09) {
          item.mesh.position.y = 0.09;
          item.velocity.y = Math.abs(item.velocity.y) * 0.35;
          item.velocity.x *= 0.7;
          item.velocity.z *= 0.7;
        }
        if (item.fuse <= 0) explode(item);
      }
    },
    reset() {
      for (const item of items) {
        item.active = false;
        item.mesh.visible = false;
        item.ring.visible = false;
        item.ringAge = 1;
      }
      light.intensity = 0;
      lightAge = 1;
    },
  };
}
