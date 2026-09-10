// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MouseGravity, easeInQuad, linear, smoothstep } from "./gravity"

/** A target at 100..300 x, 400..500 y, with a rect that does not depend on layout. */
const makeTarget = (rect: Partial<DOMRect> = {}): HTMLElement => {
  const el = document.createElement("div")
  const box = { left: 100, right: 300, top: 400, bottom: 500, width: 200, height: 100, x: 100, y: 400, ...rect }
  el.getBoundingClientRect = () => ({ ...box, toJSON: () => box }) as DOMRect
  document.body.appendChild(el)
  return el
}

const move = (x: number, y: number, pointerType = "mouse") => {
  const e = new Event("pointermove") as PointerEvent & { clientX: number; clientY: number; pointerType: string }
  Object.assign(e, { clientX: x, clientY: y, pointerType })
  window.dispatchEvent(e)
}

/** Run update() until it settles, so tests assert the landed value not the ease. */
const settle = (g: MouseGravity, frames = 200) => {
  for (let i = 0; i < frames; i++) if (!g.update(1)) break
}

describe("falloff curves", () => {
  it("all map 0 to 0 and 1 to 1", () => {
    for (const f of [smoothstep, easeInQuad, linear]) {
      expect(f(0)).toBe(0)
      expect(f(1)).toBe(1)
    }
  })

  it("smoothstep is flat at both ends and steep in the middle", () => {
    expect(smoothstep(0.5)).toBeCloseTo(0.5)
    expect(smoothstep(0.1)).toBeLessThan(0.1)
    expect(smoothstep(0.9)).toBeGreaterThan(0.9)
  })
})

describe("MouseGravity", () => {
  let g: MouseGravity

  beforeEach(() => {
    document.body.innerHTML = ""
  })

  it("is 0 until a pointer has been seen", () => {
    g = new MouseGravity({ target: makeTarget() })
    expect(g.pull).toBe(0)
    expect(g.seen).toBe(false)
    g.destroy()
  })

  it("reaches full pull with the pointer on the target", () => {
    g = new MouseGravity({ target: makeTarget() })
    move(200, 450)
    expect(g.distance).toBe(0)
    settle(g)
    expect(g.pull).toBe(1)
    g.destroy()
  })

  it("stays at 0 beyond the radius", () => {
    g = new MouseGravity({ target: makeTarget(), radius: 100 })
    move(200, 250) // 150px above the top edge
    settle(g)
    expect(g.pull).toBe(0)
    g.destroy()
  })

  it("grows as the pointer closes in", () => {
    g = new MouseGravity({ target: makeTarget(), radius: 200 })
    move(200, 250) // 150 away
    settle(g)
    const far = g.pull
    move(200, 350) // 50 away
    settle(g)
    expect(g.pull).toBeGreaterThan(far)
    expect(far).toBeGreaterThan(0)
    g.destroy()
  })

  it("measures to the nearest edge, so a wide target pulls along its length", () => {
    g = new MouseGravity({ target: makeTarget(), radius: 200 })
    move(120, 350) // above the left end
    settle(g)
    const left = g.pull
    move(280, 350) // above the right end, same height
    settle(g)
    expect(g.pull).toBeCloseTo(left, 5)
    g.destroy()
  })

  it("from:centre makes the ends of a wide target further away than its middle", () => {
    g = new MouseGravity({ target: makeTarget(), from: "centre", radius: 400 })
    move(200, 350)
    settle(g)
    const middle = g.pull
    move(300, 350)
    settle(g)
    expect(g.pull).toBeLessThan(middle)
    g.destroy()
  })

  it("axis:y ignores sideways distance", () => {
    g = new MouseGravity({ target: makeTarget(), axis: "y", radius: 200 })
    move(200, 350)
    settle(g)
    const above = g.pull
    move(2000, 350) // miles to the side, same height
    settle(g)
    expect(g.pull).toBeCloseTo(above, 5)
    g.destroy()
  })

  it("ignores touch by default, and honours it when asked", () => {
    g = new MouseGravity({ target: makeTarget() })
    move(200, 450, "touch")
    settle(g)
    expect(g.pull).toBe(0)
    g.destroy()

    g = new MouseGravity({ target: makeTarget(), ignoreTouch: false })
    move(200, 450, "touch")
    settle(g)
    expect(g.pull).toBe(1)
    g.destroy()
  })

  it("eases rather than jumping, and lands exactly", () => {
    g = new MouseGravity({ target: makeTarget(), stiffness: 0.2 })
    move(200, 450)
    g.update(1)
    expect(g.pull).toBeGreaterThan(0)
    expect(g.pull).toBeLessThan(1)
    settle(g)
    expect(g.pull).toBe(1)
    g.destroy()
  })

  it("update() reports when there is nothing left to animate", () => {
    g = new MouseGravity({ target: makeTarget() })
    expect(g.update(1)).toBe(false) // resting at 0
    move(200, 450)
    expect(g.update(1)).toBe(true) // on its way up
    settle(g)
    expect(g.update(1)).toBe(true) // resting at 1 is still "rendered"
    g.destroy()
  })

  it("a bigger dt covers the same ground as several small ones", () => {
    const a = new MouseGravity({ target: makeTarget(), stiffness: 0.2 })
    const b = new MouseGravity({ target: makeTarget(), stiffness: 0.2 })
    move(200, 450)
    a.update(4)
    for (let i = 0; i < 4; i++) b.update(1)
    expect(a.pull).toBeCloseTo(b.pull, 6)
    a.destroy()
    b.destroy()
  })

  it("releases when the pointer leaves the document", () => {
    g = new MouseGravity({ target: makeTarget() })
    move(200, 450)
    settle(g)
    expect(g.pull).toBe(1)
    document.dispatchEvent(new Event("pointerleave"))
    settle(g)
    expect(g.pull).toBe(0)
    g.destroy()
  })

  it("calls onChange only while the value is moving", () => {
    const onChange = vi.fn()
    g = new MouseGravity({ target: makeTarget(), onChange })
    g.update(1)
    expect(onChange).not.toHaveBeenCalled()
    move(200, 450)
    g.update(1)
    expect(onChange).toHaveBeenCalledOnce()
    settle(g)
    const calls = onChange.mock.calls.length
    g.update(1)
    expect(onChange.mock.calls.length).toBe(calls)
    g.destroy()
  })

  it("destroy() stops it hearing the pointer", () => {
    g = new MouseGravity({ target: makeTarget() })
    g.destroy()
    move(200, 450)
    settle(g)
    expect(g.pull).toBe(0)
  })
})
