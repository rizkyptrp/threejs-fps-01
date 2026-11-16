// Line-of-sight and movement helpers over the world's axis-aligned colliders.
// One job each, no allocations in the hot paths.
import * as THREE from 'three';

// Segment (a -> b) against one AABB. Slab test; returns the hit fraction t in
// [0, 1] or -1 when the segment misses the box.
export function segmentBoxT(ax, ay, az, bx, by, bz, box) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  let tMin = 0;
  let tMax = 1;
  const mins = [box.min.x, box.min.y, box.min.z];
  const maxs = [box.max.x, box.max.y, box.max.z];
  const origins = [ax, ay, az];
  const dirs = [dx, dy, dz];
  for (let axis = 0; axis < 3; axis += 1) {
    const d = dirs[axis];
    if (Math.abs(d) < 1e-9) {
      if (origins[axis] < mins[axis] || origins[axis] > maxs[axis]) return -1;
    } else {
      let t0 = (mins[axis] - origins[axis]) / d;
      let t1 = (maxs[axis] - origins[axis]) / d;
      if (t0 > t1) {
        const tmp = t0;
        t0 = t1;
        t1 = tmp;
      }
      if (t0 > tMin) tMin = t0;
      if (t1 < tMax) tMax = t1;
      if (tMin > tMax) return -1;
    }
  }
  return tMin;
}

// True when no world box blocks the segment a -> b.
export function hasLineOfSight(ax, ay, az, bx, by, bz, colliders) {
  for (let i = 0; i < colliders.length; i += 1) {
    if (segmentBoxT(ax, ay, az, bx, by, bz, colliders[i]) >= 0) return false;
  }
  return true;
}

// Nearest world hit fraction along the segment, or -1.
export function segmentWorldT(ax, ay, az, bx, by, bz, colliders) {
  let best = -1;
  for (let i = 0; i < colliders.length; i += 1) {
    const t = segmentBoxT(ax, ay, az, bx, by, bz, colliders[i]);
    if (t >= 0 && (best < 0 || t < best)) best = t;
  }
  return best;
}

// Slide a body (radius, height) through the colliders one axis at a time.
// pos is mutated in place; returns true when the body rests on something.
export function slideMove(pos, vel, dt, colliders, radius, height) {
  const probe = slideMove.probe || (slideMove.probe = new THREE.Box3());
  function overlaps(x, y, z, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + height - lift, z + radius);
    for (let i = 0; i < colliders.length; i += 1) {
      if (probe.intersectsBox(colliders[i])) return colliders[i];
    }
    return null;
  }
  const nextX = pos.x + vel.x * dt;
  if (!overlaps(nextX, pos.y, pos.z, 0.04)) pos.x = nextX;
  else vel.x = 0;
  const nextZ = pos.z + vel.z * dt;
  if (!overlaps(pos.x, pos.y, nextZ, 0.04)) pos.z = nextZ;
  else vel.z = 0;
  pos.y += vel.y * dt;
  let grounded = false;
  const hit = overlaps(pos.x, pos.y, pos.z, 0);
  if (hit && vel.y <= 0) {
    pos.y = hit.max.y;
    vel.y = 0;
    grounded = true;
  } else if (hit) {
    pos.y = hit.min.y - height;
    vel.y = 0;
  }
  if (pos.y < 0) {
    pos.y = 0;
    vel.y = 0;
    grounded = true;
  }
  return grounded;
}
