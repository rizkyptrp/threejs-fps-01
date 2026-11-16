// Bot agents: three Sandline allies and five Jackal defenders. One module owns
// bot bodies, waypoint pathfinding (BFS), perception (FOV + line of sight),
// hearing (gunshots pull nearby bots toward the noise), flash blindness, and
// the combat loop (reaction time, burst fire, aim error). main.js owns the ray
// and the damage; bots only decide when and where to shoot.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { PATROLS } from './map.js';
import { hasLineOfSight, slideMove } from './los.js';

const EYE = 1.5;
const CHEST = 1.05;
const RADIUS = 0.34;
const HEIGHT = 1.72;
const WALK_SPEED = 4.3;
const SEE_DIST = 48;
const FOV_COS = Math.cos(0.96); // ~55 degrees half-angle
const HEAR_DIST = 26;
const BOT_WEAPON = { damage: 28, headMul: 3, range: 60, gap: 0.11 };

function bfsPath(neighbors, from, to) {
  if (from === to) return [to];
  const prev = new Array(neighbors.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length) {
    const node = queue.shift();
    for (const next of neighbors[node]) {
      if (prev[next] === -1) {
        prev[next] = node;
        if (next === to) {
          const path = [to];
          let at = to;
          while (at !== from) {
            at = prev[at];
            path.unshift(at);
          }
          return path;
        }
        queue.push(next);
      }
    }
  }
  return [from];
}

export function createBots(scene, world) {
  const colliders = world.colliders;
  const nodes = world.waypoints.nodes;
  const neighbors = world.waypoints.neighbors;

  const allyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), roughness: 0.6, metalness: 0.05 });
  const allyHeadMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.1 });
  const enemyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.6, metalness: 0.05 });
  const enemyHeadMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.45, metalness: 0.1 });
  const legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.85 });
  const gunMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });

  const torsoGeo = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeo = new THREE.SphereGeometry(0.155, 16, 12);
  const legGeo = new THREE.BoxGeometry(0.18, 0.5, 0.2);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.6);

  const bots = [];
  const hitMeshes = [];
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();

  function buildMesh(team) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeo, team === 'sandline' ? allyMat : enemyMat);
    torso.position.y = 1.0;
    const head = new THREE.Mesh(headGeo, team === 'sandline' ? allyHeadMat : enemyHeadMat);
    head.position.y = 1.53;
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.13, 0.25, 0);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.13, 0.25, 0);
    const gun = new THREE.Mesh(gunGeo, gunMat);
    gun.position.set(0.28, 1.25, -0.25);
    // A small team-coloured shoulder stripe so the two sides read at a glance.
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.54, 0.1, 0.32),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'sandline' ? PALETTE.accent : PALETTE.rust), roughness: 0.5, emissive: new THREE.Color(team === 'sandline' ? PALETTE.accent : PALETTE.rust), emissiveIntensity: 0.35 }),
    );
    stripe.position.y = 1.32;
    group.add(torso, head, legL, legR, gun, stripe);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return { group, torso, head, gun };
  }

  function nearestNode(x, z) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const dx = nodes[i][0] - x;
      const dz = nodes[i][1] - z;
      const d = dx * dx + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  function createBot(id, team, name, role, spawn) {
    const parts = buildMesh(team);
    scene.add(parts.group);
    const bot = {
      id, team, name, role,
      pos: new THREE.Vector3(spawn[0], 0, spawn[1]),
      vel: new THREE.Vector3(),
      yaw: team === 'sandline' ? -Math.PI / 2 : Math.PI / 2,
      pitch: 0,
      health: 100,
      armor: 0,
      alive: true,
      hasBomb: false,
      fall: 0,
      path: [],
      pathGoal: -1,
      patrolIndex: 0,
      target: null, // { kind: 'player' | 'bot', ref, pos, speed }
      targetSeenAt: 0,
      reactAt: 0,
      scanAt: Math.random() * 0.12,
      burstLeft: 0,
      burstPause: 0,
      strafeDir: 1,
      strafeAt: 0,
      stuckAt: 0,
      lastPos: new THREE.Vector3(spawn[0], 0, spawn[1]),
      plantProgress: 0,
      defuseProgress: 0,
      channel: null, // 'plant' | 'defuse'
      blindUntil: 0,
      heard: null, // { x, z, until }
      parts,
      hitMeshes: [parts.torso, parts.head],
    };
    parts.torso.userData.bot = bot;
    parts.torso.userData.part = 'torso';
    parts.head.userData.bot = bot;
    parts.head.userData.part = 'head';
    hitMeshes.push(parts.torso, parts.head);
    bots.push(bot);
    return bot;
  }

  function spawnRound(roles) {
    // roles: [{ team, name, role, spawn }]
    for (const bot of bots) bot.parts.group.visible = false;
    bots.length = 0;
    hitMeshes.length = 0;
    for (let i = 0; i < roles.length; i += 1) {
      const r = roles[i];
      createBot(i, r.team, r.name, r.role, r.spawn);
    }
  }

  function repath(bot, goalNode) {
    const from = nearestNode(bot.pos.x, bot.pos.z);
    bot.path = bfsPath(neighbors, from, goalNode);
    bot.pathGoal = goalNode;
    if (bot.path.length && bot.path[0] === from) bot.path.shift();
  }

  function moveToward(bot, dt, tx, tz, speed) {
    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const s = Math.min(speed, dist / dt);
    bot.vel.x = (dx / dist) * s;
    bot.vel.z = (dz / dist) * s;
    bot.vel.y = 0;
    const targetYaw = Math.atan2(-dx, -dz);
    let diff = targetYaw - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-6 * dt, Math.min(6 * dt, diff));
    slideMove(bot.pos, bot.vel, dt, colliders, RADIUS, HEIGHT);
    return dist < 0.7;
  }

  function visibleEnemy(bot, ctx) {
    // Returns the nearest visible enemy or null. Player first, then enemy bots.
    let best = null;
    let bestDist = SEE_DIST;
    const candidates = [];
    if (ctx.player.alive) candidates.push({ kind: 'player', ref: ctx.player, pos: ctx.player.pos, speed: ctx.player.speed || 0 });
    for (const other of bots) {
      if (other.alive && other.team !== bot.team) {
        candidates.push({ kind: 'bot', ref: other, pos: other.pos, speed: Math.hypot(other.vel.x, other.vel.z) });
      }
    }
    for (const cand of candidates) {
      const dx = cand.pos.x - bot.pos.x;
      const dz = cand.pos.z - bot.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bestDist) continue;
      const fx = -Math.sin(bot.yaw);
      const fz = -Math.cos(bot.yaw);
      const dot = (dx * fx + dz * fz) / (dist || 1);
      if (dot < FOV_COS) continue;
      if (!hasLineOfSight(bot.pos.x, EYE, bot.pos.z, cand.pos.x, EYE, cand.pos.z, colliders)) continue;
      best = cand;
      bestDist = dist;
    }
    return best;
  }

  function patrolFor(bot) {
    if (bot.role === 'holdA') return PATROLS.holdA;
    if (bot.role === 'holdB') return PATROLS.holdB;
    if (bot.role === 'roamA') return PATROLS.roamA;
    if (bot.role === 'roamB') return PATROLS.roamB;
    return PATROLS.holdA;
  }

  function goalNodeFor(bot, ctx) {
    if (bot.channel) return -1;
    if (bot.team === 'jackals') {
      if (ctx.bomb.state === 'planted') return ctx.bomb.site === 'A' ? 26 : 27;
      // A heard gunshot pulls the nearest defenders toward the noise.
      if (bot.heard && ctx.time < bot.heard.until) return nearestNode(bot.heard.x, bot.heard.z);
      const loop = patrolFor(bot);
      return loop[bot.patrolIndex % loop.length];
    }
    // Sandline allies push the called site; the carrier leads.
    if (bot.hasBomb) return ctx.targetSite === 'A' ? 26 : 27;
    if (ctx.bomb.state === 'planted') return ctx.bomb.site === 'A' ? 26 : 27;
    if (bot.heard && ctx.time < bot.heard.until) return nearestNode(bot.heard.x, bot.heard.z);
    return ctx.targetSite === 'A' ? 26 : 27;
  }

  function step(dt, time, ctx) {
    // Combat only happens in the round: the buy phase is for positioning,
    // not for dying — without this gate, bots gun each other down before the
    // round clock even starts and a defender pulled west by buy-phase noise
    // can be waiting on the attacker's spawn when the round opens.
    const canFight = ctx.phase === 'round';
    // Hearing: gunshots heard this step pull bots within HEAR_DIST toward the noise.
    for (const noise of canFight ? ctx.noises : []) {
      for (const bot of bots) {
        if (!bot.alive || bot.target) continue;
        const d = Math.hypot(bot.pos.x - noise.x, bot.pos.z - noise.z);
        if (d < HEAR_DIST) bot.heard = { x: noise.x, z: noise.z, until: time + 4 };
      }
    }

    for (const bot of bots) {
      if (!bot.alive) {
        if (bot.fall < 1) {
          bot.fall = Math.min(1, bot.fall + dt / 0.4);
          bot.parts.group.rotation.x = -bot.fall * 1.45;
        }
        continue;
      }
      const blinded = time < bot.blindUntil;
      // Perception, staggered. Compare the underlying entity (ref), not the
      // fresh wrapper visibleEnemy builds per scan: otherwise the reaction
      // timer resets on every scan and the bot never fires.
      if (canFight && time >= bot.scanAt && !blinded) {
        bot.scanAt = time + 0.12 + Math.random() * 0.05;
        const seen = visibleEnemy(bot, ctx);
        if (seen && (!bot.target || bot.target.ref !== seen.ref)) {
          bot.target = seen;
          bot.targetSeenAt = time;
          bot.reactAt = time + 0.25 + Math.random() * 0.2;
          bot.burstLeft = 0;
          bot.burstPause = 0.3;
        } else if (!seen) {
          bot.target = null;
        }
      }
      const target = blinded ? null : bot.target;
      const inSite = ctx.bomb.state === 'carried' && bot.hasBomb
        && Math.hypot(bot.pos.x - ctx.sitePos.x, bot.pos.z - ctx.sitePos.z) < 3.2;
      const atPlanted = ctx.bomb.state === 'planted' && bot.team === 'jackals'
        && Math.hypot(bot.pos.x - ctx.bomb.pos.x, bot.pos.z - ctx.bomb.pos.z) < 2.5;

      // Channels: planting (carrier in site) and defusing (defender at planted charge).
      if (canFight && inSite && bot.team === 'sandline' && !blinded) {
        bot.channel = 'plant';
        bot.plantProgress += dt / 3;
        bot.vel.set(0, 0, 0);
        if (bot.plantProgress >= 1) ctx.onPlantDone(bot);
      } else if (canFight && atPlanted && !blinded) {
        bot.channel = 'defuse';
        bot.defuseProgress += dt / 5;
        bot.vel.set(0, 0, 0);
        if (bot.defuseProgress >= 1) ctx.onDefuseDone(bot);
      } else {
        bot.channel = null;
        bot.plantProgress = 0;
        bot.defuseProgress = 0;
      }

      // Combat: face and fire at a visible target.
      if (canFight && target && time >= bot.reactAt && !bot.channel) {
        const tx = target.pos.x;
        const tz = target.pos.z;
        const dx = tx - bot.pos.x;
        const dz = tz - bot.pos.z;
        const dist = Math.hypot(dx, dz);
        const targetYaw = Math.atan2(-dx, -dz);
        let diff = targetYaw - bot.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        bot.yaw += Math.max(-7 * dt, Math.min(7 * dt, diff));
        // Strafe while engaging.
        if (time >= bot.strafeAt) {
          bot.strafeAt = time + 1 + Math.random();
          bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
        }
        const moving = dist > 26;
        if (moving) {
          const sx = Math.cos(bot.yaw) * bot.strafeDir;
          const sz = -Math.sin(bot.yaw) * bot.strafeDir;
          bot.vel.x = sx * 2.2;
          bot.vel.z = sz * 2.2;
          bot.vel.y = 0;
          slideMove(bot.pos, bot.vel, dt, colliders, RADIUS, HEIGHT);
        } else {
          bot.vel.set(0, 0, 0);
        }
        // Burst fire.
        if (bot.burstPause > 0) {
          bot.burstPause -= dt;
        } else if (bot.burstLeft > 0) {
          bot.burstLeft -= 1;
          ctx.shoot(bot, target, dist, moving);
          if (bot.burstLeft === 0) bot.burstPause = 0.55 + Math.random() * 0.4;
        } else {
          bot.burstLeft = 3 + Math.floor(Math.random() * 3);
          bot.burstPause = 0.08;
        }
      } else if (!bot.channel) {
        // Navigate: patrol or push to the goal node.
        const goal = goalNodeFor(bot, { ...ctx, time });
        if (goal >= 0) {
          if (goal !== bot.pathGoal || !bot.path.length) {
            repath(bot, goal);
          }
          // Already standing on the goal node: the path comes back empty,
          // which used to deadlock the patrol (the bot never advanced).
          // Patrol bots move on to the next node; push bots hold the site.
          if (!bot.path.length && bot.team === 'jackals' && ctx.bomb.state !== 'planted') {
            bot.patrolIndex += 1;
            const next = goalNodeFor(bot, { ...ctx, time });
            if (next >= 0 && next !== goal) repath(bot, next);
          }
          if (bot.path.length) {
            const [nx, nz] = nodes[bot.path[0]];
            if (moveToward(bot, dt, nx, nz, WALK_SPEED)) {
              bot.path.shift();
              if (!bot.path.length && bot.team === 'jackals' && ctx.bomb.state !== 'planted') {
                bot.patrolIndex += 1;
              }
            }
          }
          // Stuck detection: no progress toward the waypoint.
          if (bot.pos.distanceToSquared(bot.lastPos) > 0.04) {
            bot.lastPos.copy(bot.pos);
            bot.stuckAt = time;
          } else if (time - bot.stuckAt > 2) {
            bot.path = [];
            bot.pathGoal = -1;
            bot.stuckAt = time;
            bot.lastPos.copy(bot.pos);
          }
        } else {
          bot.vel.set(0, 0, 0);
        }
      }

      // Sync the mesh.
      bot.parts.group.position.copy(bot.pos);
      bot.parts.group.rotation.y = bot.yaw;
    }

    // Separation: keep bodies from stacking.
    for (let i = 0; i < bots.length; i += 1) {
      const a = bots[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < bots.length; j += 1) {
        const b = bots[j];
        if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.64 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (0.8 - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          a.pos.x -= nx * push;
          a.pos.z -= nz * push;
          b.pos.x += nx * push;
          b.pos.z += nz * push;
        }
      }
    }
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    let remaining = amount;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, remaining * 0.5);
      bot.armor -= absorbed;
      remaining -= absorbed;
    }
    bot.health -= remaining;
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.fall = 0;
      bot.channel = null;
      return true;
    }
    return false;
  }

  return {
    bots,
    hitMeshes,
    spawnRound,
    step,
    damage,
    eyeHeight: EYE,
    chestHeight: CHEST,
    weapon: BOT_WEAPON,
    hearDist: HEAR_DIST,
  };
}
