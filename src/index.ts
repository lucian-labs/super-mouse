export type SuperMouseParams = {
  element: HTMLElement
  /**
   * Where keyboard listeners are bound. Defaults to `window`, because an
   * element only receives key events while focused and the usual targets
   * (canvas, div) are not focusable without a tabindex.
   */
  keyTarget?: HTMLElement | Window
  debug?: boolean
  enableContext?: boolean
  scrollScale?: number
  updateScale?: number
  /** Pixels the pointer must travel while held before `dragging` flips true. */
  dragThreshold?: number
  onClick?: (e: MouseEvent) => void
  onDoubleClick?: (e: MouseEvent) => void
  onMove?: (e: MouseEvent) => void
  onRelease?: (e: MouseEvent) => void
  onScroll?: (e: WheelEvent) => void
  onEnter?: () => void
  onLeave?: () => void
  onContext?: () => void
}

type MouseButtons = Record<number, boolean>
type KeyMap = Record<string, boolean>

export class SuperMouse {
  // position
  x = 0
  y = 0
  u = 0
  v = 0

  // scroll behavior
  scrollX = 0
  scrollY = 0
  scrollInertia = 0

  // phyiscs
  inertia = 0

  scrollScale: number
  updateScale: number
  dragThreshold: number

  onClick?: (e: MouseEvent) => void
  onDoubleClick?: (e: MouseEvent) => void
  onMove?: (e: MouseEvent) => void
  onRelease?: (e: MouseEvent) => void
  onScroll?: (e: WheelEvent) => void
  onEnter?: () => void
  onLeave?: () => void
  onContext?: () => void

  started = false
  debug: boolean
  dragging = false
  buttons: MouseButtons = {}
  keys: KeyMap = {}
  element: HTMLElement
  keyTarget: HTMLElement | Window
  onElement = false
  enableContext: boolean

  // where the pointer was when the first button went down, for the drag test
  private pressOrigin: { x: number; y: number } | null = null

  constructor({
    debug,
    enableContext,
    element,
    keyTarget,
    scrollScale,
    updateScale,
    dragThreshold,
    onClick,
    onDoubleClick,
    onMove,
    onRelease,
    onScroll,
    onEnter,
    onLeave,
    onContext,
  }: SuperMouseParams) {
    this.debug = !!debug
    this.enableContext = !!enableContext

    this.element = element
    this.keyTarget = keyTarget ?? window

    this.scrollScale = scrollScale ?? 1
    this.updateScale = updateScale ?? 1
    this.dragThreshold = dragThreshold ?? 3

    this.onClick = onClick
    this.onDoubleClick = onDoubleClick
    this.onMove = onMove
    this.onRelease = onRelease
    this.onScroll = onScroll
    this.onEnter = onEnter
    this.onLeave = onLeave
    this.onContext = onContext

    this.keyTarget.addEventListener("keydown", this.handleKeyDown)
    this.keyTarget.addEventListener("keyup", this.handleKeyUp)

    this.element.addEventListener("mousedown", this.handleClick)
    this.element.addEventListener("mousemove", this.handleMove)
    this.element.addEventListener("dblclick", this.handleDoubleClick)
    // handleScroll never calls preventDefault, so there is nothing to gain
    // from making the compositor wait on it
    this.element.addEventListener("wheel", this.handleScroll, { passive: true })

    this.element.addEventListener("mouseenter", this.handleEnter)
    this.element.addEventListener("mouseleave", this.handleLeave)
    this.element.addEventListener("contextmenu", this.handleContext)

    // release and blur are window-scoped: a button released (or the tab lost)
    // outside the element must still clear, or `buttons` latches down forever
    window.addEventListener("mouseup", this.handleRelease)
    window.addEventListener("blur", this.handleBlur)
  }

  // GETTERS

  get clicked() {
    return Object.values(this.buttons).includes(true)
  }

  // HANDLERS

  handleKeyDown = (e: Event) => {
    if (!(e instanceof KeyboardEvent)) return
    this.keys[e.key] = true
  }

  handleKeyUp = (e: Event) => {
    if (!(e instanceof KeyboardEvent)) return
    this.keys[e.key] = false
  }

  handleClick = (e: MouseEvent) => {
    this.buttons[e.button] = true
    this.pressOrigin = { x: e.clientX, y: e.clientY }
    if (this.debug) console.log("SuperMouse.click =>", e, this)

    this.onClick?.(e)
  }

  handleDoubleClick = (e: MouseEvent) => {
    if (this.debug) console.log("SuperMouse.doubleClick =>", e, this)

    this.onDoubleClick?.(e)
  }

  handleRelease = (e: MouseEvent) => {
    // the listener is on window so a release outside the element still clears,
    // but that also means we see every release on the page - only the ones
    // matching a press this instance recorded are ours to report
    if (!this.buttons[e.button]) return

    this.buttons[e.button] = false
    if (!this.clicked) {
      this.dragging = false
      this.pressOrigin = null
    }
    if (this.debug) console.log("SuperMouse.release =>", e, this)

    this.onRelease?.(e)
  }

  handleEnter = () => {
    this.onElement = true
    this.onEnter?.()
  }

  handleLeave = () => {
    this.onElement = false
    this.onLeave?.()
  }

  handleContext = (e: Event) => {
    if (!this.enableContext) e.preventDefault()

    this.onContext?.()
  }

  // losing the window drops the keyup/mouseup we would otherwise wait for
  handleBlur = () => {
    this.buttons = {}
    this.keys = {}
    this.dragging = false
    this.pressOrigin = null
  }

  handleScroll = (e: WheelEvent) => {
    // same inversion and scale as scrollX/scrollY, so all three agree
    this.scrollInertia += (e.deltaY + e.deltaX) * -1 * this.scrollScale

    this.scrollX += e.deltaX * -1 * this.scrollScale
    this.scrollY += e.deltaY * -1 * this.scrollScale
    if (this.debug) console.log("SuperMouse.scroll", this.scrollX, this.scrollY)

    this.onScroll?.(e)
  }

  handleMove = (e: MouseEvent) => {
    const lastU = this.u
    const lastV = this.v

    this.x = e.clientX
    this.y = e.clientY

    // normalized against the element the listeners are bound to, so u/v are
    // usable as-is for drawing into it
    const rect = this.element.getBoundingClientRect()
    this.u = rect.width ? (this.x - rect.left) / rect.width : 0
    this.v = rect.height ? (this.y - rect.top) / rect.height : 0

    if (this.started) {
      const force = (lastU - this.u) ** 2 + (lastV - this.v) ** 2
      this.inertia += force * 50
    } else {
      // first move has no previous sample, so there is no delta to square
      this.started = true
    }

    if (!this.dragging && this.pressOrigin && this.clicked) {
      const dx = this.x - this.pressOrigin.x
      const dy = this.y - this.pressOrigin.y
      if (Math.hypot(dx, dy) > this.dragThreshold) this.dragging = true
    }

    if (this.debug) console.log("SuperMouse.move", this.u, this.v)

    this.onMove?.(e)
  }

  /**
   * Decays both inertia values. Call once per frame.
   * `dt` is in frames (1 = one 60fps frame), so decay stays stable at any
   * frame rate and `updateScale` scales how fast it falls off.
   */
  update = (dt = 1) => {
    const decay = Math.pow(0.97, dt * this.updateScale)
    this.inertia *= decay
    this.scrollInertia *= decay

    if (this.debug) console.log("SuperMouse.update", this.inertia)
  }

  /** Removes every listener this instance registered. */
  destroy = () => {
    this.keyTarget.removeEventListener("keydown", this.handleKeyDown)
    this.keyTarget.removeEventListener("keyup", this.handleKeyUp)

    this.element.removeEventListener("mousedown", this.handleClick)
    this.element.removeEventListener("mousemove", this.handleMove)
    this.element.removeEventListener("dblclick", this.handleDoubleClick)
    this.element.removeEventListener("wheel", this.handleScroll)

    this.element.removeEventListener("mouseenter", this.handleEnter)
    this.element.removeEventListener("mouseleave", this.handleLeave)
    this.element.removeEventListener("contextmenu", this.handleContext)

    window.removeEventListener("mouseup", this.handleRelease)
    window.removeEventListener("blur", this.handleBlur)
  }
}
