// Transient combat visuals: tracers, impact sparks, the charge explosion and
// the flashbang's white burst. Preallocated pools, no per-frame allocation.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 24;
const SPARK_COUNT = 40;

export function createEffects(scene) {
  const tracerMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false,
  });
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 1), tracerMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerCursor = 0;

  const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ink), transparent: true, opacity: 0 });
  const sparks = [];
  for (let i = 0; i < SPARK_COUNT; i += 1) {
    const mesh = new THREE.Mesh(new THREE.TetrahedronGeometry(0.05), sparkMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0, vel: new THREE.Vector3() });
  }
  let sparkCursor = 0;

  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false }),
  );
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 18);
  scene.add(boomLight);
  let boomLife = 0;

  const flashBall = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff), transparent: true, opacity: 0, depthWrite: false }),
  );
  flashBall.visible = false;
  scene.add(flashBall);
  const flashLight = new THREE.PointLight(new THREE.Color(0xffffff), 0, 22);
  scene.add(flashLight);
  let flashLife = 0;

  const up = new THREE.Vector3(0, 1, 0);

  return {
    tracer(from, to) {
      const slot = tracers[tracerCursor];
      tracerCursor = (tracerCursor + 1) % TRACER_COUNT;
      const length = from.distanceTo(to);
      if (length < 0.5) return;
      slot.mesh.position.copy(from).add(to).multiplyScalar(0.5);
      slot.mesh.lookAt(to);
      slot.mesh.scale.set(1, 1, length);
      slot.mesh.material.opacity = 0.85;
      slot.mesh.visible = true;
      slot.life = 0.07;
    },
    spark(pos, count = 5) {
      for (let i = 0; i < count; i += 1) {
        const slot = sparks[sparkCursor];
        sparkCursor = (sparkCursor + 1) % SPARK_COUNT;
        slot.mesh.position.copy(pos);
        slot.vel.set((Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4);
        slot.mesh.material.opacity = 0.95;
        slot.mesh.visible = true;
        slot.life = 0.35 + Math.random() * 0.25;
      }
    },
    explosion(pos) {
      boom.position.copy(pos);
      boom.visible = true;
      boomLife = 0.55;
      boomLight.position.copy(pos).add(up);
      boomLight.intensity = 60;
    },
    flash(pos) {
      flashBall.position.copy(pos);
      flashBall.visible = true;
      flashLife = 0.4;
      flashLight.position.copy(pos);
      flashLight.intensity = 80;
    },
    step(dt) {
      for (const slot of tracers) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        if (slot.life <= 0) {
          slot.mesh.visible = false;
        } else {
          slot.mesh.material.opacity = Math.max(0, (slot.life / 0.07) * 0.85);
        }
      }
      for (const slot of sparks) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        slot.vel.y -= 12 * dt;
        slot.mesh.position.addScaledVector(slot.vel, dt);
        if (slot.life <= 0 || slot.mesh.position.y < 0.02) {
          slot.mesh.visible = false;
          slot.life = 0;
        } else {
          slot.mesh.material.opacity = Math.max(0, slot.life * 2);
          slot.mesh.rotation.x += dt * 9;
          slot.mesh.rotation.y += dt * 7;
        }
      }
      if (boomLife > 0) {
        boomLife -= dt;
        const t = 1 - Math.max(0, boomLife) / 0.55;
        const radius = 0.6 + t * 5.4;
        boom.scale.setScalar(radius);
        boom.material.opacity = Math.max(0, 0.75 * (1 - t));
        boomLight.intensity = Math.max(0, 60 * (1 - t));
        if (boomLife <= 0) {
          boom.visible = false;
          boomLight.intensity = 0;
        }
      }
      if (flashLife > 0) {
        flashLife -= dt;
        const t = 1 - Math.max(0, flashLife) / 0.4;
        flashBall.scale.setScalar(0.5 + t * 7);
        flashBall.material.opacity = Math.max(0, 0.9 * (1 - t));
        flashLight.intensity = Math.max(0, 80 * (1 - t));
        if (flashLife <= 0) {
          flashBall.visible = false;
          flashLight.intensity = 0;
        }
      }
    },
  };
}
