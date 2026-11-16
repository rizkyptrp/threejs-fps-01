// SANDLINE — boot and the one loop: a fixed 60 Hz simulation feeding a render
// at the display's rate. ?shot=start|play|buy|end with &seed=N sets up a
// deterministic frame for a capture, renders it twice, then freezes it and
// sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponSet, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createMatch, PRICES, REWARDS } from './game.js';
import { createHud } from './hud.js';
import { hasLineOfSight, segmentWorldT } from './los.js';

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
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 30, 80);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 180);
scene.add(camera);

const world = createWorld(scene);
const bomb = createBomb(scene);
const bots = createBots(scene, world);
const weapons = createWeaponSet(camera);
const audio = createAudio();
const effects = createEffects(scene);
const match = createMatch();
const hud = createHud();
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;

const body = player.state;
const ALLY_NAMES = ['Rook', 'Sable', 'Wren'];
const ENEMY_NAMES = ['Coyote', 'Dingo', 'Fennec', 'Gila', 'Sidewinder'];
let hp = 100;
let armor = 0;
let playerAlive = true;
let spectateBot = null;
let plantProgress = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let elapsed = 0;
let playerBlindUntil = 0;
const grenades = [];
const noises = [];
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _origin = new THREE.Vector3();
const prevKeys = new Set();
let buyOpen = false;
let lastPhase = match.state.phase;

function siteById(id) {
  return world.sites.find((s) => s.id === id);
}

function aliveCounts() {
  let san = playerAlive ? 1 : 0;
  let jac = 0;
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    if (bot.team === 'sandline') san += 1;
    else jac += 1;
  }
  return { san, jac };
}

function playerSpawn() {
  body.position.set(-25, 0, 0);
  body.velocity.set(0, 0, 0);
  body.yaw = -Math.PI / 2;
  body.pitch = 0;
  hp = 100;
  armor = 0;
  playerAlive = true;
  spectateBot = null;
  plantProgress = 0;
  playerBlindUntil = 0;
}

function setupRound() {
  const roles = [
    { team: 'sandline', name: ALLY_NAMES[0], role: 'rushA', spawn: world.spawns.sandline[1] },
    { team: 'sandline', name: ALLY_NAMES[1], role: 'rushB', spawn: world.spawns.sandline[2] },
    { team: 'sandline', name: ALLY_NAMES[2], role: 'roam', spawn: world.spawns.sandline[3] },
    { team: 'jackals', name: ENEMY_NAMES[0], role: 'holdA', spawn: world.spawns.jackals[1] },
    { team: 'jackals', name: ENEMY_NAMES[1], role: 'holdA', spawn: world.spawns.jackals[2] },
    { team: 'jackals', name: ENEMY_NAMES[2], role: 'holdB', spawn: world.spawns.jackals[3] },
    { team: 'jackals', name: ENEMY_NAMES[3], role: 'holdB', spawn: world.spawns.jackals[4] },
    { team: 'jackals', name: ENEMY_NAMES[4], role: 'roamA', spawn: world.spawns.jackals[0] },
  ];
  bots.spawnRound(roles);
  playerSpawn();
  weapons.refill();
  bomb.reset('player');
  hud.setBuyOpen(false);
  buyOpen = false;
  hud.hideBanner();
  hud.setBombStatus('CHARGE WITH YOU');
  syncHud();
}

function startMatch() {
  match.startMatch();
  setupRound();
  hud.setBuyOpen(true);
  buyOpen = true;
  hud.setBuyAffordability(match.state.money, weapons.owned);
  hud.showBanner('BUY PHASE', `Round ${match.state.round} — press B for the shop, then take site ${match.state.targetSite}`);
  audio.unlock();
}

function endRound(winner, reason) {
  if (match.state.phase !== 'round' && match.state.phase !== 'freeze') return;
  match.endRound(winner, reason);
  bomb.gone();
  hud.setBuyOpen(false);
  buyOpen = false;
  if (winner === 'sandline') {
    hud.showBanner('SANDLINE WINS THE ROUND', reason);
    audio.roundWin();
  } else {
    hud.showBanner('JACKALS WIN THE ROUND', reason);
    audio.roundLose();
  }
  if (document.pointerLockElement) document.exitPointerLock();
}

function syncHud() {
  const m = match.state;
  hud.setHealth(hp, armor);
  hud.setAmmo(weapons.ammo.mag, weapons.ammo.reserve, weapons.def.name);
  hud.setMoney(m.money);
  hud.setNades(weapons.grenades.frag, weapons.grenades.flash);
  hud.setScore(m.score.sandline, m.score.jackals, m.round);
  hud.setTimer(bomb.state.mode === 'planted' ? bomb.state.timer : m.timer, bomb.state.mode === 'planted');
  hud.setCrosshairGap(4 + weapons.spread(player.groundSpeed(), input.state.aiming) * 420);
  hud.setFlashBlind(Math.max(0, playerBlindUntil - elapsed) / 1.8);
}

function feed(text, good) {
  hud.killfeed(text, good);
}

function damagePlayer(amount, fromPos) {
  if (!playerAlive || match.state.phase !== 'round') return;
  let remaining = amount;
  if (armor > 0) {
    const absorbed = Math.min(armor, remaining * 0.5);
    armor -= absorbed;
    remaining -= absorbed;
  }
  hp -= remaining;
  hud.flashDamage();
  audio.hurt();
  if (fromPos) {
    const dx = fromPos.x - body.position.x;
    const dz = fromPos.z - body.position.z;
    const worldAngle = Math.atan2(dx, dz);
    const rel = worldAngle - body.yaw;
    hud.damageFrom((rel * 180) / Math.PI);
  }
  if (hp <= 0) {
    hp = 0;
    playerAlive = false;
    match.state.deaths += 1;
    feed('Jackals ▸ You', false);
    if (bomb.state.mode === 'carried' && bomb.state.carrier === 'player') {
      bomb.dropAt(body.position);
      feed('The charge dropped', false);
    }
    if (document.pointerLockElement) document.exitPointerLock();
    const ally = bots.bots.find((b) => b.alive && b.team === 'sandline');
    spectateBot = ally || null;
    hud.showBanner('YOU ARE DOWN', ally ? `Spectating ${ally.name}` : 'Your crew is gone');
  }
  syncHud();
}

function damageBot(bot, amount, part, attackerName) {
  if (!bot.alive) return;
  const killed = bots.damage(bot, amount, part);
  if (attackerName === 'You') {
    hud.hitMarker(killed);
    audio.hit();
    if (killed) {
      audio.kill();
      match.state.money += REWARDS.kill;
      match.state.kills += 1;
      feed(`You ▸ ${bot.name}`, true);
    }
  }
  if (killed) {
    if (bot.hasBomb) {
      bomb.dropAt(bot.pos);
      bot.hasBomb = false;
      feed('The charge dropped', false);
    }
    if (bot.team === 'jackals' && attackerName !== 'You') {
      feed(`${attackerName} ▸ ${bot.name}`, true);
    } else if (bot.team === 'sandline' && attackerName !== 'You') {
      feed(`${attackerName} ▸ ${bot.name}`, false);
    }
    if (attackerName === 'You') syncHud();
  }
}

// Shared hitscan resolution for bot shots: origin, direction (unit), shooter.
function resolveBotShot(bot, origin, dir, target) {
  const def = bots.weapon;
  const maxDist = def.range;
  // World hit first.
  const tWorld = segmentWorldT(origin.x, origin.y, origin.z, origin.x + dir.x * maxDist, origin.y + dir.y * maxDist, origin.z + dir.z * maxDist, world.colliders);
  // Target spheres: chest (r 0.45 at 1.05) and head (r 0.22 at 1.53).
  const tp = target.pos;
  let tHit = -1;
  let hitPart = 'torso';
  for (const [cy, r, part] of [[1.05, 0.45, 'torso'], [1.53, 0.22, 'head']]) {
    _v.set(tp.x - origin.x, cy - origin.y, tp.z - origin.z);
    const tca = _v.dot(dir);
    if (tca < 0) continue;
    const d2 = _v.lengthSq() - tca * tca;
    if (d2 > r * r) continue;
    const t = tca - Math.sqrt(r * r - d2);
    if (t >= 0 && t <= maxDist && (tHit < 0 || t < tHit)) {
      tHit = t;
      hitPart = part;
    }
  }
  const tWall = tWorld >= 0 ? tWorld * maxDist : Infinity;
  if (tHit >= 0 && tHit < tWall) {
    const hitPoint = _v2.copy(origin).addScaledVector(dir, tHit);
    effects.tracer(muzzle.copy(origin), hitPoint);
    const falloff = Math.max(0.5, Math.min(1, def.range / Math.max(def.range, tHit)));
    const damage = def.damage * (hitPart === 'head' ? def.headMul : 1) * falloff;
    if (target.kind === 'player') {
      damagePlayer(damage, bot.pos);
    } else {
      damageBot(target.ref, damage, hitPart, bot.name);
    }
    return;
  }
  const end = tWall < Infinity ? tWall : maxDist;
  const hitPoint = _v2.copy(origin).addScaledVector(dir, end);
  effects.tracer(muzzle.copy(origin), hitPoint);
  if (tWall < Infinity) effects.spark(hitPoint, 4);
}

function botShoot(bot, target, dist, moving) {
  _eye.set(bot.pos.x, 1.5, bot.pos.z);
  _aim.set(target.pos.x, 1.05, target.pos.z);
  if (Math.random() < 0.12) _aim.y = 1.53;
  _dir.copy(_aim).sub(_eye).normalize();
  const targetSpeed = target.kind === 'player' ? player.groundSpeed() : Math.hypot(target.ref.vel.x, target.ref.vel.z);
  const error = 0.02 + dist * 0.0007 + targetSpeed * 0.0012 + (moving ? 0.015 : 0);
  _right.crossVectors(_dir, _up.set(0, 1, 0)).normalize();
  _up.crossVectors(_right, _dir).normalize();
  const a = (Math.random() * 2 - 1) * error;
  const b = (Math.random() * 2 - 1) * error;
  _dir.addScaledVector(_right, a).addScaledVector(_up, b).normalize();
  audio.shot('rifle');
  noises.push({ x: bot.pos.x, z: bot.pos.z });
  _origin.copy(_eye);
  resolveBotShot(bot, _origin, _dir, target);
}

function shoot(spread) {
  if (!weapons.takeRound()) {
    audio.dryFire();
    return false;
  }
  const def = weapons.def;
  camera.getWorldDirection(direction);
  scene.updateMatrixWorld(true);
  const origin = muzzle.copy(camera.position);
  for (let p = 0; p < def.pellets; p += 1) {
    _dir.copy(direction);
    _dir.x += (random() * 2 - 1) * spread;
    _dir.y += (random() * 2 - 1) * spread;
    _dir.z += (random() * 2 - 1) * spread;
    _dir.normalize();
    raycaster.set(camera.position, _dir);
    const hits = raycaster.intersectObjects([...bots.hitMeshes, ...world.shootables], false);
    const hit = hits[0];
    if (hit) {
      effects.tracer(origin, hit.point);
      if (hit.object.userData.bot) {
        const bot = hit.object.userData.bot;
        const part = hit.object.userData.part;
        const falloff = Math.max(0.5, Math.min(1, def.range / Math.max(def.range, hit.distance)));
        const damage = def.damage * (part === 'head' ? def.headMul : 1) * falloff;
        damageBot(bot, damage, part, 'You');
      } else {
        effects.spark(hit.point, 4);
      }
    } else {
      effects.tracer(origin, _v.copy(camera.position).addScaledVector(_dir, 70));
    }
  }
  weapons.pullTrigger();
  audio.shot(def.id);
  noises.push({ x: body.position.x, z: body.position.z });
  player.recoil(def.kick + random() * 0.003, (random() * 2 - 1) * 0.004);
  syncHud();
  return true;
}

function throwGrenade(kind) {
  if (!weapons.useGrenade(kind)) return;
  camera.getWorldDirection(direction);
  const color = kind === 'flash' ? 0xffffff : PALETTE.accent;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.4, metalness: 0.3 }),
  );
  mesh.position.copy(camera.position).addScaledVector(direction, 0.5);
  scene.add(mesh);
  grenades.push({
    mesh,
    kind,
    pos: mesh.position,
    vel: direction.clone().multiplyScalar(15).add(new THREE.Vector3(0, 4.5, 0)),
    fuse: 1.6,
  });
  audio.click();
  syncHud();
}

function explodeGrenade(g) {
  scene.remove(g.mesh);
  if (g.kind === 'flash') {
    effects.flash(g.pos);
    audio.flashbang();
    // Anyone looking at the pop within 12 m and line of sight is blinded.
    for (const bot of bots.bots) {
      if (!bot.alive) continue;
      const d = Math.hypot(bot.pos.x - g.pos.x, bot.pos.z - g.pos.z);
      if (d > 12) continue;
      if (!hasLineOfSight(g.pos.x, g.pos.y + 0.3, g.pos.z, bot.pos.x, 1.5, bot.pos.z, world.colliders)) continue;
      bot.blindUntil = elapsed + 2.2;
      bot.target = null;
    }
    if (playerAlive) {
      const d = Math.hypot(body.position.x - g.pos.x, body.position.z - g.pos.z);
      if (d < 12 && hasLineOfSight(g.pos.x, g.pos.y + 0.3, g.pos.z, body.position.x, body.position.y + body.eye, body.position.z, world.colliders)) {
        playerBlindUntil = elapsed + 1.8;
      }
    }
    return;
  }
  effects.explosion(g.pos);
  audio.explosion();
  const victims = [];
  if (playerAlive) victims.push({ kind: 'player', pos: body.position, ref: null });
  for (const bot of bots.bots) if (bot.alive) victims.push({ kind: 'bot', pos: bot.pos, ref: bot });
  for (const victim of victims) {
    const d = victim.pos.distanceTo(g.pos);
    if (d > 5.5) continue;
    const damage = 120 - (d / 5.5) * 100;
    if (!hasLineOfSight(g.pos.x, g.pos.y + 0.3, g.pos.z, victim.pos.x, 1.0, victim.pos.z, world.colliders)) continue;
    if (victim.kind === 'player') damagePlayer(damage, g.pos);
    else damageBot(victim.ref, damage, 'torso', 'You');
  }
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.fuse -= dt;
    g.vel.y -= 18 * dt;
    const nx = g.pos.x + g.vel.x * dt;
    const ny = g.pos.y + g.vel.y * dt;
    const nz = g.pos.z + g.vel.z * dt;
    const t = segmentWorldT(g.pos.x, g.pos.y, g.pos.z, nx, ny, nz, world.colliders);
    if (t >= 0) {
      // Simple bounce: dampen and reverse the dominant axis.
      if (Math.abs(g.vel.y) >= Math.abs(g.vel.x) && Math.abs(g.vel.y) >= Math.abs(g.vel.z)) {
        g.vel.y = -g.vel.y * 0.4;
        g.vel.x *= 0.6;
        g.vel.z *= 0.6;
      } else if (Math.abs(g.vel.x) >= Math.abs(g.vel.z)) {
        g.vel.x = -g.vel.x * 0.4;
      } else {
        g.vel.z = -g.vel.z * 0.4;
      }
      g.pos.y = Math.max(0.1, g.pos.y);
    } else {
      g.pos.set(nx, ny, nz);
    }
    if (g.pos.y < 0.1) {
      g.pos.y = 0.1;
      g.vel.y = Math.abs(g.vel.y) * 0.4;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
    }
    g.mesh.position.copy(g.pos);
    if (g.fuse <= 0) {
      explodeGrenade(g);
      grenades.splice(i, 1);
    }
  }
}

function checkRoundEnd() {
  const m = match.state;
  if (m.phase !== 'round') return;
  const { san, jac } = aliveCounts();
  if (jac === 0) {
    endRound('sandline', 'Jackals eliminated');
    return;
  }
  if (san === 0) {
    if (bomb.state.mode === 'planted') return; // charge still decides it
    endRound('jackals', 'Sandline eliminated');
    return;
  }
  if (bomb.state.mode !== 'planted' && m.timer <= 0) {
    endRound('jackals', 'Time expired — the charge never went off');
  }
}

function step(dt) {
  elapsed += dt;
  const m = match.state;
  match.step(dt);
  bomb.step(dt, () => audio.beep());

  // Phase transitions (match.step flips phases; react to the flip here).
  if (m.phase !== lastPhase) {
    if (m.phase === 'buy' && lastPhase === 'roundEnd') {
      setupRound();
      hud.setBuyOpen(true);
      buyOpen = true;
      hud.setBuyAffordability(m.money, weapons.owned);
      hud.showBanner('BUY PHASE', `Round ${m.round} — press B for the shop, then take site ${m.targetSite}`);
    } else if (m.phase === 'freeze') {
      // Buy is over: arm the round clock (100s) for the freeze + combat.
      match.startRound();
      hud.setBuyOpen(false);
      buyOpen = false;
    } else if (m.phase === 'matchEnd') {
      hud.showOverlay(m.matchWinner === 'sandline' ? 'win' : 'lose', `Final score SAN ${m.score.sandline} — ${m.score.jackals} JAC.`);
      if (document.pointerLockElement) document.exitPointerLock();
    }
    lastPhase = m.phase;
  }

  if (m.phase === 'buy' || m.phase === 'freeze' || m.phase === 'round') {
    // Player movement (not while dead).
    if (playerAlive) {
      const look = input.takeLook();
      player.look(look.x, look.y);
      player.step(dt, input.state.keys, input.state.aiming);
      if (player.groundSpeed() > 2 && player.state.onGround) audio.footstep(elapsed);
      const edge = (code) => input.state.keys.has(code) && !prevKeys.has(code);
      if (m.phase === 'round') {
        if (input.state.firing && weapons.ready()) shoot(shot ? 0 : weapons.spread(player.groundSpeed(), input.state.aiming));
        if (edge('KeyR') && weapons.reload()) audio.reload();
        if (edge('KeyG')) throwGrenade('frag');
        if (edge('KeyH')) throwGrenade('flash');
        for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4']) {
          if (edge(code)) {
            const id = code === 'Digit1' ? 'rifle' : code === 'Digit2' ? 'smg' : code === 'Digit3' ? 'shotgun' : 'pistol';
            if (weapons.switchTo(id)) {
              audio.click();
              syncHud();
            }
          }
        }
      }
      if (m.phase === 'buy') {
        if (edge('KeyB')) {
          buyOpen = !buyOpen;
          hud.setBuyOpen(buyOpen);
          audio.click();
        }
        for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7']) {
          if (edge(code)) hud.pressBuyKey(code.slice(-1));
        }
      }
      if (edge('KeyM')) audio.toggleMute();
      prevKeys.clear();
      for (const k of input.state.keys) prevKeys.add(k);
    }
    weapons.step(dt);
    effects.step(dt);

    // Charge pickup: the player or an ally walking over a dropped charge.
    if (bomb.state.mode === 'dropped') {
      if (playerAlive && body.position.distanceTo(bomb.state.pos) < 1.5) {
        bomb.pickup('player');
        feed('You picked up the charge', true);
        hud.setBombStatus('CHARGE WITH YOU');
      } else {
        for (const bot of bots.bots) {
          if (bot.alive && bot.team === 'sandline' && bot.pos.distanceTo(bomb.state.pos) < 1.5) {
            bot.hasBomb = true;
            bomb.pickup(bot);
            feed(`${bot.name} picked up the charge`, true);
            break;
          }
        }
      }
    }
    // Player planting (hold E in a site while carrying).
    if (playerAlive && m.phase === 'round' && bomb.state.mode === 'carried' && bomb.state.carrier === 'player') {
      const site = siteById(m.targetSite);
      const inSite = Math.hypot(body.position.x - site.x, body.position.z - site.z) < site.r;
      if (inSite && input.state.keys.has('KeyE')) {
        plantProgress += dt / 3;
        hud.setProgress('PLANTING THE CHARGE', plantProgress);
        if (plantProgress >= 1) {
          bomb.plant(site.id, body.position);
          match.state.money += REWARDS.plant;
          feed('You planted the charge', true);
          audio.plant();
          hud.setBombStatus('CHARGE PLANTED — 35s');
          plantProgress = 0;
          hud.setProgress(null, 0);
          syncHud();
        }
      } else {
        plantProgress = 0;
        hud.setProgress(null, 0);
      }
    } else {
      hud.setProgress(null, 0);
    }

    // Bots.
    const site = siteById(m.targetSite);
    bots.step(dt, elapsed, {
      player: { alive: playerAlive, pos: body.position, speed: player.groundSpeed() },
      bomb: {
        state: bomb.state.mode,
        site: bomb.state.site,
        pos: bomb.state.pos,
        siteTarget: m.targetSite,
      },
      targetSite: m.targetSite,
      sitePos: site,
      noises,
      shoot: (bot, target, dist, moving) => botShoot(bot, target, dist, moving),
      onPlantDone: (bot) => {
        bomb.plant(m.targetSite, bot.pos);
        feed(`${bot.name} planted the charge`, false);
        audio.plant();
        hud.setBombStatus('CHARGE PLANTED — 35s');
        bot.hasBomb = false;
      },
      onDefuseDone: () => {
        bomb.gone();
        endRound('jackals', 'The charge was defused');
      },
    });
    noises.length = 0;

    stepGrenades(dt);
    checkRoundEnd();
  }

  // Charge explosion ends the round.
  if (bomb.state.mode === 'planted' && bomb.state.timer <= 0) {
    effects.explosion(bomb.state.pos);
    audio.explosion();
    endRound('sandline', 'The charge detonated');
  }

  syncHud();
}

function syncCamera() {
  if (!playerAlive && spectateBot) {
    camera.position.set(spectateBot.pos.x, spectateBot.pos.y + 1.5, spectateBot.pos.z);
    camera.rotation.set(0, spectateBot.yaw, 0, 'YXZ');
    return;
  }
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  // Aim down sights: narrow the field of view while the right button is held.
  const targetFov = input.state.aiming && playerAlive ? 55 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * 0.25;
    camera.updateProjectionMatrix();
  }
  renderer.render(scene, camera);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    audio.unlock();
  } else if (match.state.phase === 'round' || match.state.phase === 'freeze' || match.state.phase === 'buy') {
    if (playerAlive && match.state.phase !== 'matchEnd') hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  if (match.state.phase === 'menu' || match.state.phase === 'matchEnd') {
    startMatch();
  }
  input.requestLock();
});

hud.onBuy((id) => {
  const m = match.state;
  if (m.phase !== 'buy') return;
  if (id === 'frag' || id === 'flash') {
    if (m.money >= PRICES[id] && weapons.buyGrenade(id)) {
      m.money -= PRICES[id];
      audio.buy();
    }
  } else if (id === 'armor') {
    if (m.money >= PRICES.armor && armor < 100) {
      m.money -= PRICES.armor;
      armor = 100;
      audio.buy();
    }
  } else if (weapons.owned.has(id)) {
    weapons.switchTo(id);
    audio.click();
  } else if (m.money >= PRICES[id]) {
    m.money -= PRICES[id];
    weapons.buy(id);
    weapons.switchTo(id);
    audio.buy();
  }
  hud.setBuyAffordability(m.money, weapons.owned);
  syncHud();
});

// ---- Screenshot mode ----
function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function botAimPoint(bot) {
  return new THREE.Vector3(bot.pos.x, 1.05, bot.pos.z);
}

function runShot(name) {
  hud.hideOverlay();
  if (name === 'start') {
    body.position.set(-25, 0, 0);
    body.yaw = -Math.PI / 2 - 0.3;
    body.pitch = 0.02;
    syncCamera();
    hud.showOverlay('start');
  } else if (name === 'play' || name === 'buy' || name === 'end') {
    startMatch();
    // Fast-forward: skip buy, start the round with bots in the open.
    match.state.phase = 'round';
    match.state.timer = 88;
    hud.setBuyOpen(false);
    buyOpen = false;
    lastPhase = 'round';
    if (name === 'buy') {
      match.state.phase = 'buy';
      match.state.timer = 12;
      match.state.money = 4000;
      hud.setBuyOpen(true);
      buyOpen = true;
      hud.setBuyAffordability(match.state.money, weapons.owned);
      body.position.set(-25, 0, 0);
      body.yaw = -Math.PI / 2;
      syncCamera();
    } else if (name === 'play') {
      // Push the player up the north lane; a Jackal holds the far end.
      hud.hideBanner();
      match.state.round = 2;
      body.position.set(-8, 0, -14);
      body.yaw = -Math.PI / 2;
      const enemy = bots.bots.find((b) => b.team === 'jackals' && b.role === 'holdA');
      if (enemy) {
        enemy.pos.set(8, 0, -14);
        enemy.yaw = Math.PI / 2;
        enemy.parts.group.position.copy(enemy.pos);
        enemy.parts.group.rotation.y = enemy.yaw;
      }
      settle(30);
      if (enemy) {
        // Three rifle hits (36 each) drop the bot; the killfeed shows the kill.
        aimAt(botAimPoint(enemy));
        shoot(0);
        settle(6);
        aimAt(botAimPoint(enemy));
        shoot(0);
        settle(6);
        aimAt(botAimPoint(enemy));
        shoot(0);
        // Let the kill land: the bot falls flat (0.4s) and the muzzle flash fades.
        settle(24);
      }
      hud.setScore(1, 0, 2);
      match.state.score.sandline = 1;
    } else {
      // end: round won at site A, banner up.
      match.state.score.sandline = 2;
      match.state.score.jackals = 1;
      match.state.round = 4;
      body.position.set(12, 0, -8);
      body.yaw = -Math.PI / 2 - 0.6;
      syncCamera();
      bomb.plant('A', new THREE.Vector3(20, 0, -13));
      bomb.state.timer = 0;
      hud.setBombStatus('CHARGE DETONATED');
      hud.showBanner('SANDLINE WINS THE ROUND', 'The charge detonated');
      hud.setScore(2, 1, 4);
    }
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

window.__state = () => ({
  phase: match.state.phase,
  round: match.state.round,
  score: match.state.score,
  hp,
  money: match.state.money,
  timer: match.state.timer,
  bomb: bomb.state.mode,
  botsAlive: bots.bots.filter((b) => b.alive).length,
  bots: bots.bots.map((b) => ({ name: b.name, team: b.team, alive: b.alive, x: +b.pos.x.toFixed(2), z: +b.pos.z.toFixed(2) })),
  playerAlive,
  playerPos: [+body.position.x.toFixed(2), +body.position.z.toFixed(2)],
});

syncCamera();
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
