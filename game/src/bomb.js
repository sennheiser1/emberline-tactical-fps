// The bomb: carried by the attackers' lead bot, planted at a site over three
// seconds, then a forty-second timer with quickening beeps. Defusing takes four
// seconds of holding still beside it. Plant, defuse and explosion are the
// round's spine; main.js decides the round from what this module reports.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 4;
export const BOMB_SECONDS = 40;

export function createBomb(scene, hooks) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.6, metalness: 0.3 });
  const lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });
  const mesh = new THREE.Group();
  const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.24), bodyMat);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.08), lightMat);
  lamp.position.set(0.1, 0.13, 0);
  mesh.add(boxMesh, lamp);
  mesh.visible = false;
  scene.add(mesh);
  const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  scene.add(light);

  const state = {
    mode: 'carried', // carried | planting | planted | defusing | exploded | defused
    site: null,
    plant: 0,
    defuse: 0,
    timer: BOMB_SECONDS,
    beepAt: 0,
    position: new THREE.Vector3(),
  };

  function setMode(mode) {
    state.mode = mode;
    hooks.onMode(mode, state.site);
  }

  return {
    state,
    mesh,
    reset() {
      state.mode = 'carried';
      state.site = null;
      state.plant = 0;
      state.defuse = 0;
      state.timer = BOMB_SECONDS;
      state.beepAt = 0;
      mesh.visible = false;
      light.intensity = 0;
    },
    follow(position) {
      if (state.mode === 'carried' || state.mode === 'planting') {
        state.position.copy(position);
        mesh.position.set(position.x, 1.35, position.z);
        mesh.visible = true;
      }
    },
    // The carrier stands in a site: progress accumulates, and reaching the top plants.
    plantStep(dt, site, inSite) {
      if (state.mode === 'planted' || state.mode === 'exploded' || state.mode === 'defused') return;
      if (inSite) {
        if (state.mode !== 'planting') { state.mode = 'planting'; state.plant = 0; }
        state.plant = Math.min(1, state.plant + dt / PLANT_SECONDS);
        if (state.plant >= 1) {
          state.site = site;
          state.timer = BOMB_SECONDS;
          mesh.position.set(site.plant.x, 0.12, site.plant.z);
          state.position.copy(mesh.position);
          setMode('planted');
        }
      } else if (state.mode === 'planting') {
        state.mode = 'carried';
        state.plant = 0;
      }
    },
    // The player holds E beside a planted bomb: progress accumulates, and the
    // top defuses it. Moving away or letting go resets the channel.
    defuseStep(dt, holding) {
      if (state.mode !== 'planted' && state.mode !== 'defusing') return;
      if (holding) {
        state.mode = 'defusing';
        state.defuse = Math.min(1, state.defuse + dt / DEFUSE_SECONDS);
        if (state.defuse >= 1) setMode('defused');
      } else if (state.mode === 'defusing') {
        state.mode = 'planted';
        state.defuse = 0;
      }
    },
    step(dt, time) {
      if (state.mode === 'planted' || state.mode === 'defusing') {
        state.timer -= dt;
        const interval = state.timer > 20 ? 1 : state.timer > 10 ? 0.5 : 0.25;
        if (time >= state.beepAt) {
          state.beepAt = time + interval;
          hooks.onBeep();
        }
        lamp.visible = Math.sin(time * 10) > -0.2;
        light.position.copy(mesh.position);
        light.intensity = lamp.visible ? 4 : 0;
        if (state.timer <= 0) {
          setMode('exploded');
          hooks.onExplode(state.position.clone());
          mesh.visible = false;
          light.intensity = 0;
        }
      }
    },
  };
}
