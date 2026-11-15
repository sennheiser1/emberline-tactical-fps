// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display
// rate. Input edges and firing are handled per frame; the round, bots, grenades
// and bomb advance only inside the fixed step. ?shot=start|play|buy|end with
// &seed=N sets up a deterministic frame, renders it twice, then freezes it and
// sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS, GRENADE_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createGrenades } from './grenades.js';
import { createBomb } from './bomb.js';
import { createMatch } from './match.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 78);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(world.colliders);
const weapons = createWeapons(camera);
const body = player.state;
body.position.copy(world.spawns.def[0]);

let currentSite = 'A';
const match = createMatch({
  onRoundStart(round) { resetRound(round); },
  onLive() {
    bots.setFrozen(false);
    hud.hideBuy();
    hud.banner(`Round ${match.state.round} — live`);
  },
  onRoundEnd(winner, reason) {
    bots.setFrozen(true);
    hud.hideBuy();
    hud.banner(reason, 3400);
    if (winner === 'def') audio.roundWin();
  },
  onMatchEnd(winner) {
    frozen = true;
    if (document.pointerLockElement) document.exitPointerLock();
    hud.showOverlay('end', {
      won: winner === 'def',
      detail: `Final score ${match.state.wins.def} – ${match.state.wins.atk}. You had ${match.state.kills} kills.`,
    });
  },
});

const bots = createBots(scene, world, random, {
  onBotShot(bot) { bots.hear(bot.group.position, 18); },
  onDamagePlayer(amount, bot, head) { damagePlayer(amount, bot, head); },
  onBotKilled(bot, byPlayer, attacker) {
    const killer = byPlayer ? 'You' : (attacker ? attacker.name : bot.name);
    hud.feed(`${killer} eliminated ${bot.name}`);
    if (byPlayer) {
      match.rewardKill();
      audio.kill();
    }
  },
});
const grenades = createGrenades(scene, {
  onExplode(position) {
    audio.explosion();
    bots.hear(position, 32);
    shake = Math.max(shake, 0.5);
  },
  targets() {
    const victims = [];
    if (match.state.alive) victims.push({ pos: body.position, damage: (amount) => damagePlayer(amount, null, false) });
    for (const bot of bots.bots) {
      if (bot.alive) victims.push({ pos: bot.group.position, damage: (amount) => bots.damage(bot, amount, true, null) });
    }
    return victims;
  },
});
const bomb = createBomb(scene, {
  onMode(mode, site) {
    if (mode === 'planted') {
      match.plant(currentSite);
      bots.rotateTo(currentSite);
      hud.banner(`Bomb planted at site ${currentSite}!`, 3400);
      audio.plant();
    } else if (mode === 'defused') {
      match.endRound('def', 'Bomb defused. Round to the defenders.');
    } else if (mode === 'exploded') {
      shake = Math.max(shake, 0.8);
      audio.explosion();
      match.endRound('atk', 'The bomb exploded. Round to the attackers.');
    }
  },
  onBeep() { audio.beep(); },
  onExplode() {},
});

const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const shootTargets = world.shootables.concat(bots.hitMeshes);
const direction = new THREE.Vector3();
const origin = new THREE.Vector3();

const markerHoldMs = shot ? 4000 : 90;
let elapsed = 0;
let frozen = false;
let started = false;
let shake = 0;
let accumulator = 0;
let lastTime = performance.now();

function siteForRound(round) { return round % 2 === 1 ? 'A' : 'B'; }

function resetRound(round) {
  currentSite = siteForRound(round);
  bots.reset(currentSite);
  bots.setFrozen(true);
  grenades.reset();
  bomb.reset();
  weapons.refillRound();
  body.position.copy(world.spawns.def[0]);
  body.velocity.set(0, 0, 0);
  body.yaw = 0;
  body.pitch = 0;
  syncCamera();
  hud.banner(`Round ${round} — buy phase`, 2600);
  if (!shot) hud.showBuy(match.state.money, weapons.owned, weapons.state.grenades);
}

function damagePlayer(amount, bot, head) {
  if (shot) return; // staged captures keep the player standing
  if (!match.state.alive) return;
  const died = match.damage(Math.round(amount));
  hud.damageFlash();
  shake = Math.max(shake, 0.15);
  if (died && bot) hud.feed(`${bot.name} eliminated You`);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    frozen = false;
    hud.hideOverlay();
    audio.resume();
  } else if (started && !match.state.matchWinner) {
    frozen = true;
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.ensure();
  if (match.state.matchWinner) {
    weapons.owned.smg = false;
    weapons.owned.rifle = false;
    weapons.switchTo('pistol');
    weapons.state.grenades = 1;
    match.reset();
  }
  input.requestLock();
});

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  if (!weapons.takeRound()) return;
  const def = weapons.def();
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootTargets, false)[0];
  if (hit && hit.object.userData.bot) {
    const bot = hit.object.userData.bot;
    const killed = bots.damage(bot, hit.object.userData.part === 'head' ? def.head : def.damage, true, null);
    hud.hitMarker(killed, markerHoldMs);
    audio.hit();
  }
  weapons.pullTrigger();
  audio.shot();
  bots.hear(body.position, 28);
  player.recoil(def.kick + random() * 0.004, (random() * 2 - 1) * 0.004);
}

function defAliveTotal() {
  return (match.state.alive ? 1 : 0) + bots.remaining('def');
}

function checkRoundEnd() {
  if (match.state.phase !== 'live') return;
  if (match.state.bombPlanted) {
    if (defAliveTotal() === 0) match.endRound('atk', 'All defenders eliminated.');
  } else {
    if (bots.remaining('atk') === 0) match.endRound('def', 'All attackers eliminated.');
    else if (defAliveTotal() === 0) match.endRound('atk', 'All defenders eliminated.');
  }
}

function step(dt) {
  elapsed += dt;
  shake = Math.max(0, shake - dt * 1.4);
  match.step(dt);
  if (match.state.phase === 'live' && match.state.alive) player.step(dt, input.state.keys);
  weapons.step(dt);
  // The bomb carrier: if it falls, the nearest living attacker picks the bomb up.
  let carrier = bots.carrier();
  if ((bomb.state.mode === 'carried' || bomb.state.mode === 'planting') && (!carrier || !carrier.alive)) {
    let best = null;
    let bestDist = Infinity;
    for (const bot of bots.bots) {
      if (!bot.alive || bot.team !== 'atk') continue;
      const d = bot.group.position.distanceTo(bomb.state.position);
      if (d < bestDist) { best = bot; bestDist = d; }
    }
    if (best) { best.carrier = true; carrier = best; }
  }
  if (carrier && carrier.alive) {
    bomb.follow(carrier.group.position);
    const site = world.sites[currentSite];
    const p = carrier.group.position;
    const inSite = p.x >= site.minX && p.x <= site.maxX && p.z >= site.minZ && p.z <= site.maxZ;
    if (match.state.phase === 'live') bomb.plantStep(dt, site, inSite);
  }
  bots.step(dt, { playerPos: body.position, playerAlive: match.state.alive, time: elapsed });
  grenades.step(dt);
  if (match.state.phase === 'live') bomb.step(dt, elapsed);
  // Defusing: hold E beside a planted bomb.
  if ((bomb.state.mode === 'planted' || bomb.state.mode === 'defusing') && match.state.alive) {
    const near = Math.hypot(body.position.x - bomb.state.position.x, body.position.z - bomb.state.position.z) < 2.5;
    const holding = near && input.state.keys.has('KeyE');
    bomb.defuseStep(dt, holding);
    hud.setProgress(near ? bomb.state.defuse : null, 'Defusing…');
    hud.setHint(near ? 'Hold E to defuse' : null);
  } else {
    hud.setProgress(null);
    hud.setHint(null);
  }
  checkRoundEnd();
}

function syncHud() {
  const slot = weapons.ammo();
  hud.setAmmo(slot.mag, slot.reserve);
  hud.setWeapon(weapons.def().name);
  hud.setHealth(match.state.health);
  hud.setMoney(match.state.money);
  hud.setScore(match.state.wins.def, match.state.wins.atk);
  hud.setRound(match.state.round);
  hud.setKills(match.state.kills);
  hud.setGrenades(weapons.state.grenades);
  const planted = match.state.bombPlanted && (bomb.state.mode === 'planted' || bomb.state.mode === 'defusing');
  hud.setTimer(planted ? bomb.state.timer : match.state.phaseLeft, planted);
  const bombText = {
    carried: 'Bomb carried',
    planting: 'Bomb planting…',
    planted: `Planted ${currentSite} — defuse it!`,
    defusing: 'Defusing…',
    defused: 'Bomb defused',
    exploded: 'Bomb exploded',
  }[bomb.state.mode];
  hud.setBomb(bombText, bomb.state.mode === 'planted');
  hud.setCrosshairGap(6 + weapons.spread(player.groundSpeed(), !body.onGround) * 380);
}

function handleBuyKey(code) {
  const money = match.state.money;
  if (code === 'Digit1') {
    weapons.switchTo('pistol');
  } else if (code === 'Digit2') {
    if (weapons.owned.smg) weapons.switchTo('smg');
    else if (match.spend(WEAPONS.smg.price)) weapons.buy('smg');
  } else if (code === 'Digit3') {
    if (weapons.owned.rifle) weapons.switchTo('rifle');
    else if (match.spend(WEAPONS.rifle.price)) weapons.buy('rifle');
  } else if (code === 'Digit4') {
    if (weapons.state.grenades < 2 && match.spend(GRENADE_PRICE)) weapons.state.grenades += 1;
  }
  hud.showBuy(match.state.money, weapons.owned, weapons.state.grenades);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen && started) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const clicked = input.takeClick();
    const phase = match.state.phase;
    const canAct = (phase === 'live' || phase === 'buy') && match.state.alive;
    if (input.wasPressed('KeyB') && phase === 'buy') {
      if (hud.isBuyOpen()) hud.hideBuy();
      else hud.showBuy(match.state.money, weapons.owned, weapons.state.grenades);
    }
    if (hud.isBuyOpen() && phase === 'buy') {
      for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4']) {
        if (input.wasPressed(code)) handleBuyKey(code);
      }
    }
    if (input.wasPressed('KeyQ') && canAct) weapons.cycle();
    if (input.wasPressed('KeyR') && canAct) {
      const before = weapons.state.reloadLeft;
      weapons.reload();
      if (weapons.state.reloadLeft > 0 && before === 0) audio.reload();
    }
    if (input.wasPressed('KeyG') && canAct && weapons.state.grenades > 0) {
      camera.getWorldDirection(direction);
      origin.copy(camera.position);
      if (grenades.throwFrom(origin, direction)) weapons.state.grenades -= 1;
    }
    const def = weapons.def();
    const wantFire = def.auto ? input.state.firing : clicked;
    if (wantFire && canAct && weapons.ready()) {
      shoot(weapons.spread(player.groundSpeed(), !body.onGround));
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    if (shake > 0) {
      camera.position.x += (random() * 2 - 1) * shake * 0.05;
      camera.position.y += (random() * 2 - 1) * shake * 0.05;
    }
    syncHud();
    input.endFrame();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

const SHOT_FILES = { start: '1-start.jpg', play: '2-play.jpg', buy: '3-buy.jpg', end: '4-end.jpg' };

function runShot(name) {
  started = true;
  renderer.setPixelRatio(1);
  renderer.setSize(1280, 720);
  camera.aspect = 1280 / 720;
  camera.updateProjectionMatrix();
  hud.hideOverlay();
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    body.position.copy(world.spawns.def[0]);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showOverlay('start');
  } else if (name === 'buy') {
    body.position.copy(world.spawns.def[0]);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showBuy(match.state.money, weapons.owned, weapons.state.grenades);
  } else if (name === 'play') {
    match.state.phase = 'live';
    match.state.phaseLeft = 60;
    bots.setFrozen(false);
    body.position.set(0, 0, 8);
    settle(360);
    const foe = bots.bots.find((bot) => bot.alive && bot.team === 'atk');
    if (foe) {
      aimAt(new THREE.Vector3(foe.group.position.x, 1.25, foe.group.position.z));
      shoot(0);
    }
    settle(2);
  } else {
    match.state.phase = 'end';
    match.state.phaseLeft = 3;
    match.state.wins.def = 1;
    let felled = 0;
    for (const bot of bots.bots) {
      if (bot.team === 'atk' && felled < 2) {
        bot.alive = false;
        bot.fall = 1;
        bot.group.rotation.x = -1.45;
        felled += 1;
      }
    }
    body.position.set(-8, 0, -3);
    settle(10);
    aimAt(new THREE.Vector3(-14, 1, -10.5));
    hud.banner('Round won — all attackers eliminated.', 60000);
  }
  syncHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      // Capture the rendered frame plus the HUD, composited by the game's own
      // code in this same frame: the canvas alone cannot carry the DOM HUD.
      const frame = document.createElement('canvas');
      frame.width = 1280;
      frame.height = 720;
      const fctx = frame.getContext('2d');
      fctx.drawImage(renderer.domElement, 0, 0, 1280, 720);
      hud.drawShot(fctx, 1280, 720, shot);
      frame.toBlob((blob) => {
        if (!blob) return;
        const link = document.createElement('a');
        link.id = 'shot-download';
        link.href = URL.createObjectURL(blob);
        link.download = SHOT_FILES[shot] || 'shot.jpg';
        link.textContent = 'Download screenshot';
        link.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9;background:#000;color:#fff;padding:8px 12px;font:14px sans-serif;';
        document.body.appendChild(link);
      }, 'image/jpeg', 0.82);
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

match.startRound();
syncCamera();
syncHud();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
