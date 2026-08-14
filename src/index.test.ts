// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { SuperMouse } from "./index"

// jsdom gives every element a zero-sized box, so u/v need a stubbed rect
const makeElement = (box = { left: 100, top: 50, width: 200, height: 200 }) => {
  const el = document.createElement("div")
  document.body.append(el)
  el.getBoundingClientRect = () =>
    ({
      ...box,
      right: box.left + box.width,
      bottom: box.top + box.height,
      x: box.left,
      y: box.top,
      toJSON: () => "",
    }) as DOMRect
  return el
}

const move = (el: HTMLElement, clientX: number, clientY: number) =>
  el.dispatchEvent(
    new MouseEvent("mousemove", { clientX, clientY, bubbles: true })
  )

const instances: SuperMouse[] = []
const build = (
  params: Partial<ConstructorParameters<typeof SuperMouse>[0]> = {}
) => {
  const element = params.element ?? makeElement()
  const mouse = new SuperMouse({ ...params, element })
  instances.push(mouse)
  return { mouse, element }
}

afterEach(() => {
  while (instances.length) instances.pop()!.destroy()
  document.body.innerHTML = ""
})

describe("position", () => {
  it("normalizes u/v against the element, not the window", () => {
    const { mouse, element } = build()

    move(element, 100, 50)
    expect(mouse.u).toBe(0)
    expect(mouse.v).toBe(0)

    move(element, 300, 250)
    expect(mouse.u).toBe(1)
    expect(mouse.v).toBe(1)
  })

  it("survives a zero-sized element without NaN", () => {
    const element = makeElement({ left: 0, top: 0, width: 0, height: 0 })
    const { mouse } = build({ element })

    move(element, 10, 10)
    expect(mouse.u).toBe(0)
    expect(mouse.v).toBe(0)
  })
})

describe("callbacks", () => {
  it("fires onMove on the very first move", () => {
    const onMove = vi.fn()
    const { element } = build({ onMove })

    move(element, 150, 100)
    expect(onMove).toHaveBeenCalledTimes(1)
  })

  it("fires onEnter and onLeave", () => {
    const onEnter = vi.fn()
    const onLeave = vi.fn()
    const { mouse, element } = build({ onEnter, onLeave })

    element.dispatchEvent(new MouseEvent("mouseenter"))
    expect(onEnter).toHaveBeenCalledTimes(1)
    expect(mouse.onElement).toBe(true)

    element.dispatchEvent(new MouseEvent("mouseleave"))
    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(mouse.onElement).toBe(false)
  })

  it("fires onDoubleClick", () => {
    const onDoubleClick = vi.fn()
    const { element } = build({ onDoubleClick })

    element.dispatchEvent(new MouseEvent("dblclick"))
    expect(onDoubleClick).toHaveBeenCalledTimes(1)
  })
})

describe("buttons", () => {
  it("clears a button released outside the element", () => {
    const { mouse, element } = build()

    element.dispatchEvent(new MouseEvent("mousedown", { button: 0 }))
    expect(mouse.clicked).toBe(true)

    // released over some other element entirely
    window.dispatchEvent(new MouseEvent("mouseup", { button: 0 }))
    expect(mouse.clicked).toBe(false)
  })

  it("fires onRelease once for a press inside dragged out and released", () => {
    const onRelease = vi.fn()
    const { mouse, element } = build({ onRelease })

    element.dispatchEvent(
      new MouseEvent("mousedown", { button: 0, clientX: 150, clientY: 150 })
    )
    element.dispatchEvent(new MouseEvent("mouseleave"))
    window.dispatchEvent(new MouseEvent("mouseup", { button: 0 }))

    expect(onRelease).toHaveBeenCalledTimes(1)
    expect(mouse.clicked).toBe(false)
    expect(mouse.buttons[0]).toBe(false)

    // a second stray release is not ours to report
    window.dispatchEvent(new MouseEvent("mouseup", { button: 0 }))
    expect(onRelease).toHaveBeenCalledTimes(1)
  })

  it("ignores a release for a press that never landed on the element", () => {
    const onRelease = vi.fn()
    const { mouse } = build({ onRelease })

    window.dispatchEvent(new MouseEvent("mousedown", { button: 0 }))
    window.dispatchEvent(new MouseEvent("mouseup", { button: 0 }))

    expect(onRelease).not.toHaveBeenCalled()
    expect(mouse.clicked).toBe(false)
  })

  it("only clears the button that was actually released", () => {
    const { mouse, element } = build()

    element.dispatchEvent(new MouseEvent("mousedown", { button: 0 }))
    element.dispatchEvent(new MouseEvent("mousedown", { button: 2 }))
    window.dispatchEvent(new MouseEvent("mouseup", { button: 2 }))

    expect(mouse.buttons[0]).toBe(true)
    expect(mouse.clicked).toBe(true)

    window.dispatchEvent(new MouseEvent("mouseup", { button: 0 }))
    expect(mouse.clicked).toBe(false)
  })

  it("clears held buttons and keys on window blur", () => {
    const { mouse, element } = build()

    element.dispatchEvent(new MouseEvent("mousedown", { button: 0 }))
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }))
    window.dispatchEvent(new Event("blur"))

    expect(mouse.clicked).toBe(false)
    expect(mouse.keys.Shift).toBeUndefined()
  })

  it("flips dragging once past the threshold, and clears on release", () => {
    const { mouse, element } = build()

    element.dispatchEvent(
      new MouseEvent("mousedown", { button: 0, clientX: 150, clientY: 150 })
    )
    move(element, 151, 150)
    expect(mouse.dragging).toBe(false)

    move(element, 180, 150)
    expect(mouse.dragging).toBe(true)

    window.dispatchEvent(new MouseEvent("mouseup", { button: 0 }))
    expect(mouse.dragging).toBe(false)
  })
})

describe("keys", () => {
  it("releases keys on keyup", () => {
    const { mouse } = build()

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }))
    expect(mouse.keys.Shift).toBe(true)

    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }))
    expect(mouse.keys.Shift).toBe(false)
  })

  it("honours an explicit keyTarget", () => {
    const element = makeElement()
    const { mouse } = build({ element, keyTarget: element })

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }))
    expect(mouse.keys.a).toBeUndefined()

    element.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }))
    expect(mouse.keys.a).toBe(true)
  })
})

describe("scroll", () => {
  it("scales and inverts scrollInertia the same way as the axes", () => {
    const { mouse, element } = build({ scrollScale: 0.1 })

    element.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, deltaX: 0 }))
    expect(mouse.scrollY).toBeCloseTo(-10)
    expect(mouse.scrollInertia).toBeCloseTo(-10)
  })
})

describe("update", () => {
  it("decays exponentially, so dt and updateScale never amplify", () => {
    const cases: { dt: number; updateScale: number }[] = [
      { dt: 1, updateScale: 1 },
      { dt: 1 / 60, updateScale: 1 },
      { dt: 1, updateScale: 2 },
      { dt: 4, updateScale: 5 },
    ]

    for (const { dt, updateScale } of cases) {
      const { mouse } = build({ updateScale })
      mouse.inertia = 1
      mouse.scrollInertia = 1

      for (let i = 0; i < 60; i++) mouse.update(dt)

      expect(mouse.inertia).toBeLessThan(1)
      expect(mouse.inertia).toBeGreaterThan(0)
      expect(mouse.scrollInertia).toBe(mouse.inertia)
    }
  })

  it("matches 0.97 ** (dt * updateScale) per call", () => {
    const { mouse } = build({ updateScale: 2 })
    mouse.inertia = 1
    mouse.update(0.5)

    expect(mouse.inertia).toBeCloseTo(0.97, 10)
  })
})

describe("destroy", () => {
  it("stops responding to every event it bound", () => {
    const onMove = vi.fn()
    const { mouse, element } = build({ onMove })

    mouse.destroy()

    move(element, 150, 150)
    element.dispatchEvent(new MouseEvent("mousedown", { button: 0 }))
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "x" }))
    element.dispatchEvent(new WheelEvent("wheel", { deltaY: 100 }))

    expect(onMove).not.toHaveBeenCalled()
    expect(mouse.clicked).toBe(false)
    expect(mouse.keys.x).toBeUndefined()
    expect(mouse.scrollY).toBe(0)
  })
})
