// The charge: carried, dropped, planted, exploded or defused. A small device
// with a blinking light; main.js owns the round consequences.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function createBomb(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.4 }),
  );
  body.castShadow = true;
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
  );
  light.position.set(0, 0.13, 0);
  group.add(body, light);
  group.visible = false;
  scene.add(group);

  const state = {
    mode: 'carried', // carried | dropped | planted | gone
    site: null,
    pos: new THREE.Vector3(),
    carrier: null, // 'player' | bot
    timer: 0, // plant countdown once planted
    blink: 0,
  };

  return {
    state,
    group,
    reset(carrier) {
      state.mode = 'carried';
      state.site = null;
      state.carrier = carrier;
      state.timer = 0;
      state.blink = 0;
      group.visible = false;
    },
    dropAt(pos) {
      state.mode = 'dropped';
      state.carrier = null;
      state.pos.copy(pos);
      state.pos.y = 0.12;
      group.position.copy(state.pos);
      group.visible = true;
    },
    pickup(carrier) {
      state.mode = 'carried';
      state.carrier = carrier;
      group.visible = false;
    },
    plant(site, pos) {
      state.mode = 'planted';
      state.site = site;
      state.carrier = null;
      state.timer = 35;
      state.pos.copy(pos);
      state.pos.y = 0.12;
      group.position.copy(state.pos);
      group.visible = true;
    },
    gone() {
      state.mode = 'gone';
      group.visible = false;
    },
    step(dt, onBeep) {
      if (state.mode === 'planted') {
        state.timer -= dt;
        state.blink += dt;
        const interval = state.timer < 10 ? 0.35 : 0.8;
        if (state.blink >= interval) {
          state.blink = 0;
          light.material.color.setHex(state.timer < 10 ? 0xff3020 : 0x2fb3a3);
          if (onBeep) onBeep();
        }
      }
    },
  };
}
