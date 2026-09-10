# SuperMouse™

**[Live demo →](https://super-mouse.lucianlabs.ca)** · [npm](https://www.npmjs.com/package/@dank-inc/super-mouse) · [all packages](https://lucianlabs.ca/packages/)

[![npm version](https://badge.fury.io/js/%40dank-inc%2Fsuper-mouse.svg)](https://badge.fury.io/js/%40dank-inc%2Fsuper-mouse)

```bash
npm install @dank-inc/super-mouse
```

A dank mouse utility that does some neat physics-esque stuff and handles modifier keys, to be used with creative applications :)

SuperMouse binds the listeners once and keeps a plain mutable state object — position, buttons, keys, scroll offsets, decaying inertia — that you read in your render loop instead of wiring six event handlers.

## Usage

```ts
import { SuperMouse } from "@dank-inc/super-mouse"

const canvas = document.querySelector("canvas")!
const mouse = new SuperMouse({ element: canvas, scrollScale: 0.01 })

const draw = () => {
  // u/v are 0..1 across the element, so they map straight onto the canvas
  ctx.fillRect(mouse.u * canvas.width, mouse.v * canvas.height, 10, 10)
  if (mouse.clicked) doSomething()

  mouse.update() // decays inertia — nothing decays unless you call this
  requestAnimationFrame(draw)
}

draw()

// when the component unmounts / the sketch is torn down
mouse.destroy()
```

**`update()` is not optional.** `inertia` and `scrollInertia` only accumulate until you call it; without a per-frame `update()` they grow forever.

## Options

| option | default | what it does |
| --- | --- | --- |
| `element` | — | required; mouse/wheel listeners bind here, and `u`/`v` are normalized against its box |
| `keyTarget` | `window` | where keyboard listeners bind. An element only gets key events while focused, so element scope needs a `tabindex` |
| `debug` | `false` | logs every event to the console |
| `enableContext` | `false` | when false, `contextmenu` is prevented on the element. Writable at runtime |
| `scrollScale` | `1` | multiplies wheel deltas into `scrollX`, `scrollY` and `scrollInertia` |
| `updateScale` | `1` | scales the decay rate applied by `update()` |
| `dragThreshold` | `3` | pixels the pointer must travel while a button is held before `dragging` flips true |
| `captureScroll` | `true` | stops a wheel over the element from also scrolling the page — the deltas already drive `scrollX`/`scrollY`, so letting both happen means one gesture drives two things |
| `captureDrag` | `true` | stops a drag that starts on the element from selecting page text or beginning a native image drag |
| `onClick` | — | `(e: MouseEvent) => void`, on mousedown |
| `onDoubleClick` | — | `(e: MouseEvent) => void`, on dblclick |
| `onMove` | — | `(e: MouseEvent) => void` |
| `onRelease` | — | `(e: MouseEvent) => void`, fires even when the release lands outside the element |
| `onScroll` | — | `(e: WheelEvent) => void` |
| `onEnter` / `onLeave` | — | `() => void`, on mouseenter / mouseleave |
| `onContext` | — | `() => void`, on contextmenu |

Every callback is also a writable instance property, so `mouse.onClick = fn` after construction works.


The two `capture*` options exist because this library takes over an element's
pointer interaction. By default the element keeps the gesture: a wheel over a
canvas drives that canvas, not the document behind it, and a drag across it is
a gesture rather than a text selection. Set either to `false` where the element
is ordinary inline content and the page should still respond normally.

## State

| field | type | notes |
| --- | --- | --- |
| `x` / `y` | `number` | viewport pixels (`clientX` / `clientY`) |
| `u` / `v` | `number` | position normalized against the element box: `0,0` top-left, `1,1` bottom-right |
| `inertia` | `number` | accumulated movement energy, decayed by `update()` |
| `scrollX` / `scrollY` | `number` | accumulated wheel delta, inverted and scaled by `scrollScale` |
| `scrollInertia` | `number` | accumulated wheel energy, same sign and scale as the axes, decayed by `update()` |
| `buttons` | `Record<number, boolean>` | keyed by `MouseEvent.button` |
| `clicked` | `boolean` (getter) | true while any button is down |
| `keys` | `Record<string, boolean>` | keyed by `KeyboardEvent.key`, true while held |
| `dragging` | `boolean` | true once the pointer moves past `dragThreshold` with a button held |
| `onElement` | `boolean` | true between mouseenter and mouseleave |
| `started` | `boolean` | true after the first mousemove |

Buttons and keys are cleared on window `blur`, so alt-tabbing mid-press does not strand them.

## Methods

- `update(dt = 1)` — decays both inertia values by `0.97 ** (dt * updateScale)`. `dt` is in frames, where `1` is one 60fps frame; pass your own frame delta for frame-rate-independent decay.
- `destroy()` — removes every listener the constructor added. Call it on unmount or hot reload.

## MouseGravity — reaching out before contact

`SuperMouse` is bound to an element and only hears the pointer while it is over
that element. `MouseGravity` is the other half: it listens on the window and
tells you how *near* the pointer is to something it may never touch. That is
what you need to make a thing greet the cursor — a dock tab rising to meet it,
a button swelling, a field leaning.

```ts
import { MouseGravity } from "@dank-inc/super-mouse"

const gravity = new MouseGravity({ target: tab, radius: 200, axis: "y" })

const frame = () => {
  const moving = gravity.update()
  tab.style.setProperty("--rise", `${gravity.pull * 16}px`)
  if (moving) requestAnimationFrame(frame)   // stops itself when it settles
}
requestAnimationFrame(frame)
```

`pull` is 1 with the pointer on the target, 0 at `radius` and beyond, and eased
between the two. `update()` returns false once there is nothing left to render,
so the rAF loop can end rather than idling forever.

| Option | Default | |
| --- | --- | --- |
| `target` | — | the element being attracted to |
| `radius` | `220` | px at which the pull begins |
| `from` | `"edge"` | measure to the nearest edge, or `"centre"`. Edge keeps a wide bar equally near along its whole length |
| `axis` | `"both"` | `"y"` answers "how far above it are you", ignoring sideways distance |
| `falloff` | `smoothstep` | maps 0..1 nearness onto 0..1 pull; `easeInQuad` and `linear` also exported |
| `stiffness` | `0.18` | fraction of the gap closed per frame — low is syrup, high is snap |
| `respectReducedMotion` | `true` | hold at 0 when the OS asks for reduced motion |
| `ignoreTouch` | `true` | a finger has no hover, and gravity from one makes the target lunge out from under it |
| `onChange` | — | fired from `update()` when the smoothed value actually moves |

State: `pull`, `targetPull`, `distance`, `x`, `y`, `seen`.
Methods: `update(dt)`, `measure(x, y)`, `destroy()`.

`dt` is in frames, so a dropped frame catches up rather than easing at a
different rate — `update(4)` lands exactly where four `update(1)` calls would.

## LiquidEdge — a surface that behaves like it has mass

`MouseGravity` says how near the pointer is. `LiquidEdge` says what a surface
*does* about it: a bulge rises under the cursor, drags behind it as it moves,
sends waves out along the surface that reflect off the ends, and sloshes back
and settles when the pointer leaves.

It is a chain of masses, each on a spring toward the height the pointer asks
for, each coupled to its neighbours. The coupling is what makes it read as one
body of liquid rather than a row of independent bars.

```ts
import { MouseGravity, LiquidEdge } from "@dank-inc/super-mouse"

const gravity = new MouseGravity({ target: bar, radius: 190 })
const liquid = new LiquidEdge({ points: 15 })

const frame = () => {
  const r = bar.getBoundingClientRect()
  liquid.drive((gravity.x - r.left) / r.width, gravity.pull)
  const moving = gravity.update() || liquid.update()
  path.setAttribute("d", pathFrom(liquid.heights))   // your drawing, its numbers
  if (moving) requestAnimationFrame(frame)
}
```

`heights` is one 0..1 per point, left to right. Draw it however you like — an
SVG path, a canvas curve, a row of divs; it knows nothing about rendering.

| Option | Default | |
| --- | --- | --- |
| `points` | `15` | samples across the surface |
| `tension` | `0.26` | pull toward the driven shape, per frame |
| `damping` | `0.14` | velocity bled off per frame — lower rings longer |
| `coupling` | `0.24` | height traded with neighbours: this is the travelling wave. 0 gives independent springs and no liquid at all |
| `spread` | `0.26` | width of the bulge, in surface widths |
| `slosh` | `1.4` | how hard a sideways move throws it around |
| `pinEnds` | `true` | ends held at 0, like liquid in a channel |

State: `heights`, `velocities`, `peak`, `amplitude`, `settled`.
Methods: `drive(u, amount)`, `splash(u, impulse)`, `update(dt)`, `reset()`.

`peak` is the true maximum and goes negative on the rebound when the ends are
free; with `pinEnds` it bottoms out at 0, since the pinned ends are then the
highest thing on a dipped surface. For "how much is happening" in either
direction, read `amplitude`.

`update()` returns false the moment the surface is flat and still, so the render
loop can stop instead of idling. A `dt` above 1 is integrated in whole-frame
substeps — a spring solved in one big step does not converge, it explodes.

## Mousewheel + Mouse Inertia

![](scroll-inertia-demo.gif)

## TODO

- [ ] Modifier-aware scroll (ctrl+wheel zoom, shift+wheel horizontal)
- [ ] State objects for each button / gesture
- [ ] gestures?
- [ ] ESM build alongside the CJS one
