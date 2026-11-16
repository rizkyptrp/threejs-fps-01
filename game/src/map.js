// SANDLINE map data — pure numbers, no three.js, so a Node test can check
// the nav graph against the boxes before the game ever runs in a browser.
// Coordinate plan: x east, z south. Sandline (attackers) spawn west (-25, 0),
// Jackals (defenders) spawn east (24, 0). Site A is the solar array north-east,
// site B the warehouse yard south-east. Three lanes (north, mid, south) are
// split by low dividers with gaps at x -25, -10, 10 and 18.
//
// A box is { x, z, w, d, h, y, mat }: centre (x, z), footprint w x d,
// height h from y. Boxes with y >= 1.8 (solar panels) hang above head height:
// they stop bullets but a body walks under them, so the nav test skips them.
export const MAP = {
  bounds: { x: 28, z: 20 },
  sites: [
    { id: 'A', name: 'Solar Array', x: 20, z: -13, r: 4 },
    { id: 'B', name: 'Warehouse Yard', x: 20, z: 13, r: 4 },
  ],
  spawns: {
    sandline: [[-25, 0], [-24, -6], [-24, 6], [-20, 0]],
    jackals: [[24, 0], [22, -14], [16, -13], [22, 14], [18, 11]],
  },
  boxes: [
    // Ground and outer walls (56 x 40 m yard, 5 m walls).
    { x: 0, z: 0, w: 56.4, d: 40.4, h: 0.4, y: -0.4, mat: 'sand' },
    { x: -28.2, z: 0, w: 0.4, d: 40.4, h: 5, y: 0, mat: 'surface' },
    { x: 28.2, z: 0, w: 0.4, d: 40.4, h: 5, y: 0, mat: 'surface' },
    { x: 0, z: -20.2, w: 56.4, d: 0.4, h: 5, y: 0, mat: 'surface' },
    { x: 0, z: 20.2, w: 56.4, d: 0.4, h: 5, y: 0, mat: 'surface' },
    // Lane dividers (z = -8 and z = +8): gaps at x -25, -10, 10, 18.
    { x: -19, z: -8, w: 6, d: 1, h: 2.6, y: 0, mat: 'hairline' },
    { x: 0, z: -8, w: 8, d: 1, h: 2.6, y: 0, mat: 'hairline' },
    { x: -19, z: 8, w: 6, d: 1, h: 2.6, y: 0, mat: 'hairline' },
    { x: 0, z: 8, w: 8, d: 1, h: 2.6, y: 0, mat: 'hairline' },
    // Mid container yard: two long containers and two upright ones, zigzag.
    { x: -6, z: -2, w: 6, d: 2.4, h: 2.6, y: 0, mat: 'rust' },
    { x: 6, z: 2, w: 6, d: 2.4, h: 2.6, y: 0, mat: 'teal' },
    { x: -2, z: 4, w: 2.4, d: 6, h: 2.6, y: 0, mat: 'sand' },
    { x: 2, z: -4, w: 2.4, d: 6, h: 2.6, y: 0, mat: 'rust' },
    // Lane crates.
    { x: -15, z: -16, w: 2, d: 1.2, h: 1.1, y: 0, mat: 'hairline' },
    { x: 12, z: -16, w: 2, d: 1.2, h: 1.1, y: 0, mat: 'hairline' },
    { x: -15, z: 16, w: 2, d: 1.2, h: 1.1, y: 0, mat: 'hairline' },
    { x: 12, z: 16, w: 2, d: 1.2, h: 1.1, y: 0, mat: 'hairline' },
    // Spawn cover.
    { x: -23, z: -3, w: 2, d: 1.2, h: 1.1, y: 0, mat: 'hairline' },
    { x: -23, z: 3, w: 2, d: 1.2, h: 1.1, y: 0, mat: 'hairline' },
    { x: 22, z: -3, w: 2, d: 1.2, h: 1.1, y: 0, mat: 'hairline' },
    { x: 22, z: 3, w: 2, d: 1.2, h: 1.1, y: 0, mat: 'hairline' },
    // Watchtower pillars.
    { x: 16, z: -4, w: 1, d: 1, h: 3.4, y: 0, mat: 'surface' },
    { x: -16, z: 4, w: 1, d: 1, h: 3.4, y: 0, mat: 'surface' },
    // Site A: solar panel rows (walk-under, y 1.9) on posts, plus a pylon.
    { x: 20, z: -15.5, w: 6, d: 2, h: 0.15, y: 1.9, mat: 'panel', tilt: -0.35 },
    { x: 20, z: -13, w: 6, d: 2, h: 0.15, y: 1.9, mat: 'panel', tilt: -0.35 },
    { x: 20, z: -10.5, w: 6, d: 2, h: 0.15, y: 1.9, mat: 'panel', tilt: -0.35 },
    { x: 17.2, z: -15.5, w: 0.3, d: 0.3, h: 1.9, y: 0, mat: 'hairline' },
    { x: 22.8, z: -15.5, w: 0.3, d: 0.3, h: 1.9, y: 0, mat: 'hairline' },
    { x: 17.2, z: -10.5, w: 0.3, d: 0.3, h: 1.9, y: 0, mat: 'hairline' },
    { x: 22.8, z: -10.5, w: 0.3, d: 0.3, h: 1.9, y: 0, mat: 'hairline' },
    { x: 24, z: -17, w: 1, d: 1, h: 4.5, y: 0, mat: 'surface' },
    { x: 17, z: -16, w: 2, d: 1.2, h: 1.1, y: 0, mat: 'hairline' },
    // Site B: warehouse facades (east backdrop) and yard crates.
    { x: 26.8, z: -13, w: 0.4, d: 8, h: 5, y: 0, mat: 'surface' },
    { x: 26.8, z: 13, w: 0.4, d: 8, h: 5, y: 0, mat: 'surface' },
    { x: 21, z: 11, w: 2, d: 1.2, h: 1.1, y: 0, mat: 'hairline' },
    { x: 23, z: 15.5, w: 1.2, d: 1.2, h: 1.1, y: 0, mat: 'hairline' },
    { x: 20, z: 16.5, w: 2, d: 1.2, h: 1.1, y: 0, mat: 'hairline' },
  ],
  // Nav nodes: [x, z]. Every node and edge was placed on open ground; the
  // test in tools/check-map.mjs proves it against the boxes above.
  nodes: [
    [-25, 0], // 0 Sandline spawn
    [-25, -14], // 1 north lane west
    [-25, 14], // 2 south lane west
    [-18, -14], // 3 north lane
    [-18, 14], // 4 south lane
    [-18, 0], // 5 mid west
    [-10, -14], // 6 north lane
    [-10, 14], // 7 south lane
    [-10, 0], // 8 mid
    [-25, -8], // 9 north crossing west
    [-25, 8], // 10 south crossing west
    [-10, -8], // 11 north crossing
    [-10, 8], // 12 south crossing
    [0, -14], // 13 north lane east
    [0, 14], // 14 south lane east
    [0, 0], // 15 mid centre
    [10, -14], // 16 north lane east
    [10, 14], // 17 south lane east
    [10, 0], // 18 mid east
    [10, -8], // 19 north crossing east
    [10, 8], // 20 south crossing east
    [18, -14], // 21 north lane far east
    [18, 14], // 22 south lane far east
    [18, 0], // 23 mid far east
    [18, -8], // 24 north crossing far east
    [18, 8], // 25 south crossing far east
    [20, -13], // 26 site A
    [20, 13], // 27 site B
    [24, 0], // 28 Jackals spawn
    [24, -14], // 29 defender north
    [24, 14], // 30 defender south
    [14, -13], // 31 site A approach
    [14, 13], // 32 site B approach
  ],
  edges: [
    [0, 1], [0, 2], [0, 5], [0, 9], [0, 10],
    [1, 3], [1, 9], [2, 4], [2, 10],
    [3, 6], [3, 9], [3, 11], [4, 7], [4, 10], [4, 12],
    [5, 8], [6, 11], [6, 13], [7, 12], [7, 14],
    [8, 11], [8, 12], [8, 15],
    [11, 13], [12, 14],
    [13, 16], [13, 19], [13, 21], [14, 17], [14, 20], [14, 22],
    [15, 18],
    [16, 19], [16, 21], [16, 31], [17, 20], [17, 22], [17, 32],
    [18, 19], [18, 20], [18, 23], [18, 24], [18, 25],
    [19, 24], [20, 25],
    [21, 24], [21, 29], [21, 31], [22, 25], [22, 30], [22, 32],
    [23, 24], [23, 25], [23, 28],
    [24, 31], [25, 32],
    [26, 29], [26, 31], [27, 32],
    [28, 29], [28, 30], [29, 31], [30, 32],
  ],
};

// Nav goals per bot role (node indices into MAP.nodes).
export const PATROLS = {
  holdA: [26, 31, 24, 21],
  holdB: [27, 32, 25, 22],
  roamA: [31, 24, 16, 13],
  roamB: [32, 25, 17, 14],
};
