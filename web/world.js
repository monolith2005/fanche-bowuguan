(function (root) {
  'use strict'

  let active = null

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)) }
  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y) }

  function mount(options) {
    destroy()
    const viewport = document.querySelector('[data-world-viewport]')
    const stage = document.querySelector('[data-world-stage]')
    const player = document.querySelector('[data-world-player]')
    if (!viewport || !stage || !player) return

    const config = Object.assign({
      width: 1600, height: 1000, speed: 230, radius: 24,
      spawn: { x: 800, y: 900 }, bounds: { left: 40, top: 40, right: 1560, bottom: 960 },
      obstacles: [], interactionDistance: 64
    }, options || {})
    const state = {
      x: config.spawn.x, y: config.spawn.y, dir: 'up', path: [], pending: null,
      keys: new Set(), frame: 0, frameClock: 0, lastTime: performance.now(),
      cameraX: 0, cameraY: 0, scale: 1, raf: 0, destroyed: false
    }

    function isTypingTarget(target) {
      return target && (target.matches('input,textarea,select,button') || target.isContentEditable)
    }
    function isWalkable(x, y) {
      const r = config.radius, b = config.bounds
      if (x - r < b.left || x + r > b.right || y - r < b.top || y + r > b.bottom) return false
      return !config.obstacles.some(function (box) {
        return x + r > box.x && x - r < box.x + box.width && y + r > box.y && y - r < box.y + box.height
      })
    }
    function nearestWalkable(point) {
      if (isWalkable(point.x, point.y)) return point
      const step = 40
      for (let ring = 1; ring <= 8; ring++) {
        for (let dx = -ring; dx <= ring; dx++) {
          const candidates = [
            { x: point.x + dx * step, y: point.y - ring * step },
            { x: point.x + dx * step, y: point.y + ring * step },
            { x: point.x - ring * step, y: point.y + dx * step },
            { x: point.x + ring * step, y: point.y + dx * step }
          ]
          const match = candidates.find(function (candidate) { return isWalkable(candidate.x, candidate.y) })
          if (match) return match
        }
      }
      return { x: state.x, y: state.y }
    }
    function cellKey(x, y) { return x + ',' + y }
    function findPath(target) {
      const step = 40, start = { x: Math.round(state.x / step), y: Math.round(state.y / step) }
      const safe = nearestWalkable(target), goal = { x: Math.round(safe.x / step), y: Math.round(safe.y / step) }
      const open = [{ x: start.x, y: start.y, g: 0, f: 0 }], came = new Map(), scores = new Map()
      scores.set(cellKey(start.x, start.y), 0)
      const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
      let found = null, guard = 0
      while (open.length && guard++ < 3500) {
        open.sort(function (a, b) { return a.f - b.f })
        const current = open.shift()
        if (current.x === goal.x && current.y === goal.y) { found = current; break }
        directions.forEach(function (dir) {
          const nx = current.x + dir[0], ny = current.y + dir[1], px = nx * step, py = ny * step
          if (!isWalkable(px, py)) return
          if (dir[0] && dir[1] && (!isWalkable((current.x + dir[0]) * step, current.y * step) || !isWalkable(current.x * step, (current.y + dir[1]) * step))) return
          const key = cellKey(nx, ny), cost = current.g + (dir[0] && dir[1] ? 1.414 : 1)
          if (scores.has(key) && scores.get(key) <= cost) return
          scores.set(key, cost); came.set(key, { x: current.x, y: current.y })
          const heuristic = Math.hypot(goal.x - nx, goal.y - ny)
          open.push({ x: nx, y: ny, g: cost, f: cost + heuristic })
        })
      }
      if (!found) return [safe]
      const cells = [], cursor = { x: found.x, y: found.y }
      while (cursor.x !== start.x || cursor.y !== start.y) {
        cells.push({ x: cursor.x * step, y: cursor.y * step })
        const previous = came.get(cellKey(cursor.x, cursor.y))
        if (!previous) break
        cursor.x = previous.x; cursor.y = previous.y
      }
      cells.reverse()
      cells.push(safe)
      return cells.filter(function (point, index) { return index === cells.length - 1 || distance(point, cells[index + 1]) > 8 })
    }
    function setTarget(point, pending) {
      state.path = findPath(point)
      state.pending = pending || null
    }
    function directionFor(dx, dy) {
      if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right'
      return dy < 0 ? 'up' : 'down'
    }
    function setSprite(walking, dt) {
      if (walking) {
        state.frameClock += dt
        if (state.frameClock > 170) { state.frame = state.frame === 1 ? 2 : 1; state.frameClock = 0 }
      } else { state.frame = 0; state.frameClock = 0 }
      player.dataset.direction = state.dir
      player.dataset.frame = String(state.frame)
      player.classList.toggle('is-walking', walking)
    }
    function moveBy(dx, dy) {
      if (!dx && !dy) return false
      const nextX = state.x + dx, nextY = state.y + dy
      if (isWalkable(nextX, state.y)) state.x = nextX
      if (isWalkable(state.x, nextY)) state.y = nextY
      return true
    }
    function followPath(dt) {
      if (!state.path.length) return false
      const target = state.path[0], dx = target.x - state.x, dy = target.y - state.y, length = Math.hypot(dx, dy)
      if (length < 7) { state.x = target.x; state.y = target.y; state.path.shift(); return state.path.length > 0 }
      state.dir = directionFor(dx, dy)
      const amount = Math.min(length, config.speed * dt / 1000)
      moveBy(dx / length * amount, dy / length * amount)
      return true
    }
    function followKeyboard(dt) {
      let dx = 0, dy = 0
      if (state.keys.has('w') || state.keys.has('arrowup')) dy--
      if (state.keys.has('s') || state.keys.has('arrowdown')) dy++
      if (state.keys.has('a') || state.keys.has('arrowleft')) dx--
      if (state.keys.has('d') || state.keys.has('arrowright')) dx++
      if (!dx && !dy) return false
      state.path = []; state.pending = null
      const length = Math.hypot(dx, dy), amount = config.speed * dt / 1000
      state.dir = directionFor(dx, dy)
      moveBy(dx / length * amount, dy / length * amount)
      return true
    }
    function updateCamera() {
      const width = viewport.clientWidth, height = viewport.clientHeight
      const desktop = width >= 900
      const fit = Math.min(width / config.width, height / config.height)
      state.scale = desktop ? clamp(fit, .72, 1.05) : clamp(height / config.height, .76, .96)
      const scaledWidth = config.width * state.scale, scaledHeight = config.height * state.scale
      const desiredX = width / 2 - state.x * state.scale, desiredY = height / 2 - state.y * state.scale
      state.cameraX = scaledWidth <= width ? (width - scaledWidth) / 2 : clamp(desiredX, width - scaledWidth, 0)
      state.cameraY = scaledHeight <= height ? (height - scaledHeight) / 2 : clamp(desiredY, height - scaledHeight, 0)
      stage.style.transform = 'translate3d(' + state.cameraX + 'px,' + state.cameraY + 'px,0) scale(' + state.scale + ')'
    }
    function updatePoiProximity() {
      document.querySelectorAll('[data-world-poi]').forEach(function (node) {
        const point = { x: Number(node.dataset.x), y: Number(node.dataset.y) }
        node.classList.toggle('is-near', distance(state, point) < config.interactionDistance * 1.8)
      })
    }
    function finishPending() {
      if (!state.pending || state.path.length) return
      const pending = state.pending
      if (distance(state, pending) > config.interactionDistance) return
      state.pending = null
      const node = document.querySelector('[data-world-poi="' + pending.key + '"]')
      if (node) node.classList.add('is-opening')
      window.setTimeout(function () {
        if (!state.destroyed && typeof config.onInteract === 'function') config.onInteract(pending.action, pending.id)
      }, root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches ? 10 : 260)
    }
    function renderPosition() {
      player.style.transform = 'translate3d(' + state.x + 'px,' + state.y + 'px,0) translate(-50%,-88%)'
      player.style.zIndex = String(200 + Math.round(state.y))
    }
    function tick(now) {
      if (state.destroyed) return
      const dt = Math.min(34, now - state.lastTime); state.lastTime = now
      const keyboardMoving = followKeyboard(dt), moving = keyboardMoving || followPath(dt)
      setSprite(moving, dt); finishPending(); renderPosition(); updateCamera(); updatePoiProximity()
      state.raf = requestAnimationFrame(tick)
    }
    function onKeyDown(event) {
      if (isTypingTarget(event.target) || document.querySelector('.game-dialog:not([hidden])')) return
      const key = event.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(key) >= 0) {
        event.preventDefault(); state.keys.add(key)
      }
    }
    function onKeyUp(event) { state.keys.delete(event.key.toLowerCase()) }
    function worldPoint(event) {
      const rect = viewport.getBoundingClientRect()
      return nearestWalkable({
        x: (event.clientX - rect.left - state.cameraX) / state.scale,
        y: (event.clientY - rect.top - state.cameraY) / state.scale
      })
    }
    function onPointerDown(event) {
      const poi = event.target.closest('[data-world-poi]')
      if (poi) {
        event.preventDefault(); event.stopPropagation()
        const point = { x: Number(poi.dataset.x), y: Number(poi.dataset.y) }
        setTarget(point, { x: point.x, y: point.y, key: poi.dataset.worldPoi, action: poi.dataset.action, id: poi.dataset.id || '' })
        return
      }
      if (event.target.closest('.game-hud,.game-dialog,.world-help')) return
      setTarget(worldPoint(event))
    }
    function onResize() { updateCamera() }

    viewport.addEventListener('pointerdown', onPointerDown)
    root.addEventListener('keydown', onKeyDown, { passive: false })
    root.addEventListener('keyup', onKeyUp)
    root.addEventListener('resize', onResize)
    active = {
      destroy: function () {
        state.destroyed = true; cancelAnimationFrame(state.raf)
        viewport.removeEventListener('pointerdown', onPointerDown)
        root.removeEventListener('keydown', onKeyDown)
        root.removeEventListener('keyup', onKeyUp)
        root.removeEventListener('resize', onResize)
      },
      moveTo: setTarget
    }
    renderPosition(); updateCamera(); state.raf = requestAnimationFrame(tick)
  }

  function destroy() {
    if (active) active.destroy()
    active = null
  }

  root.MuseumWorld = { mount: mount, destroy: destroy }
})(window)
