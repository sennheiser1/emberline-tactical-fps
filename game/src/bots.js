// Six bots, two teams. Defenders hold the sites, attackers push routes to one and
// plant. Each bot sees by range, field of view and a line-of-sight ray, hears
// shots and explosions, and resolves its own shots with a real ray against the
// world and the target's body, so cover and distance matter for both sides.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const HEALTH = 100;
const EYE = 1.5;
const CHEST = 1.25;
const HEAD = 1.55;
const SPEED = 3.4;
const HOLD_SPEED = 1.8;
const VISION_RANGE = 32;
const FOV_COS = 0.42;

export function createBots(scene, world, rng, hooks) {
  const atkBody = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7 });
  const atkHead = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5 });
  const defBody = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.7 });
  const defHead = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5 });
  const gunMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.6, metalness: 0.3 });
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.72, 0.3);
  const headGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const legGeo = new THREE.BoxGeometry(0.18, 0.62, 0.18);
  const gunGeo = new THREE.BoxGeometry(0.08, 0.1, 0.55);
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();
  const tmpD = new THREE.Vector3();
  const probe = new THREE.Box3();
  const bots = [];
  const hitMeshes = [];
  let frozen = true;

  function buildBot(team, name, spawn) {
    const group = new THREE.Group();
    group.position.copy(spawn);
    const bodyMat = team === 'atk' ? atkBody : defBody;
    const headMat = team === 'atk' ? atkHead : defHead;
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 1.08;
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = HEAD;
    const legL = new THREE.Mesh(legGeo, bodyMat);
    legL.position.set(-0.14, 0.31, 0);
    const legR = new THREE.Mesh(legGeo, bodyMat);
    legR.position.set(0.14, 0.31, 0);
    const gun = new THREE.Mesh(gunGeo, gunMat);
    gun.position.set(0.22, 1.15, -0.3);
    group.add(torso, head, legL, legR, gun);
    group.traverse((mesh) => { if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
    scene.add(group);
    const bot = {
      team, name, group, torso, head, legL, legR, health: HEALTH, alive: true,
      yaw: team === 'atk' ? Math.PI : 0, route: [], routeIndex: 0, hold: null,
      state: 'advance', target: null, react: 0, scan: rng() * 0.15, burst: 0, burstAt: 0,
      alert: null, fall: 0, walk: rng() * 6, carrier: false, home: spawn.clone(),
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  const defNames = ['Wren', 'Onyx'];
  const atkNames = ['Fable', 'Rook', 'Sable', 'Ivo'];
  for (let i = 0; i < 2; i += 1) buildBot('def', defNames[i], world.spawns.def[i + 1]);
  for (let i = 0; i < 4; i += 1) buildBot('atk', atkNames[i], world.spawns.atk[i]);

  function overlaps(x, z) {
    probe.min.set(x - 0.34, 0.04, z - 0.34);
    probe.max.set(x + 0.34, 1.68, z + 0.34);
    for (const c of world.colliders) if (probe.intersectsBox(c)) return true;
    return false;
  }

  function blocked(from, to) {
    tmpA.subVectors(to, from);
    const dist = tmpA.length();
    raycaster.set(from, tmpA.normalize());
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return Boolean(hit && hit.distance < dist - 0.4);
  }

  function eyeOf(bot) { return tmpB.set(bot.group.position.x, EYE, bot.group.position.z); }

  function canSee(bot, pos, chestY) {
    tmpA.set(pos.x, chestY, pos.z);
    tmpC.subVectors(tmpA, eyeOf(bot));
    const dist = tmpC.length();
    if (dist > VISION_RANGE) return false;
    tmpC.normalize();
    const facing = Math.sin(bot.yaw) * -tmpC.x + Math.cos(bot.yaw) * -tmpC.z;
    if (dist > 6 && facing < FOV_COS) return false;
    return !blocked(eyeOf(bot), tmpA);
  }

  // A bot's shot: a ray with spread from its eye. Cover blocks it; a ray passing
  // close to the chest or head hits, with the head worth far more.
  function fireAt(bot, targetPos, onHit) {
    tmpA.set(targetPos.x, CHEST, targetPos.z);
    tmpC.subVectors(tmpA, eyeOf(bot)).normalize();
    const spread = 0.035;
    tmpC.x += (rng() * 2 - 1) * spread;
    tmpC.y += (rng() * 2 - 1) * spread;
    tmpC.z += (rng() * 2 - 1) * spread;
    tmpC.normalize();
    raycaster.set(eyeOf(bot), tmpC);
    const dist = eyeOf(bot).distanceTo(tmpA);
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    if (hit && hit.distance < dist - 0.4) return;
    const t = Math.max(0, tmpD.copy(tmpA).sub(eyeOf(bot)).dot(tmpC));
    tmpB.copy(eyeOf(bot)).addScaledVector(tmpC, t);
    const chestMiss = Math.hypot(tmpB.x - tmpA.x, tmpB.y - tmpA.y, tmpB.z - tmpA.z);
    const headMiss = Math.hypot(tmpB.x - tmpA.x, tmpB.y - HEAD, tmpB.z - tmpA.z);
    if (headMiss < 0.28) onHit(26, true);
    else if (chestMiss < 0.55) onHit(10 + rng() * 5, false);
  }

  function moveToward(bot, dt, point, speed) {
    const p = bot.group.position;
    const dx = point.x - p.x;
    const dz = point.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const step = Math.min(dist, speed * dt);
    const nx = p.x + (dx / dist) * step;
    const nz = p.z + (dz / dist) * step;
    if (!overlaps(nx, p.z)) p.x = nx;
    if (!overlaps(p.x, nz)) p.z = nz;
    for (const other of bots) {
      if (other === bot || !other.alive) continue;
      const ox = p.x - other.group.position.x;
      const oz = p.z - other.group.position.z;
      const od = Math.hypot(ox, oz);
      if (od > 0.01 && od < 0.8) { p.x += (ox / od) * 0.06; p.z += (oz / od) * 0.06; }
    }
    bot.yaw = Math.atan2(-dx, -dz);
    bot.walk += dt * 7;
    return dist < 1.2;
  }

  function pickTarget(bot, ctx) {
    const foes = [];
    if (ctx.playerAlive) foes.push({ kind: 'player', pos: ctx.playerPos });
    for (const other of bots) {
      if (other.alive && other.team !== bot.team) foes.push({ kind: 'bot', bot: other, pos: other.group.position });
    }
    let best = null;
    let bestDist = Infinity;
    for (const foe of foes) {
      const d = bot.group.position.distanceTo(foe.pos);
      if (d < bestDist && canSee(bot, foe.pos, CHEST)) { best = foe; bestDist = d; }
    }
    return best;
  }

  function stepBot(bot, dt, ctx) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    bot.scan -= dt;
    if (bot.scan <= 0) {
      bot.scan = 0.15;
      const seen = pickTarget(bot, ctx);
      if (seen && !bot.target) bot.react = 0.35 + rng() * 0.25;
      if (!seen) bot.target = null;
      else if (!bot.target) bot.target = seen;
      else bot.target = seen;
    }
    if (bot.target) {
      const tp = bot.target.pos;
      tmpA.set(tp.x - bot.group.position.x, 0, tp.z - bot.group.position.z);
      bot.yaw = Math.atan2(-tmpA.x, -tmpA.z);
      bot.react -= dt;
      if (bot.react <= 0) {
        bot.burstAt -= dt;
        if (bot.burstAt <= 0) {
          if (bot.burst <= 0) { bot.burst = 3 + Math.floor(rng() * 3); bot.burstAt = 0.5 + rng() * 0.4; }
          else {
            bot.burst -= 1;
            bot.burstAt = 0.11;
            hooks.onBotShot(bot);
            if (bot.target.kind === 'player') {
              fireAt(bot, ctx.playerPos, (amount, head) => hooks.onDamagePlayer(amount, bot, head));
            } else if (bot.target.bot.alive) {
              const foe = bot.target.bot;
              fireAt(bot, foe.group.position, (amount, head) => damage(foe, amount * (head ? 2 : 1), false, bot));
            }
          }
        }
      }
      // Engaged bots strafe a little instead of standing still.
      bot.group.position.x += Math.sin(ctx.time * 1.7 + bot.walk) * dt * 0.4;
      return;
    }
    if (bot.alert && !bot.hold) {
      if (moveToward(bot, dt, bot.alert, SPEED)) bot.alert = null;
      return;
    }
    if (bot.routeIndex < bot.route.length) {
      if (moveToward(bot, dt, bot.route[bot.routeIndex], SPEED)) bot.routeIndex += 1;
      return;
    }
    // Holding: slow scan, ready to react.
    bot.yaw += Math.sin(ctx.time * 0.5 + bot.walk) * dt * 0.4;
    bot.group.rotation.y = bot.yaw;
  }

  function damage(bot, amount, byPlayer, attacker) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.fall = 0;
    bot.target = null;
    hooks.onBotKilled(bot, byPlayer, attacker);
    return true;
  }

  return {
    bots,
    hitMeshes,
    setFrozen(value) { frozen = value; },
    step(dt, ctx) {
      for (const bot of bots) {
        if (frozen && bot.alive) continue;
        stepBot(bot, dt, ctx);
        bot.group.rotation.y = bot.yaw;
        const swinging = bot.alive && !frozen && bot.routeIndex < bot.route.length;
        bot.legL.rotation.x = swinging ? Math.sin(bot.walk) * 0.5 : 0;
        bot.legR.rotation.x = swinging ? -Math.sin(bot.walk) * 0.5 : 0;
      }
    },
    hear(pos, radius) {
      for (const bot of bots) {
        if (!bot.alive || bot.target) continue;
        if (bot.group.position.distanceTo(pos) < radius) bot.alert = pos.clone();
      }
    },
    damage,
    remaining(team) { return bots.filter((b) => b.alive && b.team === team).length; },
    carrier() { return bots.find((b) => b.carrier); },
    reset(site) {
      const atk = bots.filter((b) => b.team === 'atk');
      const def = bots.filter((b) => b.team === 'def');
      const routes = site === 'A'
        ? [world.routes.atkToA, world.routes.atkMid, world.routes.atkToA, world.routes.atkToB]
        : [world.routes.atkToB, world.routes.atkMid, world.routes.atkToB, world.routes.atkToA];
      atk.forEach((bot, i) => {
        bot.group.position.copy(world.spawns.atk[i]);
        bot.health = HEALTH; bot.alive = true; bot.fall = 0; bot.target = null; bot.alert = null;
        bot.route = routes[i]; bot.routeIndex = 0; bot.carrier = i === 0; bot.yaw = Math.PI;
        bot.group.rotation.set(0, bot.yaw, 0);
      });
      const defRoutes = [world.routes.defA, world.routes.defB];
      def.forEach((bot, i) => {
        bot.group.position.copy(world.spawns.def[i + 1]);
        bot.health = HEALTH; bot.alive = true; bot.fall = 0; bot.target = null; bot.alert = null;
        bot.route = defRoutes[i]; bot.routeIndex = 0; bot.carrier = false; bot.yaw = 0;
        bot.group.rotation.set(0, 0, 0);
      });
    },
    rotateTo(site) {
      for (const bot of bots) {
        if (!bot.alive || bot.team !== 'def') continue;
        bot.route = site === 'A' ? world.routes.toA : world.routes.toB;
        bot.routeIndex = 0;
        bot.alert = null;
      }
    },
    aimPoint(index) {
      const bot = bots[index % bots.length];
      return new THREE.Vector3(bot.group.position.x, CHEST, bot.group.position.z);
    },
  };
}
