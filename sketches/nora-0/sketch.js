import { createEngine } from "../_shared/engine.js"

const { renderer, run, finish } = createEngine()
const { ctx, canvas } = renderer

run(update)

// =====================
// INTRO
// =====================

let introProgress = 0        // 0 → pas visible, 1 → intro finie
const introDuration = 1.8    // en secondes (plus lent que avant)
let introComplete = false

// petit délai avant que l'intro commence vraiment
const INTRO_DELAY = 0.6 // secondes
let introDelayElapsed = 0

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

function updateIntro(dt) {
  if (introComplete) return

  // attendre un peu avant de déclencher l'animation d'intro
  if (introDelayElapsed < INTRO_DELAY) {
    introDelayElapsed += dt
    if (introDelayElapsed < INTRO_DELAY) return
    // on continue ensuite vers l'animation d'intro
  }

  introProgress += dt / introDuration
  if (introProgress >= 1) {
    introProgress = 1
    introComplete = true
  }
}

// =====================
// CONFIG (à modifier facilement)
// =====================

// 1 = cercle, >1 = plus haut que large, <1 = plus large que haut
const zeroAspect = 1.3      // essaie 1.1 / 1.3 / 1.6 pour tester

// échelle globale du "0" (1 = taille normale)
const zeroScale = 1

// taille relative de la boule (par rapport à la hauteur du canvas)
const bobSizeFactor = 0.025 // 2.5% de la hauteur

// longueur du pendule (par rapport à la hauteur du canvas)
const pendulumLengthFactor = 0.3

// dérivé : facteurs de scaling pour l'ellipse
const ellipseScaleX = zeroScale / zeroAspect
const ellipseScaleY = zeroScale * zeroAspect

// physique du pendule
const damping = 0.995        // 1 = pendule ne s'arrête jamais
const gravityConstant = 2000 // augmente pour un mouvement plus rapide

// facteur pour booster ou calmer l'effet du lancer
const DRAG_VELOCITY_SCALE = 0.9 // essaie 0.5 / 1 / 1.5

// =====================
// OUTRO / PAUSE / FADE
// =====================

// outro (rétractation)
let isOutroPlaying = false
let outroProgress = 0       // 0 → not started, 1 → finished
const OUTRO_DURATION = 1.2  // durée de la rétractation

// pause sur le zéro (sans pendule)
let isPauseOnZero = false
let pauseTimer = 0
const PAUSE_ON_ZERO = 1.2 // secondes

// fade to black
let isFading = false
let fadeProgress = 0
const FADE_DURATION = 0.8 // secondes

// helper pour démarrer l'outro (on l'expose aussi à la touche 'f')
function startOutro() {
  if (isOutroPlaying || isPauseOnZero || isFading) return
  // si on est en plein drag → forcer la fin du drag proprement
  if (isDragging) endDrag()
  isOutroPlaying = true
  outroProgress = 0
}

// =====================
// ÉTAT PENDULE
// =====================

// angle (radians) – départ vers le bas
let angle = Math.PI / 2
let angularVelocity = 0
let isDragging = false

// tracking de la vélocité pendant le drag
let lastDragAngle = null
let lastDragTime = null
let dragAngularVelocity = 0

// trace : {x,y} ou null pour couper entre deux phases de dessin
/** @type ({x:number, y:number} | null)[] */
const trailPoints = []

// =====================
// COORDONNÉES
// =====================

function getCanvasCoordinates(event) {
  const rect = canvas.getBoundingClientRect()
  const xInCanvas = event.clientX - rect.left
  const yInCanvas = event.clientY - rect.top

  const x = xInCanvas * (canvas.width / rect.width)
  const y = yInCanvas * (canvas.height / rect.height)

  return { x, y }
}

// =====================
// GÉOMÉTRIE PENDULE
// (physique en angle, position déformée en ellipse)
// =====================

function getPendulumGeometry() {
  const w = canvas.width
  const h = canvas.height

  const pivotX = w / 2
  const pivotY = h / 2

  const baseLength = h * pendulumLengthFactor
  const baseBobRadius = h * bobSizeFactor

  // scale d’intro : 0 → 1 (on respecte le delay)
  const sIntro = (introDelayElapsed < INTRO_DELAY) ? 0 : (introComplete ? 1 : easeOutCubic(introProgress))

  // during outro we shrink the pendulum (rétractation)
  const outroEase = isOutroPlaying ? easeOutCubic(Math.min(Math.max(outroProgress, 0), 1)) : 0
  const outroScale = isOutroPlaying ? (1 - outroEase) : 1

  const s = sIntro * outroScale

  const length = baseLength * s
  const bobRadius = baseBobRadius * s

  // position "circulaire" brute
  const rawX = pivotX + Math.cos(angle) * length
  const rawY = pivotY + Math.sin(angle) * length

  const offsetX = rawX - pivotX
  const offsetY = rawY - pivotY

  const bobX = pivotX + offsetX * ellipseScaleX
  const bobY = pivotY + offsetY * ellipseScaleY

  return {
    w, h,
    pivotX, pivotY,
    length,
    bobX, bobY,
    bobRadius
  }
}

// =====================
// INTERACTION : DRAG
// =====================

// block input during outro/pause/fade
canvas.addEventListener("pointerdown", (event) => {
  // si on est en outro / pause / fade => pas d'input
  if (!introComplete) return   // on ignore les clics pendant l’intro
  if (isOutroPlaying || isPauseOnZero || isFading) return

  const { x, y } = getCanvasCoordinates(event)
  const { bobX, bobY, bobRadius } = getPendulumGeometry()

  const dx = x - bobX
  const dy = y - bobY
  const dist = Math.sqrt(dx * dx + dy * dy)

  if (dist <= bobRadius * 1.6) {
    isDragging = true
    angularVelocity = 0

    // init tracking du drag
    lastDragAngle = angle
    lastDragTime = performance.now() / 1000 // en secondes
    dragAngularVelocity = 0
  }
})

canvas.addEventListener("pointermove", (event) => {
  if (!isDragging) return
  if (isOutroPlaying || isPauseOnZero || isFading) {
    // safety: if somehow dragging during these states, cancel
    endDrag()
    return
  }

  const { x, y } = getCanvasCoordinates(event)
  const { pivotX, pivotY } = getPendulumGeometry()

  // on "annule" l'ellipse pour retrouver l'angle circulaire
  const dx = x - pivotX
  const dy = y - pivotY

  const correctedX = dx / ellipseScaleX
  const correctedY = dy / ellipseScaleY

  const newAngle = Math.atan2(correctedY, correctedX)

  // calcul de la vélocité angulaire pendant le drag
  const now = performance.now() / 1000
  if (lastDragTime != null) {
    const dt = now - lastDragTime
    if (dt > 0) {
      let delta = newAngle - lastDragAngle

      // normalisation pour éviter le saut à ±π
      if (delta > Math.PI) delta -= 2 * Math.PI
      if (delta < -Math.PI) delta += 2 * Math.PI

      dragAngularVelocity = delta / dt
    }
  }

  angle = newAngle
  lastDragAngle = newAngle
  lastDragTime = now
})

function endDrag() {
  if (!isDragging) return
  isDragging = false

  // quand on relâche, on transforme le "flick" en vitesse initiale
  angularVelocity = dragAngularVelocity * DRAG_VELOCITY_SCALE

  // coupe la trace pour ne pas relier avec les tracés précédents
  trailPoints.push(null)

  // reset du tracking
  lastDragAngle = null
  lastDragTime = null
  dragAngularVelocity = 0
}

canvas.addEventListener("pointerup", endDrag)
canvas.addEventListener("pointerleave", endDrag)

// raccourci clavier pour tester : 'f' déclenche l'outro
window.addEventListener("keydown", (e) => {
  if (e.key === "f") startOutro()
})

// =====================
// PHYSIQUE DU PENDULE
// =====================

function updatePendulumPhysics(dt, geom) {
  if (!introComplete) return    // pas de physique pendant l’intro
  if (isDragging) return        // pas de physique pendant le drag
  if (isOutroPlaying && outroProgress >= 1) return // lock physics during outro end phase

  const { length } = geom

  // angle par rapport à la verticale vers le bas
  const theta = angle - Math.PI / 2

  const gOverL = gravityConstant / length
  const angularAcceleration = -gOverL * Math.sin(theta)

  // intégration
  angularVelocity += angularAcceleration * dt

  // --- clamp de la vitesse angulaire pour éviter les valeurs folles ---
  // choisis une valeur adaptée au feeling (ex : 4 rad/s = assez vif)
  const MAX_ANGULAR_SPEED = 4.0
  if (angularVelocity > MAX_ANGULAR_SPEED) angularVelocity = MAX_ANGULAR_SPEED
  if (angularVelocity < -MAX_ANGULAR_SPEED) angularVelocity = -MAX_ANGULAR_SPEED
  // --------------------------------------------------------------------

  angularVelocity *= damping
  angle += angularVelocity * dt
}

// =====================
// TRACE (après relâche, sur la même trajectoire que le pendule)
// =====================

function updateTrail(geom) {
  // during intro delay or intro animation we don't record trail
  if (introDelayElapsed < INTRO_DELAY) return
  if (!introComplete) return
  if (isDragging) return
  if (isOutroPlaying) return // keep trail fixed during outro

  const { bobX, bobY, bobRadius } = geom

  const last = trailPoints[trailPoints.length - 1]
  const minDist = bobRadius * 0.3

  const point = { x: bobX, y: bobY }

  if (!last) {
    trailPoints.push(point)
    return
  }

  if (last === null) {
    trailPoints.push(point)
    return
  }

  const dx = point.x - last.x
  const dy = point.y - last.y
  const dist = Math.sqrt(dx * dx + dy * dy)

  if (dist >= minDist) {
    trailPoints.push(point)
  }

  const maxPoints = 5000
  if (trailPoints.length > maxPoints) {
    trailPoints.splice(0, trailPoints.length - maxPoints)
  }
}

// =====================
// DESSIN
// =====================

function drawBackground(w, h) {
  ctx.fillStyle = "black"
  ctx.fillRect(0, 0, w, h)
}

function drawTrail(geom) {
  if (trailPoints.length < 2) return

  const { bobRadius } = geom

  // trace blanche
  ctx.strokeStyle = "white"
  ctx.lineWidth = bobRadius * 2 // = diamètre de la boule
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  ctx.beginPath()
  let newSubPath = true

  for (const p of trailPoints) {
    if (p === null) {
      newSubPath = true
      continue
    }

    if (newSubPath) {
      ctx.moveTo(p.x, p.y)
      newSubPath = false
    } else {
      ctx.lineTo(p.x, p.y)
    }
  }

  ctx.stroke()
}

// masque noir à l'intérieur du "0" pour avoir un donut propre
function drawInnerMask(geom) {
  const { pivotX, pivotY, length, bobRadius } = geom

  // ellipse extérieure du 0 (en utilisant le même scaling que la trajectoire)
  const outerX = length * ellipseScaleX
  const outerY = length * ellipseScaleY

  // épaisseur de l'anneau → on enlève cette épaisseur pour obtenir le rayon intérieur
  const thickness = bobRadius * 2.2 // à tweaker pour l'épaisseur du zéro

  const innerX = Math.max(0, outerX - thickness)
  const innerY = Math.max(0, outerY - thickness)

  ctx.fillStyle = "black"
  ctx.beginPath()
  ctx.ellipse(pivotX, pivotY, innerX, innerY, 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawPendulum(geom) {
  const { pivotX, pivotY, bobX, bobY, bobRadius } = geom

  // fil
  ctx.strokeStyle = "white"
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(pivotX, pivotY)
  ctx.lineTo(bobX, bobY)
  ctx.stroke()

  // boule
  ctx.beginPath()
  ctx.arc(bobX, bobY, bobRadius, 0, Math.PI * 2)
  ctx.fillStyle = "gray"
  ctx.fill()

  ctx.lineWidth = 3
  ctx.strokeStyle = "red"
  ctx.stroke()
}

// draw the typographic 0 (Helvetica) centered on pivot (used during pause)
function drawTypoZero(geom, alpha = 1) {
  const { pivotX, pivotY } = geom
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = "white"
  // size relative to canvas height; tweak as needed
  ctx.font = `bold ${Math.floor(canvas.height * 0.45)}px Helvetica, Arial, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("0", pivotX, pivotY)
  ctx.restore()
}

// overlay fade to black
function drawFade() {
  if (!isFading && fadeProgress <= 0) return
  ctx.save()
  ctx.globalAlpha = Math.min(Math.max(fadeProgress, 0), 1)
  ctx.fillStyle = "black"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.restore()
}

// =====================
// BOUCLE PRINCIPALE
// =====================

function update(dt) {
  dt = Math.min(dt, 1 / 30)

  // 1) intro (delay + animation)
  updateIntro(dt)

  // 2) physique (si autorisé)
  const geomBefore = getPendulumGeometry()
  updatePendulumPhysics(dt, geomBefore)

  // 3) trail update (si autorisé)
  const geom = getPendulumGeometry()
  updateTrail(geom)

  // 4) outro progression
  if (isOutroPlaying && !isPauseOnZero) {
    outroProgress += dt / OUTRO_DURATION
    if (outroProgress >= 1) {
      outroProgress = 1
      // start pause on zero
      isPauseOnZero = true
      pauseTimer = 0
    }
  }

  // 5) pause logic
  if (isPauseOnZero && !isFading) {
    pauseTimer += dt
    // during pause we hide the pendulum (draw only trail + inner mask + typo)
    if (pauseTimer >= PAUSE_ON_ZERO) {
      // start fading
      isFading = true
      fadeProgress = 0
    }
  }

  // 6) fade logic
  if (isFading) {
    fadeProgress += dt / FADE_DURATION
    if (fadeProgress >= 1) {
      fadeProgress = 1
      // fin de l'animation -> appeler finish()
      finish()
      return
    }
  }

  // ---------------------------
  //   RENDER
  // ---------------------------
  drawBackground(geom.w, geom.h)

  // draw trail + inner mask (always visible when present)
  drawTrail(geom)
  drawInnerMask(geom)

  // draw pendulum only if not in the pause-on-zero stage (we also hide during fade/outro end)
  if (!isPauseOnZero && !isFading) {
    drawPendulum(geom)
  }

  // If in pause show typographic zero cleanly on top
  if (isPauseOnZero) {
    // optional: fade-in the typographic zero (use pauseTimer to modulate alpha)
    const alpha = Math.min(1, Math.max(0, (pauseTimer / 0.2))) // quick fade-in
    drawTypoZero(geom, alpha)
  }

  // overlay fade (draw last)
  if (isFading) drawFade()
}
