// The look plan, in one place. The six base values are the CSS custom
// properties in index.html; the four map colours below are the depot's own
// paint (rusted and teal containers, sand crates, dark solar glass). No other
// colour appears in the code.
export const PALETTE = {
  canvas: '#2a2118', // dusk sand
  surface: '#4a3b28',
  hairline: '#6b5636',
  ink: '#f2ead8',
  muted: '#a89a7e',
  accent: '#2fb3a3', // teal signal paint
  rust: '#a85b2a',
  teal: '#2f7f7a',
  sand: '#c9a86a',
  panel: '#1d2f4a',
  sky: '#d99a5b', // golden-hour sky, used for the scene background and fog
};

export function shade(name) {
  return PALETTE[name];
}
