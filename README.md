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

## Mousewheel + Mouse Inertia

![](scroll-inertia-demo.gif)

## TODO

- [ ] Modifier-aware scroll (ctrl+wheel zoom, shift+wheel horizontal)
- [ ] State objects for each button / gesture
- [ ] gestures?
- [ ] ESM build alongside the CJS one
