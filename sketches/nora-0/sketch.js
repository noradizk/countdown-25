import { createEngine } from "../_shared/engine.js"

const { renderer, run, finish, math } = createEngine()
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
// AUDIO
// =====================

// Son one-shot au release
const pendulumReleaseSound = new Audio("audio/pendulum.wav")
pendulumReleaseSound.volume = 0.5

// Son en boucle après un certain temps
const pendulumLoopSound = new Audio("audio/pendulum.wav")
pendulumLoopSound.volume = 0.3
pendulumLoopSound.loop = true

let loopTimeout = null

function playPendulumReleaseSound() {
  try {
    pendulumReleaseSound.currentTime = 0
    pendulumReleaseSound.play()
  } catch (e) {
    // policies navigateur
  }
}

function startLoopAfterDelay(delayMs) {
  if (loopTimeout !== null) {
    clearTimeout(loopTimeout)
    loopTimeout = null
  }

  loopTimeout = setTimeout(() => {
    try {
      pendulumLoopSound.currentTime = 0
      pendulumLoopSound.play()
    } catch (e) {
      // policies navigateur
    }
  }, delayMs)
}

function stopLoop() {
  if (loopTimeout !== null) {
    clearTimeout(loopTimeout)
    loopTimeout = null
  }
  pendulumLoopSound.pause()
  pendulumLoopSound.currentTime = 0
}


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

// détection du 0 (tour complet du tracé)
let zeroComplete = false

// OUTRO machine à états
// "none" → "return" → "shrink" → "hold" → "fade"
let outroState = "none"
let outroTime = 0

const OUTRO_RETURN_DURATION = 1.5   // pendule revient vers le bas (chemin le plus court)
const OUTRO_SHRINK_DURATION = 0.3   // pendule remonte le long du fil et disparaît
const OUTRO_HOLD_DURATION   = 3.0   // pause sur le zéro
const FADE_DURATION         = 0.7   // fondu au noir

let fadeProgress = 0
let hasFinished = false

// pour l’outro : on garde l’angle de départ
let outroStartAngle = REST_ANGLE

// échelle de longueur du pendule (1 = normal, 0 = raccourci à 0)
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
// DÉTECTION PAR SECTEURS (basée sur le tracé autour du pivot)
// =====================

const NUM_SECTORS = 72                    // nombre de "parts de pizza"
const SECTOR_COVERAGE_THRESHOLD = 0.85    // % de secteurs visités pour valider le tour
const MAX_GAP_RATIO = 0.25                // max = 1/4 du cercle non couvert
const MIN_LOOP_RADIUS_FACTOR = 0.7        // zone annulaire min (en % de la longueur)
const MAX_LOOP_RADIUS_FACTOR = 1.3        // zone annulaire max

let sectorVisited = new Array(NUM_SECTORS).fill(false)

function resetLoopDetectionIfNeeded() {
  if (zeroComplete) return
  sectorVisited.fill(false)
}

function computeCoverageAndMaxGap() {
  let visitedCount = 0
  for (let i = 0; i < NUM_SECTORS; i++) {
    if (sectorVisited[i]) visitedCount++
  }
  const coverage = visitedCount / NUM_SECTORS

  // max gap circulaire de secteurs non visités
  let maxGap = 0
  let currentGap = 0

  // on parcourt deux fois pour gérer le wrap-around
  for (let i = 0; i < NUM_SECTORS * 2; i++) {
    const idx = i % NUM_SECTORS
    if (!sectorVisited[idx]) {
      currentGap++
      if (currentGap > maxGap) maxGap = currentGap
    } else {
      currentGap = 0
    }
  }

  if (maxGap > NUM_SECTORS) maxGap = NUM_SECTORS
  const maxGapRatio = maxGap / NUM_SECTORS

  return { coverage, maxGapRatio }
}


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
// DÉTECTION DU 0 BASÉE SUR LE TRACÉ
// =====================

function updateLoopDetectionFromGeometry(geom) {
  if (!introComplete) return
  if (zeroComplete) return

  const { pivotX, pivotY, length, bobX, bobY, bobRadius } = geom

  if (length <= 0) return

  // distance du pivot
  const dx = bobX - pivotX
  const dy = bobY - pivotY
  const r = Math.sqrt(dx * dx + dy * dy)

  const minR = length * MIN_LOOP_RADIUS_FACTOR
  const maxR = length * MAX_LOOP_RADIUS_FACTOR

  // on ne prend en compte que les points dans une "couronne" autour du pivot
  if (r < minR || r > maxR) {
    return
  }

  // angle autour du pivot
  let a = Math.atan2(dy, dx) // [-PI..PI]
  if (a < 0) a += Math.PI * 2 // [0..2PI]

  let sectorIndex = Math.floor(a / (2 * Math.PI) * NUM_SECTORS)
  if (sectorIndex < 0) sectorIndex = 0
  if (sectorIndex >= NUM_SECTORS) sectorIndex = NUM_SECTORS - 1

  if (!window.sectorCounter) window.sectorCounter = 0
  window.sectorCounter++
  if (window.sectorCounter >= 60) {
    console.log(sectorVisited)
    window.sectorCounter = 0
  }
  if (!sectorVisited[sectorIndex]) {
    sectorVisited[sectorIndex] = true
  }

  // Check if all sectors have been visited
  if (sectorVisited.every(visited => visited)) {
    zeroComplete = true
    console.log("Every sector visited!")
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

    // si on redrag, on coupe le loop
    stopLoop()

    // init tracking du drag
    lastDragAngle = angle
    lastDragTime = performance.now() / 1000 // en secondes
    dragAngularVelocity = 0

    // nouveau "lancer" → on reset la couverture des secteurs si le 0 n'est pas déjà validé
    resetLoopDetectionIfNeeded()

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
      const TWO_PI = Math.PI * 2
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

  // 🔊 son one-shot au release
  playPendulumReleaseSound()

  // 🔁 on démarre un loop discret après 500 ms
  startLoopAfterDelay(1000)

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
  if (length <= 0) return

  const theta = angle - Math.PI / 2
  const gOverL = gravityConstant / length
  const angularAcceleration = -gOverL * Math.sin(theta)

  angularVelocity += angularAcceleration * dt

  const MAX_ANGULAR_SPEED = 7.0
  if (angularVelocity > MAX_ANGULAR_SPEED) angularVelocity = MAX_ANGULAR_SPEED
  if (angularVelocity < -MAX_ANGULAR_SPEED) angularVelocity = -MAX_ANGULAR_SPEED

  angularVelocity *= damping
  angle += angularVelocity * dt
}


// =====================
// TRACE
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
  } else if (last === null) {
    trailPoints.push(point)
  } else {
    const dx = point.x - last.x
    const dy = point.y - last.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist >= minDist) {
      trailPoints.push(point)
    }
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

  if (outroState === "none") {
    if (!isDragging && (globalTime - lastInteractionTime >= IDLE_BEFORE_OUTRO)) {
      outroState = "return"
      outroTime = 0
      outroStartAngle = angle
      lengthScale = 1

      // dès que l’outro commence, on coupe le loop
      stopLoop()
    }
    return
  }

  outroTime += dt

  if (outroState === "return") {
    const t = Math.min(outroTime / OUTRO_RETURN_DURATION, 1)
    const eased = easeOutCubic(t)

    angle = math.lerpAngleRad(outroStartAngle, REST_ANGLE, eased)
    lengthScale = 1

    if (t >= 1) {
      angle = REST_ANGLE
      outroState = "shrink"
      outroTime = 0
    }
  } else if (outroState === "shrink") {
    const t = Math.min(outroTime / OUTRO_SHRINK_DURATION, 1)
    const eased = easeOutCubic(t)

    angle = REST_ANGLE
    lengthScale = 1 - eased

    if (t >= 1) {
      lengthScale = 0
      outroState = "hold"
      outroTime = 0
    }
  } else if (outroState === "hold") {
    angle = REST_ANGLE
    lengthScale = 0

    if (outroTime >= OUTRO_HOLD_DURATION) {
      outroState = "fade"
      outroTime = 0
      fadeProgress = 0
    }
  } else if (outroState === "fade") {
    const t = Math.min(outroTime / FADE_DURATION, 1)
    fadeProgress = t

    if (t >= 1 && !hasFinished) {
      hasFinished = true
      stopLoop()
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

  ctx.strokeStyle = "white"
  ctx.lineWidth = bobRadius * 2
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

function drawInnerMask(geom) {
  const { pivotX, pivotY, length, bobRadius } = geom

  let innerX, innerY
  if (zeroMaskInnerX != null && zeroMaskInnerY != null) {
    innerX = zeroMaskInnerX
    innerY = zeroMaskInnerY
  } else {
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

  if (lengthScale <= 0) return

  // ---- CÂBLE ----
  ctx.strokeStyle = "white"
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(pivotX, pivotY)
  ctx.lineTo(bobX, bobY)
  ctx.stroke()

  // ---- BOULE EXTERNE ----
  ctx.beginPath()
  ctx.arc(bobX, bobY, bobRadius, 0, Math.PI * 2)
  ctx.fillStyle = "gray"
  ctx.fill()

  ctx.lineWidth = 3
  ctx.strokeStyle = "gray"
  ctx.stroke()
}

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

  // intro scaling
  updateIntro(dt)

  const geomBefore = getPendulumGeometry()
  updatePendulumPhysics(dt, geomBefore)

  // détection du 0 basée sur la position actuelle (tracé)
  updateLoopDetectionFromGeometry(geomBefore)

  // outro (si zeroComplete + 1s d’inactivité)
  updateOutro(dt)

  const geom = getPendulumGeometry()
  updateTrail(geom)

  drawBackground(geom.w, geom.h)
  drawTrail(geom)
  drawInnerMask(geom)
  drawPendulum(geom)
  drawFadeOverlay()
}
