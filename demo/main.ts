/* super-mouse demo — https://super-mouse.lucianlabs.ca */

import { SuperMouse } from '@dank-inc/super-mouse'

declare const waveloop: { ready: (...tags: string[]) => Promise<unknown> }

const app = document.getElementById('app') as HTMLElement

const h = (tag: string, cls?: string, text?: string) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text != null) n.textContent = text
  return n
}

const section = (title: string) => {
  const s = document.createElement('wl-section')
  s.setAttribute('title', title)
  app.append(s)
  return s
}

waveloop.ready().then(boot)

function boot() {
  installSection()
  padSection()
  apiSection()
}

function installSection() {
  const s = section('install')
  const install = document.createElement('wl-install')
  install.setAttribute('pkg', '@dank-inc/super-mouse')
  const c = document.createElement('wl-code')
  c.textContent = `import { SuperMouse } from '@dank-inc/super-mouse'

const mouse = new SuperMouse({ element: canvas, scrollScale: 0.01 })

function frame(dt: number) {
  // read state instead of handling events
  draw(mouse.u, mouse.v, mouse.inertia)
  mouse.update(dt)   // decays inertia; call once per frame
  requestAnimationFrame(() => frame(dt))
}

// on unmount / hot reload
mouse.destroy()`
  s.append(install, c)
}

/* ── the pad ────────────────────────────────────────────────────────────── */

function padSection() {
  const s = section('the pad')
  s.append(
    h(
      'p',
      'wl-muted',
      'Move, click, drag and scroll inside the screen. Nothing below is wired to a ' +
        'listener — every value is read off the SuperMouse instance once per frame. ' +
        'u and v are normalised against the element, so 0,0 is its top-left corner. ' +
        'The border turns gold while the pane is capturing: the wheel scrolls this ' +
        'screen instead of the page, and dragging across it will not select text.'
    )
  )

  const hud = document.createElement('wl-hud')
  hud.style.height = '380px'
  hud.style.cursor = 'crosshair'
  const canvas = document.createElement('canvas')
  hud.append(canvas)
  s.append(hud)

  const grid = h('div', 'wl-grid')
  grid.style.marginTop = '0.75rem'
  const mkOut = (label: string) => {
    const r = document.createElement('wl-readout')
    r.setAttribute('label', label)
    grid.append(r)
    return r
  }
  const oXY = mkOut('x / y')
  const oUV = mkOut('u / v')
  const oInertia = mkOut('inertia')
  const oScroll = mkOut('scrollX / scrollY')
  const oScrollI = mkOut('scrollInertia')
  const oButtons = mkOut('buttons / clicked')
  const oFlags = mkOut('dragging / onElement')
  s.append(grid)

  const opts = h('div', 'wl-row')
  opts.style.marginTop = '0.75rem'
  const trailSel = document.createElement('wl-selector')
  trailSel.setAttribute('label', 'trail')
  trailSel.setAttribute('checked', '')
  const ctxSel = document.createElement('wl-selector')
  ctxSel.setAttribute('label', 'allow context menu')
  opts.append(trailSel, ctxSel)
  s.append(opts)

  /* the instance */

  const mouse = new SuperMouse({
    element: hud,
    scrollScale: 0.01,
    updateScale: 1,
    onContext: () => hud.setAttribute('br', 'CONTEXT'),
  })

  ctxSel.addEventListener('wl-input', (e) => {
    mouse.enableContext = (e as CustomEvent<{ value: boolean }>).detail.value
  })

  const ctx = canvas.getContext('2d')!
  const trail: { x: number; y: number; hot: boolean }[] = []

  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const r = hud.getBoundingClientRect()
    canvas.width = Math.round(r.width * dpr)
    canvas.height = Math.round(r.height * dpr)
    canvas.style.width = `${r.width}px`
    canvas.style.height = `${r.height}px`
    return dpr
  }
  let dpr = fit()
  new ResizeObserver(() => {
    dpr = fit()
  }).observe(hud)

  let last = performance.now()

  const frame = () => {
    const now = performance.now()
    const dt = Math.min((now - last) / 16.67, 4)
    last = now

    // u/v are element-normalised, so the canvas position is just a scale
    const lx = mouse.u * canvas.width
    const ly = mouse.v * canvas.height

    if ((trailSel as HTMLElement & { checked: boolean }).checked && mouse.onElement) {
      trail.push({ x: lx, y: ly, hot: mouse.clicked })
      if (trail.length > 90) trail.shift()
    } else if (trail.length) {
      trail.shift()
    }

    const css = getComputedStyle(hud)
    const accent = css.getPropertyValue('--wl-accent').trim()
    const accentHi = css.getPropertyValue('--wl-accent-hi').trim()

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // scroll offsets push the reticle grid around, so scrollX/scrollY are visible
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    const step = 40 * dpr
    const ox = ((mouse.scrollX * 40) % step + step) % step
    const oy = ((mouse.scrollY * 40) % step + step) % step
    for (let x = ox; x < canvas.width; x += step) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvas.height)
      ctx.stroke()
    }
    for (let y = oy; y < canvas.height; y += step) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
      ctx.stroke()
    }

    // trail
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i]
      const a = i / trail.length
      ctx.globalAlpha = a * 0.7
      ctx.fillStyle = p.hot ? 'var(--wl-rec)' : accent
      ctx.fillStyle = p.hot ? '#eb424d' : accent
      const sz = 2 + a * 5 * dpr
      ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz)
    }
    ctx.globalAlpha = 1

    // reticle — inertia drives the ring size, so a flick is visible
    if (mouse.onElement) {
      const ring = (10 + mouse.inertia * 90) * dpr
      ctx.strokeStyle = mouse.clicked ? '#eb424d' : accentHi
      ctx.lineWidth = 2 * dpr
      ctx.strokeRect(lx - ring / 2, ly - ring / 2, ring, ring)

      ctx.beginPath()
      ctx.moveTo(lx - 12 * dpr, ly)
      ctx.lineTo(lx + 12 * dpr, ly)
      ctx.moveTo(lx, ly - 12 * dpr)
      ctx.lineTo(lx, ly + 12 * dpr)
      ctx.strokeStyle = accentHi
      ctx.lineWidth = 1 * dpr
      ctx.stroke()
    }

    /* readouts, straight off the instance */
    oXY.setAttribute('value', `${mouse.x.toFixed(0)} / ${mouse.y.toFixed(0)}`)
    oUV.setAttribute('value', `${mouse.u.toFixed(4)} / ${mouse.v.toFixed(4)}`)
    oInertia.setAttribute('value', mouse.inertia.toFixed(5))
    oScroll.setAttribute('value', `${mouse.scrollX.toFixed(2)} / ${mouse.scrollY.toFixed(2)}`)
    oScrollI.setAttribute('value', mouse.scrollInertia.toFixed(3))
    const down = Object.entries(mouse.buttons)
      .filter(([, v]) => v)
      .map(([k]) => k)
    oButtons.setAttribute('value', `${down.length ? down.join(',') : '—'} / ${mouse.clicked}`)
    oFlags.setAttribute('value', `${mouse.dragging} / ${mouse.onElement}`)

    // The armed border is the house rule for a surface that has taken over an
    // input device: while the pointer is on this pane, the library is eating
    // the wheel and the drag, so the page will not scroll or select. Say so.
    // See brand-design.md, "a surface that captures input says so".
    ;(hud as HTMLElement & { capturing: boolean }).capturing = mouse.onElement

    hud.setAttribute('tl', mouse.clicked ? 'DOWN' : mouse.onElement ? 'CAPTURING' : 'IDLE')
    hud.setAttribute('tr', `U ${mouse.u.toFixed(3)} V ${mouse.v.toFixed(3)}`)
    hud.setAttribute(
      'bl',
      mouse.onElement
        ? `WHEEL + DRAG CAPTURED · INERTIA ${mouse.inertia.toFixed(4)}`
        : `INERTIA ${mouse.inertia.toFixed(4)}`
    )

    // the library's own decay step
    mouse.update(dt)

    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}

function apiSection() {
  const s = section('api')
  const api = document.createElement('wl-api')
  s.append(api)
  ;(api as HTMLElement & { rows: unknown }).rows = [
    { name: 'new SuperMouse', kind: 'class', signature: '(params: SuperMouseParams) => SuperMouse', about: 'Binds listeners to params.element on construction.' },
    { name: '.x / .y', kind: 'property', signature: 'number', about: 'Latest clientX / clientY, in viewport pixels.' },
    { name: '.u / .v', kind: 'property', signature: 'number', about: 'Position normalised against the element box: 0,0 top-left, 1,1 bottom-right.' },
    { name: '.inertia', kind: 'property', signature: 'number', about: 'Accumulated movement energy, decayed by update().' },
    { name: '.scrollX / .scrollY', kind: 'property', signature: 'number', about: 'Accumulated wheel delta, inverted and scaled by scrollScale.' },
    { name: '.scrollInertia', kind: 'property', signature: 'number', about: 'Accumulated wheel energy, decayed by update().' },
    { name: '.buttons', kind: 'property', signature: 'Record<number, boolean>', about: 'Per-button down state, keyed by MouseEvent.button.' },
    { name: '.clicked', kind: 'getter', signature: 'boolean', about: 'True while any button is down.' },
    { name: '.keys', kind: 'property', signature: 'Record<string, boolean>', about: 'Keyboard map, true while held. Bound to window unless you pass keyTarget.' },
    { name: '.dragging', kind: 'property', signature: 'boolean', about: 'True once the pointer moves past dragThreshold with a button held.' },
    { name: '.onElement', kind: 'property', signature: 'boolean', about: 'True between mouseenter and mouseleave.' },
    { name: '.update', kind: 'method', signature: '(dt?: number) => void', about: 'Decays both inertia values by 0.97 ^ (dt * updateScale). Call once per frame.' },
    { name: '.destroy', kind: 'method', signature: '() => void', about: 'Removes every listener the constructor added.' },
    { name: 'onClick / onDoubleClick / onMove / onRelease / onScroll / onEnter / onLeave / onContext', kind: 'callback', signature: '(e) => void', about: 'Optional hooks fired alongside the state update.' },
  ]
}
