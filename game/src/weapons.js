// Three weapons, one job: own the numbers, the view models and the feel. Damage,
// spread and recoil live here; main.js owns the ray. Bloom grows with each shot
// and decays, so bursts beat holding the trigger, and moving spreads the shots.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: { name: 'P-9 Sidearm', price: 0, mag: 12, reserve: 48, gap: 0.24, reload: 1.4, damage: 26, head: 55, still: 0.0015, moving: 0.016, bloom: 0.004, kick: 0.006, auto: false },
  smg: { name: 'K-9 SMG', price: 1500, mag: 25, reserve: 100, gap: 0.075, reload: 1.7, damage: 22, head: 60, still: 0.004, moving: 0.034, bloom: 0.003, kick: 0.005, auto: true },
  rifle: { name: 'VK-7 Rifle', price: 2500, mag: 30, reserve: 90, gap: 0.096, reload: 1.9, damage: 34, head: 85, still: 0.0022, moving: 0.028, bloom: 0.005, kick: 0.009, auto: true },
};
export const GRENADE_PRICE = 300;
const MOVE_REFERENCE = 5.2;

export function createWeapons(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });

  function buildModel(kind) {
    const model = new THREE.Group();
    if (kind === 'pistol') {
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.24), body);
      const gripMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.07), grip);
      gripMesh.position.set(0, -0.07, 0.08);
      model.add(slide, gripMesh);
    } else if (kind === 'smg') {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.34), body);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.2), grip);
      barrel.position.set(0, 0.02, -0.26);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.06), accent);
      mag.position.set(0, -0.1, -0.02);
      model.add(receiver, barrel, mag);
    } else {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
      barrel.position.set(0, 0.025, -0.38);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
      stock.position.set(0, -0.02, 0.3);
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), accent);
      sight.position.set(0, 0.07, -0.05);
      model.add(receiver, barrel, stock, sight);
    }
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
    return model;
  }

  const models = { pistol: buildModel('pistol'), smg: buildModel('smg'), rifle: buildModel('rifle') };
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const owned = { pistol: true, smg: false, rifle: false };
  const ammo = {};
  for (const id of Object.keys(WEAPONS)) ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  const state = { current: 'pistol', cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, bloom: 0, grenades: 1 };
  models.pistol.visible = true;

  function def() { return WEAPONS[state.current]; }
  function model() { return models[state.current]; }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.bloom = Math.max(0, state.bloom - dt * 0.03);
    const m = model();
    m.position.z = -0.42 + state.kick;
    m.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      m.rotation.x = -0.55 * Math.min(1, (def().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const slot = ammo[state.current];
        const take = Math.min(def().mag - slot.mag, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
      }
    }
  }

  return {
    state,
    owned,
    step,
    def,
    ammo() { return ammo[state.current]; },
    ready() {
      const slot = ammo[state.current];
      return slot.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const d = def();
      state.cooldown = d.gap;
      state.flash = 0.06;
      state.kick = 0.055;
      state.bloom = Math.min(0.03, state.bloom + d.bloom);
    },
    takeRound() {
      if (ammo[state.current].mag <= 0) return false;
      ammo[state.current].mag -= 1;
      return true;
    },
    reload() {
      const slot = ammo[state.current];
      if (state.reloadLeft > 0 || slot.mag === def().mag || slot.reserve === 0) return;
      state.reloadLeft = def().reload;
    },
    spread(speed, airborne) {
      const d = def();
      const move = Math.min(1, speed / MOVE_REFERENCE) * d.moving;
      return d.still + move + (airborne ? 0.02 : 0) + state.bloom;
    },
    kick() { return def().kick; },
    switchTo(id) {
      if (!owned[id] || id === state.current) return false;
      models[state.current].visible = false;
      state.current = id;
      state.reloadLeft = 0;
      state.cooldown = Math.max(state.cooldown, 0.25);
      models[id].visible = true;
      return true;
    },
    cycle() {
      const ids = Object.keys(WEAPONS).filter((id) => owned[id]);
      const next = ids[(ids.indexOf(state.current) + 1) % ids.length];
      return this.switchTo(next);
    },
    buy(id) {
      owned[id] = true;
      ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      this.switchTo(id);
    },
    refillRound() {
      for (const id of Object.keys(WEAPONS)) {
        ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
  };
}
