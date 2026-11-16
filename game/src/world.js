// The map: SANDLINE — a 56 x 40 m desert freight depot at golden hour.
// Every box in map.js is a collider for movement and a surface a bullet stops
// on; solar panels hang above head height, so you can walk under them and
// shoot over the low crates. Waypoints form the nav graph bots pathfind over.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './map.js';

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'panel' ? 0.25 : name === 'accent' ? 0.55 : 0.92,
      metalness: name === 'panel' ? 0.6 : 0.03,
    });
  }
  // Site tint: a teal floor wash so each site reads at a glance.
  const siteMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.accent), roughness: 0.8, metalness: 0.05,
    transparent: true, opacity: 0.3, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.4,
  });

  const colliders = [];
  const shootables = [];

  for (const b of MAP.boxes) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), materials[b.mat]);
    mesh.position.set(b.x, (b.y ?? 0) + b.h / 2, b.z);
    if (b.tilt) mesh.rotation.x = b.tilt;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
  }

  // Site floor washes + a raised marker post per site.
  for (const site of MAP.sites) {
    const wash = new THREE.Mesh(new THREE.CircleGeometry(site.r, 28), siteMat);
    wash.rotation.x = -Math.PI / 2;
    wash.position.set(site.x, 0.02, site.z);
    wash.receiveShadow = true;
    group.add(wash);
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 3.4, 0.5),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.6 }),
    );
    post.position.set(site.x, 1.7, site.z - site.r - 0.6);
    post.castShadow = true;
    group.add(post);
    const label = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.9, 0.1),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6, emissive: new THREE.Color(PALETTE.ink), emissiveIntensity: 0.25 }),
    );
    label.position.set(site.x, 3.6, site.z - site.r - 0.6);
    group.add(label);
  }

  // Light: low amber sun from the west, cool dusk fill, warm sky gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color(0xffd9a0), new THREE.Color(PALETTE.sand), 1.9);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color(0xffb35c), 2.6);
  key.position.set(-30, 16, 10);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -32;
  key.shadow.camera.right = 32;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(0x8fa3c7), 0.8);
  fill.position.set(20, 12, -14);
  scene.add(fill);

  // Nav graph: adjacency lists from the edge table.
  const neighbors = MAP.nodes.map(() => []);
  for (const [a, b] of MAP.edges) {
    neighbors[a].push(b);
    neighbors[b].push(a);
  }

  return {
    colliders,
    shootables,
    group,
    sites: MAP.sites,
    spawns: MAP.spawns,
    waypoints: { nodes: MAP.nodes, neighbors },
  };
}
