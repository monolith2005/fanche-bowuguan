(function (root) {
  'use strict'

  let active = null

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)) }
  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y) }
  function pointInPolygon(point, points) {
    let inside = false
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j]
      if (((a.y > point.y) !== (b.y > point.y)) && point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || .0001) + a.x) inside = !inside
    }
    return inside
  }
  function segmentDistance(point, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy
    if (!length) return distance(point, a)
    const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / length, 0, 1)
    return distance(point, { x: a.x + dx * t, y: a.y + dy * t })
  }
  function hitsObstacle(point, radius, obstacle) {
    if (obstacle.type === 'circle') return distance(point, obstacle) < Number(obstacle.radius || 0) + radius
    if (obstacle.type === 'polygon' && Array.isArray(obstacle.points)) {
      if (pointInPolygon(point, obstacle.points)) return true
      return obstacle.points.some(function (value, index) { return segmentDistance(point, value, obstacle.points[(index + 1) % obstacle.points.length]) < radius })
    }
    return point.x + radius > obstacle.x && point.x - radius < obstacle.x + obstacle.width && point.y + radius > obstacle.y && point.y - radius < obstacle.y + obstacle.height
  }

  function mount(options) {
    destroy()
    const viewport = document.querySelector('[data-world-viewport]')
    const stage = document.querySelector('[data-world-stage]')
    const player = document.querySelector('[data-world-player]')
    if (!viewport || !stage || !player) return

    const config = Object.assign({
      width: 1600, height: 1000, speed: 245, radius: 18, grid: 20,
      spawn: { x: 800, y: 900 }, bounds: { left: 40, top: 40, right: 1560, bottom: 960 },
      obstacles: [], interactionDistance: 70
    }, options || {})
    const state = {
      x: config.spawn.x, y: config.spawn.y, dir: 'up', path: [], pending: null, target: null,
      keys: new Set(), frame: 0, frameClock: 0, lastTime: performance.now(),
      cameraX: 0, cameraY: 0, scale: 1, raf: 0, destroyed: false,
      lastMove: { x: config.spawn.x, y: config.spawn.y }, stuckFor: 0, replans: 0
    }
    const debugEnabled = new URLSearchParams(root.location.search).get('debug') === 'nav'
    const debugCanvas = debugEnabled ? document.createElement('canvas') : null
    if (debugCanvas) {
      debugCanvas.width = config.width; debugCanvas.height = config.height
      debugCanvas.className = 'world-nav-debug'; debugCanvas.setAttribute('aria-hidden', 'true'); stage.appendChild(debugCanvas)
    }

    function isTypingTarget(target) { return target && (target.matches('input,textarea,select,button') || target.isContentEditable) }
    function isWalkable(x, y) {
      const point = { x: x, y: y }, r = config.radius, b = config.bounds
      if (x - r < b.left || x + r > b.right || y - r < b.top || y + r > b.bottom) return false
      return !config.obstacles.some(function (obstacle) { return hitsObstacle(point, r, obstacle) })
    }
    function nearestWalkable(point) {
      if (isWalkable(point.x, point.y)) return point
      const step = config.grid
      for (let ring = 1; ring <= 18; ring++) {
        for (let offset = -ring; offset <= ring; offset++) {
          const candidates = [
            { x: point.x + offset * step, y: point.y - ring * step },
            { x: point.x + offset * step, y: point.y + ring * step },
            { x: point.x - ring * step, y: point.y + offset * step },
            { x: point.x + ring * step, y: point.y + offset * step }
          ]
          const match = candidates.find(function (candidate) { return isWalkable(candidate.x, candidate.y) })
          if (match) return match
        }
      }
      return { x: state.x, y: state.y }
    }
    function lineWalkable(from, to) {
      const length = distance(from, to), samples = Math.max(1, Math.ceil(length / 10))
      for (let i = 1; i <= samples; i++) {
        const t = i / samples
        if (!isWalkable(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)) return false
      }
      return true
    }
    function smoothPath(points) {
      if (points.length < 3) return points
      const result = [], source = { x: state.x, y: state.y }
      let cursor = source, index = 0
      while (index < points.length) {
        let farthest = index
        for (let test = points.length - 1; test >= index; test--) {
          if (lineWalkable(cursor, points[test])) { farthest = test; break }
        }
        result.push(points[farthest]); cursor = points[farthest]; index = farthest + 1
      }
      return result
    }
    function cellKey(x, y) { return x + ',' + y }
    function findPath(target) {
      const step = config.grid, safe = nearestWalkable(target)
      const start = { x: Math.round(state.x / step), y: Math.round(state.y / step) }
      const snappedGoal = nearestWalkable({ x: Math.round(safe.x / step) * step, y: Math.round(safe.y / step) * step })
      const goal = { x: Math.round(snappedGoal.x / step), y: Math.round(snappedGoal.y / step) }
      const open = [{ x: start.x, y: start.y, g: 0, f: 0 }], came = new Map(), scores = new Map(), closed = new Set()
      scores.set(cellKey(start.x, start.y), 0)
      const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
      let found = null, guard = 0
      while (open.length && guard++ < 16000) {
        open.sort(function (a, b) { return a.f - b.f })
        const current = open.shift(), currentKey = cellKey(current.x, current.y)
        if (closed.has(currentKey)) continue
        closed.add(currentKey)
        if (current.x === goal.x && current.y === goal.y) { found = current; break }
        directions.forEach(function (dir) {
          const nx = current.x + dir[0], ny = current.y + dir[1], px = nx * step, py = ny * step
          if (!isWalkable(px, py)) return
          if (dir[0] && dir[1] && (!isWalkable((current.x + dir[0]) * step, current.y * step) || !isWalkable(current.x * step, (current.y + dir[1]) * step))) return
          const key = cellKey(nx, ny), cost = current.g + (dir[0] && dir[1] ? 1.414 : 1)
          if (scores.has(key) && scores.get(key) <= cost) return
          scores.set(key, cost); came.set(key, { x: current.x, y: current.y })
          open.push({ x: nx, y: ny, g: cost, f: cost + Math.hypot(goal.x - nx, goal.y - ny) })
        })
      }
      if (!found) return lineWalkable(state, safe) ? [safe] : []
      const cells = [], cursor = { x: found.x, y: found.y }
      while (cursor.x !== start.x || cursor.y !== start.y) {
        cells.push({ x: cursor.x * step, y: cursor.y * step })
        const previous = came.get(cellKey(cursor.x, cursor.y))
        if (!previous) break
        cursor.x = previous.x; cursor.y = previous.y
      }
      cells.reverse(); cells.push(safe)
      return smoothPath(cells.filter(function (point, index) { return index === cells.length - 1 || distance(point, cells[index + 1]) > 5 }))
    }
    function setTarget(point, pending) {
      const safe = nearestWalkable(point)
      state.target = safe; state.path = findPath(safe); state.pending = pending || null
      state.stuckFor = 0; state.replans = 0; state.lastMove = { x: state.x, y: state.y }
      if (pending && !state.path.length) root.dispatchEvent(new CustomEvent('museum:navigation-failed', { detail: pending }))
    }
    function directionFor(dx, dy) {
      if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right'
      return dy < 0 ? 'up' : 'down'
    }
    function setSprite(walking, dt) {
      if (walking) {
        state.frameClock += dt
        if (state.frameClock > 150) { state.frame = state.frame === 1 ? 2 : 1; state.frameClock = 0 }
      } else { state.frame = 0; state.frameClock = 0 }
      player.dataset.direction = state.dir; player.dataset.frame = String(state.frame); player.classList.toggle('is-walking', walking)
    }
    function moveBy(dx, dy) {
      if (!dx && !dy) return false
      const before = { x: state.x, y: state.y }, nextX = state.x + dx, nextY = state.y + dy
      if (isWalkable(nextX, nextY)) { state.x = nextX; state.y = nextY }
      else {
        if (isWalkable(nextX, state.y)) state.x = nextX
        if (isWalkable(state.x, nextY)) state.y = nextY
      }
      return distance(before, state) > .05
    }
    function followPath(dt) {
      if (!state.path.length) return false
      const target = state.path[0], dx = target.x - state.x, dy = target.y - state.y, length = Math.hypot(dx, dy)
      if (length < 5) { state.x = target.x; state.y = target.y; state.path.shift(); return state.path.length > 0 }
      state.dir = directionFor(dx, dy)
      const moved = moveBy(dx / length * Math.min(length, config.speed * dt / 1000), dy / length * Math.min(length, config.speed * dt / 1000))
      if (moved && distance(state, state.lastMove) > 2) { state.lastMove = { x: state.x, y: state.y }; state.stuckFor = 0 }
      else state.stuckFor += dt
      if (state.stuckFor > 550 && state.target && state.replans < 3) {
        state.replans++; state.stuckFor = 0; state.path = findPath(state.target); state.lastMove = { x: state.x, y: state.y }
      }
      return moved || Boolean(state.path.length)
    }
    function followKeyboard(dt) {
      let dx = 0, dy = 0
      if (state.keys.has('w') || state.keys.has('arrowup')) dy--
      if (state.keys.has('s') || state.keys.has('arrowdown')) dy++
      if (state.keys.has('a') || state.keys.has('arrowleft')) dx--
      if (state.keys.has('d') || state.keys.has('arrowright')) dx++
      if (!dx && !dy) return false
      state.path = []; state.pending = null; state.target = null
      const length = Math.hypot(dx, dy); state.dir = directionFor(dx, dy)
      return moveBy(dx / length * config.speed * dt / 1000, dy / length * config.speed * dt / 1000)
    }
    function updateCamera() {
      const width = viewport.clientWidth, height = viewport.clientHeight, desktop = width >= 900
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
        node.classList.toggle('is-near', distance(state, { x: Number(node.dataset.x), y: Number(node.dataset.y) }) < config.interactionDistance * 1.8)
      })
    }
    function finishPending() {
      if (!state.pending) return
      const pending = state.pending
      if (distance(state, pending) > config.interactionDistance) return
      state.pending = null; state.target = null; state.path = []
      const node = document.querySelector('[data-world-poi="' + pending.key + '"]')
      if (node) node.classList.add('is-opening')
      window.setTimeout(function () { if (!state.destroyed && typeof config.onInteract === 'function') config.onInteract(pending.action, pending.id) }, root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches ? 10 : 220)
    }
    function renderPosition() {
      player.style.transform = 'translate3d(' + state.x + 'px,' + state.y + 'px,0) translate(-50%,-87.5%)'
      player.style.zIndex = String(200 + Math.round(state.y))
    }
    function drawDebug() {
      if (!debugCanvas) return
      const ctx = debugCanvas.getContext('2d'); ctx.clearRect(0, 0, config.width, config.height)
      ctx.fillStyle = 'rgba(210,50,50,.22)'; ctx.strokeStyle = 'rgba(255,245,120,.95)'; ctx.lineWidth = 4
      config.obstacles.forEach(function (obstacle) {
        ctx.beginPath()
        if (obstacle.type === 'circle') ctx.arc(obstacle.x, obstacle.y, obstacle.radius + config.radius, 0, Math.PI * 2)
        else if (obstacle.type === 'polygon') { obstacle.points.forEach(function (point, index) { if (!index) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y) }); ctx.closePath() }
        else ctx.rect(obstacle.x - config.radius, obstacle.y - config.radius, obstacle.width + config.radius * 2, obstacle.height + config.radius * 2)
        ctx.fill()
      })
      ctx.beginPath(); ctx.moveTo(state.x, state.y); state.path.forEach(function (point) { ctx.lineTo(point.x, point.y) }); ctx.stroke()
      ctx.fillStyle = '#70ff8f'; ctx.beginPath(); ctx.arc(state.x, state.y, config.radius, 0, Math.PI * 2); ctx.fill()
    }
    function tick(now) {
      if (state.destroyed) return
      const dt = Math.min(34, now - state.lastTime); state.lastTime = now
      const keyboardMoving = followKeyboard(dt), moving = keyboardMoving || followPath(dt)
      setSprite(moving, dt); finishPending(); renderPosition(); updateCamera(); updatePoiProximity(); drawDebug()
      state.raf = requestAnimationFrame(tick)
    }
    function onKeyDown(event) {
      if (isTypingTarget(event.target) || document.querySelector('.game-dialog:not([hidden])')) return
      const key = event.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(key) >= 0) { event.preventDefault(); state.keys.add(key) }
    }
    function onKeyUp(event) { state.keys.delete(event.key.toLowerCase()) }
    function worldPoint(event) {
      const rect = viewport.getBoundingClientRect()
      return nearestWalkable({ x: (event.clientX - rect.left - state.cameraX) / state.scale, y: (event.clientY - rect.top - state.cameraY) / state.scale })
    }
    function onPointerDown(event) {
      const poi = event.target.closest('[data-world-poi]')
      if (poi) {
        event.preventDefault(); event.stopPropagation()
        const point = { x: Number(poi.dataset.x), y: Number(poi.dataset.y) }
        setTarget(point, { x: point.x, y: point.y, key: poi.dataset.worldPoi, action: poi.dataset.action, id: poi.dataset.id || '' }); return
      }
      if (event.target.closest('.game-hud,.game-dialog,.world-help,.world-pedestal')) return
      setTarget(worldPoint(event))
    }
    function onResize() { updateCamera() }

    viewport.addEventListener('pointerdown', onPointerDown)
    root.addEventListener('keydown', onKeyDown, { passive: false }); root.addEventListener('keyup', onKeyUp); root.addEventListener('resize', onResize)
    active = {
      destroy: function () {
        state.destroyed = true; cancelAnimationFrame(state.raf); viewport.removeEventListener('pointerdown', onPointerDown)
        root.removeEventListener('keydown', onKeyDown); root.removeEventListener('keyup', onKeyUp); root.removeEventListener('resize', onResize)
      },
      moveTo: setTarget,
      debugState: function () { return { x: state.x, y: state.y, path: state.path.slice(), stuckFor: state.stuckFor, replans: state.replans } }
    }
    renderPosition(); updateCamera(); state.raf = requestAnimationFrame(tick)
  }

  function destroy() { if (active) active.destroy(); active = null }
  root.MuseumWorld = { mount: mount, destroy: destroy, current: function () { return active } }
})(window)
