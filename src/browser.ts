// What the browser bundle exposes: the two pointer-reactive pieces, with no
// DOM binding of their own. `npm run build:browser` makes this an IIFE for
// consumers with no bundler — see lucianlabs.ca/scripts/vendor-supermouse.mjs.
export { MouseGravity, smoothstep, easeInQuad, linear } from "./gravity"
export { LiquidEdge } from "./liquid"
export type { MouseGravityParams } from "./gravity"
export type { LiquidEdgeParams } from "./liquid"
