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

// facteur pour booster ou calmer l'effet du lancer
const DRAG_VELOCITY_SCALE = 0.9 // essaie 0.5 / 1 / 1.5


// =====================
// TIME / OUTRO
// =====================

// angle “repos” (vers le bas)
const REST_ANGLE = Math.PI / 2

// temps global
let globalTime = 0
let lastInteractionTime = 0

// inactivité après 0 complet avant de lancer l’outro
const IDLE_BEFORE_OUTRO = 1.0 // en secondes

// détection du tour complet
let zeroComplete = false
let lastLoopAngle = REST_ANGLE
let accumulatedRotation = 0
const TWO_PI = Math.PI * 2
const LOOP_THRESHOLD = TWO_PI * 0.9  // ~360° mais un peu de marge

// OUTRO machine à états
// "none" → "return" → "shrink" → "hold" → "fade"
let outroState = "none"
let outroTime = 0

const OUTRO_RETURN_DURATION = 0.5   // pendule revient vers le bas (chemin le plus court)
const OUTRO_SHRINK_DURATION = 0.3   // pendule remonte le long du fil et disparaît
const OUTRO_HOLD_DURATION   = 3.0   // pause sur le zéro
const FADE_DURATION         = 0.7   // fondu au noir

let fadeProgress = 0
let hasFinished = false

// pour l’outro : on garde l’angle de départ
let outroStartAngle = REST_ANGLE

// échelle de longueur du pendule (1 = normal, 0 = raccourci à 0)
// on l’utilise pour l’outro shrink, mais 1 en temps normal
let lengthScale = 1

// masque du zéro figé une fois le 0 complété
let zeroMaskInnerX = null
let zeroMaskInnerY = null


// =====================
// ÉTAT PENDULE
// =====================

// angle (radians) – départ vers le bas
let angle = REST_ANGLE
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

  // scale d’intro : 0 → 1
  const s = introComplete ? 1 : easeOutCubic(introProgress)

  // en temps normal lengthScale = 1 ; pendant l’outro shrink, 1 → 0
  const length = baseLength * s * lengthScale
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
// DÉTECTION DU TOUR COMPLET (360°) + lock du masque du zéro
// =====================

function updateLoopDetection(geom) {
  if (!introComplete) return
  if (zeroComplete) return

  let delta = angle - lastLoopAngle

  // on corrige pour toujours prendre le chemin le plus court
  if (delta > Math.PI)  delta -= TWO_PI
  if (delta < -Math.PI) delta += TWO_PI

  accumulatedRotation += delta
  lastLoopAngle = angle

  // condition : tour complet + pendule revenu vers le bas
  const ANGLE_MARGIN = 0.3 // ~17°
  if (
    Math.abs(accumulatedRotation) >= LOOP_THRESHOLD &&
    Math.abs(angle - REST_ANGLE) < ANGLE_MARGIN
  ) {
    zeroComplete = true
    lastInteractionTime = globalTime

    // on fige la taille du masque du zéro à ce moment-là
    const { length, bobRadius } = geom
    const outerX = length * ellipseScaleX
    const outerY = length * ellipseScaleY
    const thickness = bobRadius * 2.2
    zeroMaskInnerX = Math.max(0, outerX - thickness)
    zeroMaskInnerY = Math.max(0, outerY - thickness)
  }
}


// =====================
// INTERACTION : DRAG
// =====================

canvas.addEventListener("pointerdown", (event) => {
  if (!introComplete) return   // on ignore les clics pendant l’intro
  if (outroState !== "none") return // plus d’inputs pendant l’outro

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

    // interaction utilisateur → reset du timer d’inactivité
    lastInteractionTime = globalTime
  }
})

canvas.addEventListener("pointermove", (event) => {
  if (!isDragging) return
  if (outroState !== "none") {
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
      if (delta > Math.PI) delta -= TWO_PI
      if (delta < -Math.PI) delta += TWO_PI

      dragAngularVelocity = delta / dt
    }
  }

  angle = newAngle
  lastDragAngle = newAngle
  lastDragTime = now

  // interaction en cours → reset du timer d’inactivité
  lastInteractionTime = globalTime
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

  // interaction → reset du timer d’inactivité
  lastInteractionTime = globalTime
}

canvas.addEventListener("pointerup", endDrag)
canvas.addEventListener("pointerleave", endDrag)


// =====================
// PHYSIQUE DU PENDULE
// =====================

function updatePendulumPhysics(dt, geom) {
  if (!introComplete) return    // pas de physique pendant l’intro
  if (outroState !== "none") return // on ne fait plus de physique pendant l’outro
  if (isDragging) return        // pas de physique pendant le drag

  const { length } = geom

  // angle par rapport à la verticale vers le bas
  const theta = angle - Math.PI / 2

  const gOverL = gravityConstant / length
  const angularAcceleration = -gOverL * Math.sin(theta)

  // intégration
  angularVelocity += angularAcceleration * dt

  // clamp de la vitesse angulaire pour éviter les valeurs folles
  const MAX_ANGULAR_SPEED = 4.0
  if (angularVelocity > MAX_ANGULAR_SPEED) angularVelocity = MAX_ANGULAR_SPEED
  if (angularVelocity < -MAX_ANGULAR_SPEED) angularVelocity = -MAX_ANGULAR_SPEED

  angularVelocity *= damping
  angle += angularVelocity * dt
}


// =====================
// TRACE (après relâche, sur la même trajectoire que le pendule)
// =====================

function updateTrail(geom) {
  if (!introComplete) return
  if (isDragging) return
  if (outroState !== "none") return // on fige le zéro pendant l’outro

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
// OUTRO : logique d’animation
// =====================

function updateOutro(dt) {
  if (!zeroComplete) return
  if (hasFinished) return

  // si on n’a pas encore commencé l’outro → on surveille l’inactivité
  if (outroState === "none") {
    if (!isDragging && (globalTime - lastInteractionTime >= IDLE_BEFORE_OUTRO)) {
      outroState = "return"
      outroTime = 0
      outroStartAngle = angle
      lengthScale = 1 // on s’assure que la longueur est normale au début
    }
    return
  }

  // une fois qu’on est en outro, on avance le temps local
  outroTime += dt

  if (outroState === "return") {
    // pendule revient vers l’angle REST_ANGLE par le chemin le plus court (0.5s)
    const t = Math.min(outroTime / OUTRO_RETURN_DURATION, 1)
    const eased = easeOutCubic(t)

    // diff angulaire chemin le plus court
    let diff = REST_ANGLE - outroStartAngle
    if (diff > Math.PI) diff -= TWO_PI
    if (diff < -Math.PI) diff += TWO_PI

    angle = outroStartAngle + diff * eased
    lengthScale = 1 // longueur normale

    if (t >= 1) {
      // on est revenu au bas
      angle = REST_ANGLE
      outroState = "shrink"
      outroTime = 0
    }
  } else if (outroState === "shrink") {
    // le pendule remonte le long du fil et disparaît (0.3s)
    const t = Math.min(outroTime / OUTRO_SHRINK_DURATION, 1)
    const eased = easeOutCubic(t)

    // on réduit uniquement la longueur du pendule, l’angle reste vers le bas
    angle = REST_ANGLE
    lengthScale = 1 - eased // 1 → 0

    if (t >= 1) {
      lengthScale = 0
      outroState = "hold"
      outroTime = 0
    }
  } else if (outroState === "hold") {
    // pause sur le zéro seul (3s)
    angle = REST_ANGLE
    lengthScale = 0 // pendule totalement raccourci, on pourra choisir de ne plus l’afficher

    if (outroTime >= OUTRO_HOLD_DURATION) {
      outroState = "fade"
      outroTime = 0
      fadeProgress = 0
    }
  } else if (outroState === "fade") {
    // fondu au noir (0.7s) puis finish
    const t = Math.min(outroTime / FADE_DURATION, 1)
    fadeProgress = t

    if (t >= 1 && !hasFinished) {
      hasFinished = true
      finish()
    }
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

  // si on a figé le masque au moment où le zéro a été complété
  let innerX, innerY

  if (zeroMaskInnerX != null && zeroMaskInnerY != null) {
    innerX = zeroMaskInnerX
    innerY = zeroMaskInnerY
  } else {
    // version dynamique avant que le zéro soit complet
    const outerX = length * ellipseScaleX
    const outerY = length * ellipseScaleY
    const thickness = bobRadius * 2.2
    innerX = Math.max(0, outerX - thickness)
    innerY = Math.max(0, outerY - thickness)
  }

  ctx.fillStyle = "black"
  ctx.beginPath()
  ctx.ellipse(pivotX, pivotY, innerX, innerY, 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawPendulum(geom) {
  const { pivotX, pivotY, bobX, bobY, bobRadius } = geom

  // si lengthScale = 0 (pendule complètement raccourci), on peut choisir de ne plus le dessiner
  if (lengthScale <= 0) {
    return
  }

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

// overlay de fade
function drawFadeOverlay() {
  if (fadeProgress <= 0) return

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
  if (hasFinished) return

  globalTime += dt

  // 1) mettre à jour l’intro
  updateIntro(dt)

  const geomBefore = getPendulumGeometry()
  updatePendulumPhysics(dt, geomBefore)

  // 2) détection du tour complet (uniquement avant l’outro)
  updateLoopDetection(geomBefore)

  // 3) logique d’outro (après zéro complet)
  updateOutro(dt)

  const geom = getPendulumGeometry()
  updateTrail(geom)

  // =====================
  // RENDER
  // =====================

  drawBackground(geom.w, geom.h)
  drawTrail(geom)       // trace = zéro
  drawInnerMask(geom)   // masque au centre du zéro
  drawPendulum(geom)    // pendule par-dessus (ou pas, selon l’outro)
  drawFadeOverlay()     // fondu si on est en phase fade
}
