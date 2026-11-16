// The arsenal: four guns plus two grenades. One module owns the numbers, the
// view models and the reload cycle; main.js owns the ray and the damage.
// Spread grows with movement and shrinks when aiming down sights, so stopping
// to aim pays. The shotgun fires 8 pellets per shell.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'Kestrel-9', price: 0, mag: 12, reserve: 36,
    gap: 0.17, auto: false, damage: 30, headMul: 3, range: 60, pellets: 1,
    spreadStill: 0.004, spreadMove: 0.03, reload: 1.4, kick: 0.006,
    barrel: 0.22, body: [0.07, 0.09, 0.26],
  },
  smg: {
    id: 'smg', name: 'Dune-9', price: 1200, mag: 30, reserve: 90,
    gap: 0.08, auto: true, damage: 24, headMul: 3, range: 45, pellets: 1,
    spreadStill: 0.006, spreadMove: 0.035, reload: 1.7, kick: 0.005,
    barrel: 0.3, body: [0.08, 0.1, 0.4],
  },
  rifle: {
    id: 'rifle', name: 'Longshot-55', price: 2700, mag: 25, reserve: 75,
    gap: 0.11, auto: true, damage: 36, headMul: 4, range: 80, pellets: 1,
    spreadStill: 0.0022, spreadMove: 0.028, reload: 1.9, kick: 0.009,
    barrel: 0.42, body: [0.09, 0.1, 0.46],
  },
  shotgun: {
    id: 'shotgun', name: 'Breacher-12', price: 1800, mag: 6, reserve: 24,
    gap: 0.85, auto: false, damage: 13, headMul: 2, range: 26, pellets: 8,
    spreadStill: 0.02, spreadMove: 0.03, reload: 2.4, kick: 0.02,
    barrel: 0.5, body: [0.11, 0.11, 0.5],
  },
};

const GRENADES = {
  frag: { price: 300, max: 2 },
  flash: { price: 200, max: 2 },
};

export function createWeaponSet(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });

  // One view model per gun; only the current one is visible.
  const models = {};
  for (const def of Object.values(WEAPONS)) {
    const model = new THREE.Group();
    const [bw, bh, bd] = def.body;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, def.barrel), grip);
    barrel.position.set(0, 0.025, -bd / 2 - def.barrel / 2 + 0.05);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.2), grip);
    stock.position.set(0, -0.02, bd / 2 + 0.08);
    model.add(receiver, barrel, stock);
    if (def.id === 'smg') {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), grip);
      mag.position.set(0, -0.12, -0.05);
      model.add(mag);
    }
    if (def.id === 'shotgun') {
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.16), grip);
      pump.position.set(0, -0.06, -bd / 2 - 0.05);
      model.add(pump);
    }
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
    models[def.id] = model;
  }

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

  // Ammo state survives weapon switches.
  const ammo = {};
  for (const def of Object.values(WEAPONS)) ammo[def.id] = { mag: def.mag, reserve: def.reserve };
  const owned = new Set(['pistol', 'rifle']);
  let current = 'rifle';
  const nades = { frag: 0, flash: 0 };
  const state = { cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, switching: 0 };

  function def() {
    return WEAPONS[current];
  }

  function showModel() {
    for (const [id, model] of Object.entries(models)) model.visible = id === current;
  }
  showModel();

  return {
    get current() {
      return current;
    },
    get def() {
      return def();
    },
    get owned() {
      return owned;
    },
    get grenades() {
      return nades;
    },
    get state() {
      return state;
    },
    get ammo() {
      return ammo[current];
    },
    grenadePrice(id) {
      return GRENADES[id].price;
    },
    grenadeMax(id) {
      return GRENADES[id].max;
    },
    buy(id) {
      if (owned.has(id)) return false;
      owned.add(id);
      return true;
    },
    buyGrenade(id) {
      if (nades[id] >= GRENADES[id].max) return false;
      nades[id] += 1;
      return true;
    },
    useGrenade(id) {
      if (nades[id] <= 0) return false;
      nades[id] -= 1;
      return true;
    },
    switchTo(id) {
      if (!owned.has(id) || id === current || state.switching > 0) return false;
      current = id;
      state.reloadLeft = 0;
      state.switching = 0.25;
      showModel();
      return true;
    },
    step(dt) {
      state.cooldown = Math.max(0, state.cooldown - dt);
      state.flash = Math.max(0, state.flash - dt);
      state.switching = Math.max(0, state.switching - dt);
      state.kick += (0 - state.kick) * Math.min(1, dt * 14);
      const model = models[current];
      model.position.z = -0.42 + state.kick;
      model.rotation.x = state.kick * 2.2;
      flash.visible = state.flash > 0;
      flash.rotation.z = state.flash * 30;
      flashLight.intensity = state.flash > 0 ? 18 : 0;
      if (state.reloadLeft > 0) {
        state.reloadLeft = Math.max(0, state.reloadLeft - dt);
        model.rotation.x = -0.55 * Math.min(1, (def().reload - state.reloadLeft) * 2);
        if (state.reloadLeft === 0) {
          const a = ammo[current];
          const need = def().mag - a.mag;
          const take = Math.min(need, a.reserve);
          a.mag += take;
          a.reserve -= take;
        }
      }
    },
    ready() {
      const a = ammo[current];
      return a.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0 && state.switching === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (ammo[current].mag <= 0) return false;
      ammo[current].mag -= 1;
      return true;
    },
    reload() {
      const a = ammo[current];
      if (state.reloadLeft > 0 || a.mag === def().mag || a.reserve === 0) return false;
      state.reloadLeft = def().reload;
      return true;
    },
    spread(speed, aiming) {
      const d = def();
      const base = d.spreadStill + Math.min(1, speed / 5.4) * d.spreadMove;
      return aiming ? base * 0.45 : base;
    },
    refill() {
      for (const d of Object.values(WEAPONS)) {
        ammo[d.id].mag = d.mag;
        ammo[d.id].reserve = d.reserve;
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.switching = 0;
    },
  };
}
