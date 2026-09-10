import { describe, expect, it } from "vitest"
import { LiquidEdge } from "./liquid"

/** Advance until it stops moving, or give up. Returns frames taken. */
const settle = (l: LiquidEdge, limit = 2000): number => {
  for (let i = 0; i < limit; i++) if (!l.update(1)) return i
  return limit
}

const run = (l: LiquidEdge, frames: number) => {
  for (let i = 0; i < frames; i++) l.update(1)
}

describe("LiquidEdge", () => {
  it("starts flat and still, and says so", () => {
    const l = new LiquidEdge()
    expect(l.peak).toBe(0)
    expect(l.settled).toBe(true)
    expect(l.update(1)).toBe(false)
  })

  it("rises under the pointer", () => {
    const l = new LiquidEdge()
    l.drive(0.5, 1)
    run(l, 30)
    expect(l.peak).toBeGreaterThan(0.5)
  })

  it("rises most where the pointer is", () => {
    const l = new LiquidEdge({ points: 21 })
    l.drive(0.25, 1)
    run(l, 40)
    const h = Array.from(l.heights)
    const tallest = h.indexOf(Math.max(...h))
    // 0.25 of 20 spans = index 5, give or take the wave
    expect(Math.abs(tallest - 5)).toBeLessThanOrEqual(2)
  })

  it("keeps the ends pinned so it reads as liquid in a channel", () => {
    const l = new LiquidEdge()
    l.drive(0.5, 1)
    run(l, 60)
    expect(l.heights[0]).toBe(0)
    expect(l.heights[l.points - 1]).toBe(0)
  })

  it("floats the ends too when told not to pin them", () => {
    const l = new LiquidEdge({ pinEnds: false })
    l.drive(0.5, 1)
    run(l, 60)
    expect(l.heights[0]).toBeGreaterThan(0)
  })

  it("carries a disturbance sideways — the coupling is doing something", () => {
    const coupled = new LiquidEdge({ points: 21, coupling: 0.3 })
    const independent = new LiquidEdge({ points: 21, coupling: 0 })
    for (const l of [coupled, independent]) {
      l.drive(0.5, 1)
      run(l, 25)
    }
    // far from the bulge, only the coupled one has moved
    expect(coupled.heights[2]).toBeGreaterThan(independent.heights[2])
  })

  it("lags behind a pointer that moves, rather than tracking it exactly", () => {
    const l = new LiquidEdge({ points: 21 })
    l.drive(0.2, 1)
    run(l, 40)
    l.drive(0.8, 1) // jump to the far end
    l.update(1)
    const h = Array.from(l.heights)
    const tallest = h.indexOf(Math.max(...h))
    expect(tallest).toBeLessThan(15) // still nearer where it was than where the pointer is
  })

  it("settles back to flat after the pointer leaves", () => {
    const l = new LiquidEdge()
    l.drive(0.5, 1)
    run(l, 40)
    expect(l.peak).toBeGreaterThan(0.4)
    l.drive(0.5, 0)
    const frames = settle(l)
    expect(frames).toBeGreaterThan(5) // it rings, it does not blink out
    expect(frames).toBeLessThan(600) // but it does actually stop
    expect(l.peak).toBeLessThan(0.001)
  })

  it("rings for longer with less damping", () => {
    const loose = new LiquidEdge({ damping: 0.05 })
    const tight = new LiquidEdge({ damping: 0.4 })
    for (const l of [loose, tight]) {
      l.drive(0.5, 1)
      run(l, 40)
      l.drive(0.5, 0)
    }
    expect(settle(loose)).toBeGreaterThan(settle(tight))
  })

  it("stays bounded — a spring solved badly explodes, and this must not", () => {
    const l = new LiquidEdge()
    for (let i = 0; i < 400; i++) {
      l.drive(Math.random(), 1)
      l.update(4) // the biggest step it will take
    }
    for (let i = 0; i < l.points; i++) {
      expect(Number.isFinite(l.heights[i])).toBe(true)
      expect(Math.abs(l.heights[i])).toBeLessThan(4)
    }
  })

  it("integrates a big dt in substeps rather than one bad leap", () => {
    const big = new LiquidEdge()
    const small = new LiquidEdge()
    big.drive(0.5, 1)
    small.drive(0.5, 1)
    big.update(4)
    for (let i = 0; i < 4; i++) small.update(1)
    expect(big.peak).toBeCloseTo(small.peak, 5)
  })

  it("splash kicks it without the pointer pressing at all", () => {
    const l = new LiquidEdge()
    l.splash(0.5, 0.4)
    run(l, 3)
    expect(l.peak).toBeGreaterThan(0)
    expect(settle(l)).toBeLessThan(600)
  })

  it("swings below rest on the rebound, and peak says so when the ends are free", () => {
    const l = new LiquidEdge({ pinEnds: false })
    l.splash(0.5, 0.4)
    let dipped = false
    for (let i = 0; i < 40; i++) {
      l.update(1)
      if (l.peak < 0) dipped = true
    }
    // a peak clamped at 0 would hide the entire underswing from anything reading it
    expect(dipped).toBe(true)
  })

  it("amplitude sees the underswing that pinned ends hide from peak", () => {
    const l = new LiquidEdge() // ends pinned at 0, so peak can never go below it
    l.splash(0.5, 0.4)
    run(l, 10)
    expect(Math.min(...l.heights)).toBeLessThan(0) // the surface is dipped
    expect(l.peak).toBe(0) // and peak only sees the pinned ends
    expect(l.amplitude).toBeGreaterThan(0.1) // amplitude is what you want here
  })

  it("a teleporting pointer does not throw the surface across the room", () => {
    const jumped = new LiquidEdge({ points: 21 })
    const stepped = new LiquidEdge({ points: 21 })
    jumped.drive(0.1, 1)
    stepped.drive(0.1, 1)
    jumped.drive(0.9, 1) // one impossible leap
    for (let u = 0.1; u <= 0.9001; u += 0.1) stepped.drive(u, 1) // the same trip, walked
    expect(jumped.amplitude).toBeLessThanOrEqual(stepped.amplitude * 2)
    run(jumped, 200)
    expect(jumped.amplitude).toBeLessThan(4)
  })

  it("reset flattens it immediately", () => {
    const l = new LiquidEdge()
    l.drive(0.5, 1)
    run(l, 40)
    l.reset()
    expect(l.peak).toBe(0)
    expect(l.settled).toBe(true)
  })

  it("never reports settled while the pointer is still pressing", () => {
    const l = new LiquidEdge()
    l.drive(0.5, 1)
    run(l, 500)
    expect(l.settled).toBe(false)
    expect(l.update(1)).toBe(true)
  })
})
