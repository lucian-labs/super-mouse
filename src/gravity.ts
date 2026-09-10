/**
 * MouseGravity — how close is the pointer to this thing, as a number you can
 * animate with.
 *
 * SuperMouse is bound to an element and only hears about the pointer while it
 * is over that element. Gravity is the opposite: it listens on the window and
 * reports how near the pointer is to a target it may never touch. That is what
 * you need to make something reach out and greet the cursor before contact —
 * a dock tab rising, a button swelling, a field of dots leaning.
 *
 * The output is `pull`: 1 when the pointer is on the target, 0 at `radius`
 * away and beyond, smoothed toward its target every `update()` so movement
 * reads as liquid rather than as a value being assigned.
 */

/** 3t² − 2t³. Ease in and out, no overshoot — the default shape of the pull. */
export const smoothstep = (t: number): number => t * t * (3 - 2 * t)

/** Sharper: nothing much happens until the pointer is genuinely close. */
export const easeInQuad = (t: number): number => t * t

/** Straight line, for when you want the raw distance back. */
export const linear = (t: number): number => t

export type MouseGravityParams = {
  /** What the pointer is being attracted to. */
  target: HTMLElement
  /** Distance in px at which the pull begins. Default 220. */
  radius?: number
  /**
   * Measure to the target's nearest EDGE (default) or to its centre. Edge is
   * right for anything wide — a bar across the bottom of the screen should
   * feel equally near along its whole length, which a centre measurement
   * would not give you.
   */
  from?: "edge" | "centre"
  /**
   * Ignore one axis when measuring. `y` answers "how far above it are you",
   * regardless of sideways distance.
   */
  axis?: "both" | "x" | "y"
  /** Maps 0..1 nearness onto 0..1 pull. Default {@link smoothstep}. */
  falloff?: (t: number) => number
  /**
   * How much of the remaining gap `update()` closes per frame, 0..1. Low is
   * syrup, high is snap. Default 0.18, which settles in about a fifth of a
   * second at 60fps.
   */
  stiffness?: number
  /**
   * Hold `pull` at 0 while the OS asks for reduced motion. Default true — this
   * effect is decoration, and decoration is what that setting is about.
   */
  respectReducedMotion?: boolean
  /**
   * Touch has no hover: a finger is either on the thing or nowhere near it, so
   * gravity from a touch point makes the target lunge out from under it.
   * Default true.
   */
  ignoreTouch?: boolean
  /** Fired from `update()` whenever the smoothed pull actually changes. */
  onChange?: (pull: number, gravity: MouseGravity) => void
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

export class MouseGravity {
  /** Smoothed 0..1. This is the one to animate with. */
  pull = 0
  /** Where `pull` is heading: the falloff applied to the current distance. */
  targetPull = 0
  /** Px from the pointer to the target, by the configured measure. */
  distance = Infinity
  /** Last pointer position seen, in client coordinates. */
  x = 0
  y = 0
  /** False until a usable pointer has been seen at all. */
  seen = false

  element: HTMLElement
  radius: number
  from: "edge" | "centre"
  axis: "both" | "x" | "y"
  falloff: (t: number) => number
  stiffness: number
  respectReducedMotion: boolean
  ignoreTouch: boolean
  onChange?: (pull: number, gravity: MouseGravity) => void

  constructor({
    target,
    radius,
    from,
    axis,
    falloff,
    stiffness,
    respectReducedMotion,
    ignoreTouch,
    onChange,
  }: MouseGravityParams) {
    this.element = target
    this.radius = radius ?? 220
    this.from = from ?? "edge"
    this.axis = axis ?? "both"
    this.falloff = falloff ?? smoothstep
    this.stiffness = stiffness ?? 0.18
    this.respectReducedMotion = respectReducedMotion ?? true
    this.ignoreTouch = ignoreTouch ?? true
    this.onChange = onChange

    window.addEventListener("pointermove", this.handleMove, { passive: true })
    // the pointer leaving the document never produces another move, so without
    // this the target would stay reached-out at whatever the last value was
    document.addEventListener("pointerleave", this.handleOut)
    window.addEventListener("blur", this.handleOut)
  }

  private get reduced(): boolean {
    if (!this.respectReducedMotion) return false
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
  }

  /** Distance from a client point to the target, by the configured measure. */
  measure(x: number, y: number): number {
    const r = this.element.getBoundingClientRect()
    let dx: number
    let dy: number
    if (this.from === "centre") {
      dx = x - (r.left + r.width / 2)
      dy = y - (r.top + r.height / 2)
    } else {
      // 0 while inside the box on that axis, else the gap to the nearer edge
      dx = Math.max(r.left - x, 0, x - r.right)
      dy = Math.max(r.top - y, 0, y - r.bottom)
    }
    if (this.axis === "x") return Math.abs(dx)
    if (this.axis === "y") return Math.abs(dy)
    return Math.hypot(dx, dy)
  }

  handleMove = (e: Event) => {
    const p = e as PointerEvent
    if (this.ignoreTouch && p.pointerType === "touch") return
    this.seen = true
    this.x = p.clientX
    this.y = p.clientY
    this.distance = this.measure(this.x, this.y)
    this.targetPull = this.reduced ? 0 : this.falloff(clamp01(1 - this.distance / this.radius))
  }

  handleOut = () => {
    this.distance = Infinity
    this.targetPull = 0
  }

  /**
   * Eases `pull` toward where the pointer says it should be. Call once per
   * frame; `dt` is in frames (1 = one 60fps frame) so the feel holds at any
   * refresh rate.
   *
   * Returns true while there is still movement to render, which is the signal
   * to keep a rAF loop alive — and, more usefully, to let it stop.
   */
  update = (dt = 1): boolean => {
    const before = this.pull
    // per-frame stiffness compounded over dt frames, so 144Hz eases at the
    // same rate in seconds as 60Hz rather than four times faster
    const k = 1 - Math.pow(1 - this.stiffness, dt)
    this.pull += (this.targetPull - this.pull) * k
    // land exactly, or the loop never gets to stop
    if (Math.abs(this.targetPull - this.pull) < 0.001) this.pull = this.targetPull
    if (this.pull !== before) this.onChange?.(this.pull, this)
    return this.pull !== this.targetPull || this.pull !== 0
  }

  /** Removes every listener this instance registered. */
  destroy = () => {
    window.removeEventListener("pointermove", this.handleMove)
    document.removeEventListener("pointerleave", this.handleOut)
    window.removeEventListener("blur", this.handleOut)
  }
}
