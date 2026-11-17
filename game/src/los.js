// Line-of-sight and body movement against axis-aligned box colliders.
//
// The world hands us its solid geometry as THREE.Box3 instances. Everything
// in here works on plain numbers where possible so the hot paths stay cheap:
// a segment is just two points, and a body is a vertical box described by a
// centre position, a horizontal half-extent and a height.
//
// Positions are feet-based: pos.y is the bottom of the body, not its centre.
import * as THREE from 'three';

// One scratch box shared by every helper in this module. Nothing here runs
// concurrently, so reusing it avoids a fresh allocation on every query.
const probe = new THREE.Box3();

// How far the body is allowed to hop up when it bumps into a low lip while
// walking sideways (a door threshold, a curb, that sort of thing).
const STEP_UP = 0.04;

// Shrink the probe a hair on each side so that merely touching a face --
// standing exactly on a floor, or brushing a wall -- does not count as
// overlapping it. Without this a body resting on the ground could never
// walk, because its feet would always "intersect" the floor.
const SKIN = 0.001;
const FOOT_LIFT = 0.02;

// Fill `probe` with the body's box at the given feet position.
function bodyBox(x, y, z, radius, height) {
  probe.min.set(x - radius + SKIN, y + FOOT_LIFT, z - radius + SKIN);
  probe.max.set(x + radius - SKIN, y + height - FOOT_LIFT, z + radius - SKIN);
}

// True when the body's box at (x, y, z) overlaps any collider.
function hitsAny(x, y, z, radius, height, colliders) {
  bodyBox(x, y, z, radius, height);
  for (const box of colliders) {
    if (probe.intersectsBox(box)) return true;
  }
  return false;
}

// The colliders whose boxes overlap the body's box at (x, y, z).
function overlapping(x, y, z, radius, height, colliders) {
  bodyBox(x, y, z, radius, height);
  const found = [];
  for (const box of colliders) {
    if (probe.intersectsBox(box)) found.push(box);
  }
  return found;
}

// Slab test: where, along the segment from a to b, does it first enter the
// box? Returns the fraction t in [0, 1], or -1 when the segment never enters
// the box. A segment that starts inside the box is a hit at t = 0.
export function segmentBoxT(ax, ay, az, bx, by, bz, box) {
  const starts = [ax, ay, az];
  const deltas = [bx - ax, by - ay, bz - az];
  const lows = [box.min.x, box.min.y, box.min.z];
  const highs = [box.max.x, box.max.y, box.max.z];

  let enter = 0;
  let exit = 1;

  for (let axis = 0; axis < 3; axis++) {
    const d = deltas[axis];
    const s = starts[axis];
    if (Math.abs(d) < 1e-12) {
      // Segment runs parallel to this slab: it only survives when the start
      // point is already between the slab's two faces.
      if (s < lows[axis] || s > highs[axis]) return -1;
      continue;
    }
    let t0 = (lows[axis] - s) / d;
    let t1 = (highs[axis] - s) / d;
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
    }
    if (t0 > enter) enter = t0;
    if (t1 < exit) exit = t1;
    if (enter > exit) return -1;
  }

  if (exit < 0 || enter > 1) return -1;
  return enter < 0 ? 0 : enter;
}

// True when the straight line from a to b is not blocked by any collider.
export function hasLineOfSight(ax, ay, az, bx, by, bz, colliders) {
  for (const box of colliders) {
    if (segmentBoxT(ax, ay, az, bx, by, bz, box) >= 0) return false;
  }
  return true;
}

// Nearest hit fraction along the segment across every collider, or -1 when
// the segment is clear. Callers multiply the fraction by the segment length
// to get a distance.
export function segmentWorldT(ax, ay, az, bx, by, bz, colliders) {
  let best = -1;
  for (const box of colliders) {
    const t = segmentBoxT(ax, ay, az, bx, by, bz, box);
    if (t >= 0 && (best < 0 || t < best)) best = t;
  }
  return best;
}

// Walk a body through the world for one frame.
//
// pos and vel are THREE.Vector3-like objects mutated in place. The move runs
// one axis at a time -- X, then Z, then Y -- so a body sliding along a wall
// keeps the free component of its motion instead of stopping dead. A
// horizontal axis whose destination would overlap a collider is cancelled
// (and that velocity component zeroed), unless the step-up allowance lets
// the body hop over the lip. Vertical resolution rests the body on top of
// whatever it lands on, or tucks it under whatever it bumps its head on.
// The floor is y = 0 and always counts as ground.
//
// Returns true when the body ends the frame resting on something.
export function slideMove(pos, vel, dt, colliders, radius, height) {
  // --- horizontal: X, then Z ---------------------------------------------
  for (const axis of ['x', 'z']) {
    const speed = vel[axis];
    if (speed === 0) continue;
    const next = pos[axis] + speed * dt;
    const nx = axis === 'x' ? next : pos.x;
    const nz = axis === 'z' ? next : pos.z;
    if (!hitsAny(nx, pos.y, nz, radius, height, colliders)) {
      pos[axis] = next;
    } else if (!hitsAny(nx, pos.y + STEP_UP, nz, radius, height, colliders)) {
      // A low lip: step up onto it instead of getting stuck.
      pos[axis] = next;
      pos.y += STEP_UP;
    } else {
      vel[axis] = 0;
    }
  }

  // --- vertical: Y --------------------------------------------------------
  // Colliders resolve first: a body that drops onto a crate in this step
  // lands on the crate, it does not punch through to the floor. The floor
  // only catches bodies that missed every collider on the way down.
  let grounded = false;
  pos.y += vel.y * dt;

  const overlapped = overlapping(pos.x, pos.y, pos.z, radius, height, colliders);
  if (overlapped.length > 0) {
    if (vel.y <= 0) {
      // Land on the highest top we sank into.
      let top = -Infinity;
      for (const box of overlapped) {
        if (box.max.y > top) top = box.max.y;
      }
      pos.y = top;
      vel.y = 0;
      grounded = true;
    } else {
      // Head bump: drop the body just below the lowest ceiling we hit.
      let bottom = Infinity;
      for (const box of overlapped) {
        if (box.min.y < bottom) bottom = box.min.y;
      }
      pos.y = bottom - height;
      if (pos.y < 0) pos.y = 0;
      vel.y = 0;
    }
  }

  if (pos.y <= 0) {
    pos.y = 0;
    if (vel.y <= 0) vel.y = 0;
    grounded = true;
  }

  // Standing still on a floor or a box top still counts as grounded, even
  // when this frame's vertical move was zero: probe a little below the feet.
  if (!grounded && vel.y <= 0) {
    const probeY = pos.y - 0.06;
    if (probeY <= 0 || hitsAny(pos.x, probeY, pos.z, radius, height, colliders)) {
      grounded = true;
    }
  }

  return grounded;
}
