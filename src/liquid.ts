/**
 * LiquidEdge — a row of springs that behaves like the surface of something wet.
 *
 * {@link MouseGravity} says how near the pointer is. This says what a surface
 * does about it: a bulge rises under the cursor, the bulge drags sideways as
 * the cursor moves, waves run out from it along the surface and reflect off the
 * ends, and when the pointer leaves the whole thing sloshes back and settles.
 *
 * It is a chain of masses, each on a spring toward the height the pointer is
 * asking for, each coupled to its neighbours. The coupling is the thing that
 * makes it read as one body of liquid rather than a row of independent bars —
 * it is how a disturbance in one place becomes movement somewhere else, a
 * moment later.
 *
 * The output is `heights`: one 0..1 per point, for you to draw as you like —
 * an SVG path, a canvas curve, a row of divs. It knows nothing about rendering.
 *
 * Cost is a handful of multiply-adds per point per frame, and `update()`
 * returns false the moment the surface is flat and still, so the render loop
 * can stop rather than idle.
 */

export type LiquidEdgeParams = {
  /** Samples across the surface. Default 15 — enough to curve, cheap to solve. */
  points?: number
  /** Pull toward the driven shape, per frame. Higher is tauter. Default 0.26. */
  tension?: number
  /** Velocity bled off per frame, 0..1. Lower rings longer. Default 0.14. */
  damping?: number
  /**
   * How much of the height difference each point trades with its neighbours per
   * frame. This is the travelling wave — 0 gives you independent springs and no
   * liquid at all. Default 0.24.
   */
  coupling?: number
  /** Width of the bulge under the pointer, in surface widths. Default 0.26. */
  spread?: number
  /**
   * How hard a sideways move throws the surface around. The bulge lags behind
   * the cursor and overshoots when it stops — the reason it reads as mass
   * rather than as a shape being positioned. Default 1.4.
   */
  slosh?: number
  /**
   * The ends are pinned to 0, like liquid held in a channel. Without this the
   * whole surface floats up and it reads as a bar resizing. Default true.
   */
  pinEnds?: boolean
}

/** Below this much movement and displacement everywhere, it has settled. */
const STILL = 0.0004
/** The largest sideways pointer move, in surface widths, that counts as a move. */
const MAX_STEP = 0.2

export class LiquidEdge {
  /** 0..1 displacement per point, left to right. Draw these. */
  heights: Float32Array
  /** Rate of change per point. Exposed for shading, motion blur, curiosity. */
  velocities: Float32Array

  points: number
  tension: number
  damping: number
  coupling: number
  spread: number
  slosh: number
  pinEnds: boolean

  /** Where the pointer is across the surface, 0..1, and how hard it presses. */
  private u = 0.5
  private amount = 0
  private lastU: number | null = null
  private scratch: Float32Array

  constructor({ points, tension, damping, coupling, spread, slosh, pinEnds }: LiquidEdgeParams = {}) {
    this.points = Math.max(3, points ?? 15)
    this.tension = tension ?? 0.26
    this.damping = damping ?? 0.14
    this.coupling = coupling ?? 0.24
    this.spread = spread ?? 0.26
    this.slosh = slosh ?? 1.4
    this.pinEnds = pinEnds ?? true

    this.heights = new Float32Array(this.points)
    this.velocities = new Float32Array(this.points)
    this.scratch = new Float32Array(this.points)
  }

  /**
   * Tell the surface where the pointer is (`u`, 0..1 across it) and how much it
   * is pressing (`amount`, 0..1 — MouseGravity's `pull` goes straight in here).
   *
   * Sideways movement between calls is turned into a shove, which is what makes
   * the bulge trail the cursor and overshoot when it stops.
   */
  drive(u: number, amount: number): void {
    const clamped = u < 0 ? 0 : u > 1 ? 1 : u
    if (this.lastU !== null && amount > 0) {
      // A pointer that teleports — a tab regaining focus, a dropped second of
      // frames, a synthetic event — is not a fast swipe, and treating it as one
      // throws the surface across the screen. Cap the shove at a plausible
      // single-frame move.
      const dU = Math.max(-MAX_STEP, Math.min(MAX_STEP, clamped - this.lastU))
      if (dU !== 0) {
        // the shove lands where the pointer came FROM, so the surface is left
        // behind rather than pushed ahead of the cursor
        this.splash(this.lastU, -dU * this.slosh * amount)
      }
    }
    this.lastU = clamped
    this.u = clamped
    this.amount = amount < 0 ? 0 : amount > 1 ? 1 : amount
  }

  /** A kick of velocity at a point, spread like the bulge. Use it for clicks. */
  splash(u: number, impulse: number): void {
    const n = this.points
    for (let i = 0; i < n; i++) {
      const d = i / (n - 1) - u
      this.velocities[i] += impulse * Math.exp(-(d * d) / (2 * this.spread * this.spread))
    }
  }

  /** Flattens it instantly, with no ring-out. */
  reset(): void {
    this.heights.fill(0)
    this.velocities.fill(0)
    this.lastU = null
    this.amount = 0
  }

  /**
   * Advances the surface. `dt` is in frames (1 = one 60fps frame); anything
   * larger is integrated in whole-frame substeps, because a spring solved in
   * one big step does not converge — it explodes.
   *
   * Returns false once the surface is flat and still, which is the signal to
   * stop the render loop.
   */
  update = (dt = 1): boolean => {
    const steps = Math.max(1, Math.min(4, Math.round(dt)))
    for (let s = 0; s < steps; s++) this.step()
    return !this.settled
  }

  private step(): void {
    const { heights: h, velocities: v, scratch, points: n, spread } = this
    const twoSigmaSq = 2 * spread * spread
    const last = n - 1

    for (let i = 0; i < n; i++) {
      if (this.pinEnds && (i === 0 || i === last)) {
        h[i] = 0
        v[i] = 0
        scratch[i] = 0
        continue
      }
      const d = i / last - this.u
      const target = this.amount * Math.exp(-(d * d) / twoSigmaSq)

      // neighbours, with the edge reflecting rather than absorbing — a wave
      // that dies at the wall never comes back and the surface reads as damped
      // cloth instead of liquid
      const left = i === 0 ? h[1] : h[i - 1]
      const right = i === last ? h[last - 1] : h[i + 1]

      v[i] += (target - h[i]) * this.tension
      v[i] += ((left + right) * 0.5 - h[i]) * this.coupling
      v[i] *= 1 - this.damping
      scratch[i] = h[i] + v[i]
    }

    for (let i = 0; i < n; i++) h[i] = scratch[i]
  }

  /** True when nothing is moving and nothing is displaced. */
  get settled(): boolean {
    const { heights: h, velocities: v, points: n } = this
    if (this.amount > STILL) return false
    for (let i = 0; i < n; i++) {
      if (h[i] > STILL || h[i] < -STILL) return false
      if (v[i] > STILL || v[i] < -STILL) return false
    }
    return true
  }

  /**
   * The highest point right now. Goes NEGATIVE on the rebound when the ends are
   * free; with `pinEnds` it bottoms out at 0, because the pinned ends are then
   * the highest thing on a dipped surface. Either way it is the true maximum —
   * clamping it would hide half the motion from anything reading it. For "how
   * much is happening", regardless of direction, use {@link amplitude}.
   */
  get peak(): number {
    let max = this.heights[0]
    for (let i = 1; i < this.points; i++) if (this.heights[i] > max) max = this.heights[i]
    return max
  }

  /** Largest displacement in either direction. This is the one to drive glow with. */
  get amplitude(): number {
    let max = 0
    for (let i = 0; i < this.points; i++) {
      const a = this.heights[i] < 0 ? -this.heights[i] : this.heights[i]
      if (a > max) max = a
    }
    return max
  }
}
