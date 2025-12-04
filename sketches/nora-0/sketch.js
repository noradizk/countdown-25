import { createEngine } from "../_shared/engine.js"

const { renderer, run, finish } = createEngine()
const { ctx, canvas } = renderer

run(update)

// =====================
// INTRO
// =====================

let introProgress = 0        // 0 → pas visible, 1 → intro finie
const introDuration = 1.2    // en secondes
let introComplete = false

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

function updateIntro(dt) {
  if (introComplete) return

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


// =====================
// ÉTAT PENDULE
// =====================

// angle (radians) – départ vers le bas
let angle = Math.PI / 2
let angularVelocity = 0
let isDragging = false

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

  // scale d’intro : 0 → 1
  const s = introComplete ? 1 : easeOutCubic(introProgress)

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

canvas.addEventListener("pointerdown", (event) => {
  if (!introComplete) return   // on ignore les clics pendant l’intro
  const { x, y } = getCanvasCoordinates(event)
  const { bobX, bobY, bobRadius } = getPendulumGeometry()

  const dx = x - bobX
  const dy = y - bobY
  const dist = Math.sqrt(dx * dx + dy * dy)

  if (dist <= bobRadius * 1.6) {
    isDragging = true
    angularVelocity = 0
  }
})

canvas.addEventListener("pointermove", (event) => {
  if (!isDragging) return

  const { x, y } = getCanvasCoordinates(event)
  const { pivotX, pivotY } = getPendulumGeometry()

  // on "annule" l'ellipse pour retrouver l'angle circulaire
  const dx = x - pivotX
  const dy = y - pivotY

  const correctedX = dx / ellipseScaleX
  const correctedY = dy / ellipseScaleY

  angle = Math.atan2(correctedY, correctedX)
})

function endDrag() {
  if (!isDragging) return
  isDragging = false

  // coupe la trace pour ne pas relier avec les tracés précédents
  trailPoints.push(null)
}

canvas.addEventListener("pointerup", endDrag)
canvas.addEventListener("pointerleave", endDrag)


// =====================
// PHYSIQUE DU PENDULE
// =====================

function updatePendulumPhysics(dt, geom) {
  if (!introComplete) return    // pas de physique pendant l’intro
  if (isDragging) return
  if (isDragging) return // pas de physique pendant le drag

  const { length } = geom

  // angle par rapport à la verticale vers le bas
  const theta = angle - Math.PI / 2

  const gOverL = gravityConstant / length
  const angularAcceleration = -gOverL * Math.sin(theta)

  angularVelocity += angularAcceleration * dt
  angularVelocity *= damping
  angle += angularVelocity * dt
}


// =====================
// TRACE (après relâche, sur la même trajectoire que le pendule)
// =====================

function updateTrail(geom) {
  if (!introComplete) return
  if (isDragging) return


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
  ctx.fillStyle = "white"
  ctx.fill()

  ctx.lineWidth = 3
  ctx.strokeStyle = "red"
  ctx.stroke()
}


// =====================
// BOUCLE PRINCIPALE
// =====================

function update(dt) {
  dt = Math.min(dt, 1 / 30)
  // 1) mettre à jour l’intro
  updateIntro(dt)

  const geomBefore = getPendulumGeometry()
  updatePendulumPhysics(dt, geomBefore)

  const geom = getPendulumGeometry()
  updateTrail(geom)

  drawBackground(geom.w, geom.h)
  drawTrail(geom)
  drawPendulum(geom)
}
