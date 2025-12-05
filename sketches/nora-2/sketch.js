import { createEngine } from "../_shared/engine.js"
import { Spring } from "../_shared/spring.js"

// ⚠️ ici on récupère aussi `audio`
const { renderer, input, math, run, finish, audio } = createEngine()
const { ctx, canvas } = renderer

// ---------------------------
//   PARAMS GLOBAUX
// ---------------------------
const dragPower = 1.0
const maxBlur = 100

let blurAmount = maxBlur
let puzzleSolved = false
let hasFinishCalled = false

// ---------------------------
//   SON
// ---------------------------
// on utilise l'API audio de ton engine
const moletteMove = [
  await audio.load({src:"audio/molette6.mp3"}),
  await audio.load({src:"audio/molette6.mp3"}),
  await audio.load({src:"audio/molette6.mp3"}),
  await audio.load({src:"audio/molette6.mp3"})]


// loop pendant le drag
let isMolettePlaying = false

function startMolette() {
  if (isMolettePlaying) return
  isMolettePlaying = true

  // si l'objet audio supporte .loop (style HTMLAudio)
  try {
    //moletteMove.loop = true
  } catch (e) {
    // si pas supporté, on ignore
  }

  
}

function stopMolette() {
  if (!isMolettePlaying) return
  isMolettePlaying = false


  // suivant l'implémentation de ton moteur audio
  // if (typeof moletteMove.stop === "function") {
  //   moletteMove.stop()
  // } else if (typeof moletteMove.pause === "function") {
  //   moletteMove.pause()
  //   if ("currentTime" in moletteMove) {
  //     moletteMove.currentTime = 0
  //   }
  // }
}

// ---------------------------
//   INTRO / OUTRO
// ---------------------------

// Durée en secondes (tweak comme tu veux)
const INTRO_DURATION = 3      // temps pour que les knobs entrent dans la view
const OUTRO_DURATION = 3      // temps pour qu'ils sortent de la view
const POST_SOLVE_DELAY = 0.8  // délai après la résolution avant de lancer l'outro

let introProgress = 0         // 0 → en bas, 1 → en place
let outroProgress = 0         // 0 → en place, 1 → hors de l'écran
let isIntroDone = false
let isOutroPlaying = false
let isOutroDone = false

// temps écoulé depuis que le puzzle est résolu
let solvedTime = 0

// ---------------------------
//   HELPERS ANGLES / MATHS
// ---------------------------
function degToRad(d) {
  return d * Math.PI / 180
}

function shortestAngleDiff(a, b) {
  let diff = (a - b) % (2 * Math.PI)
  if (diff >  Math.PI) diff -= 2 * Math.PI
  if (diff < -Math.PI) diff += 2 * Math.PI
  return diff
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val))
}

// ---------------------------
//   CONFIG ANGLES
// ---------------------------
const totalSpanDeg = 170
const halfSpanRad = degToRad(totalSpanDeg / 2)
const centerSmall = 0                 // en radians
const centerBig   = centerSmall + Math.PI

// ---------------------------
//   KNOB CONFIG + CREATION
// ---------------------------
const BIG_KNOB_STYLE = {
  strokeWidth: 100,
  tickCount: 200,
  majorScale: 0.55,
  minorScale: 0.25,
  handleLength: 100,
  handleWidth: 70
}

const SMALL_KNOB_STYLE = {
  strokeWidth: 100,
  tickCount: 120,
  majorScale: 0.6,
  minorScale: 0.3,
  handleLength: 200,
  handleWidth: 90
}

function createKnob(centerAngle, radius, range, startAtMax = false) {
  const minAngle = centerAngle - range
  const maxAngle = centerAngle + range

  return {
    angle: startAtMax ? maxAngle : minAngle,
    dragging: false,
    lastMouseAngle: 0,

    radius,
    minAngle,
    maxAngle,
    centerAngle,
    range,

    targetAngle: centerAngle // sera randomisé ensuite
  }
}

const knobSmall = createKnob(centerSmall, canvas.height * 0.30, halfSpanRad, false)
const knobBig   = createKnob(centerBig,   canvas.height * 0.35, halfSpanRad, true)

// ---------------------------
//   RANDOMISATION DE LA SOLUTION
// ---------------------------
function randomizeSolution() {
  const marginDeg = 10 // éviter les bords
  const margin = degToRad(marginDeg)

  // petit knob
  const minSmall = knobSmall.minAngle + margin
  const maxSmall = knobSmall.maxAngle - margin
  knobSmall.targetAngle = minSmall + Math.random() * (maxSmall - minSmall)

  // grand knob
  const minBig = knobBig.minAngle + margin
  const maxBig = knobBig.maxAngle - margin
  knobBig.targetAngle = minBig + Math.random() * (maxBig - minBig)

  // positions de départ
  knobSmall.angle = knobSmall.minAngle
  knobBig.angle   = knobBig.maxAngle

  blurAmount = maxBlur
  puzzleSolved = false
  hasFinishCalled = false
}

randomizeSolution()

// ---------------------------
//   MOUSE → COORDS CANVAS
// ---------------------------
function getMousePosCanvas(e) {
  const rect = canvas.getBoundingClientRect()

  const xCss = e.clientX - rect.left
  const yCss = e.clientY - rect.top

  const scaleX = canvas.width  / rect.width
  const scaleY = canvas.height / rect.height

  return {
    x: xCss * scaleX - canvas.width  / 2,
    y: yCss * scaleY - canvas.height / 2
  }
}

function getMouseAngle(e) {
  const { x, y } = getMousePosCanvas(e)
  return Math.atan2(y, x)
}

// ---------------------------
//   HITTEST SUR LES POIGNÉES
// ---------------------------
function isOnHandle(e, knob, style) {
  const { x, y } = getMousePosCanvas(e)

  // repère du knob : rotation inverse
  const cos = Math.cos(-knob.angle)
  const sin = Math.sin(-knob.angle)
  const xr = x * cos - y * sin
  const yr = x * sin + y * cos

  const base = knob.radius + style.strokeWidth / 2

  const rectX = -style.handleWidth / 2
  const rectY = -(base + style.handleLength)
  const rectW = style.handleWidth
  const rectH = style.handleLength

  return (
    xr >= rectX && xr <= rectX + rectW &&
    yr >= rectY && yr <= rectY + rectH
  )
}

function isOnBigHandle(e) {
  return isOnHandle(e, knobBig, BIG_KNOB_STYLE)
}

function isOnSmallHandle(e) {
  return isOnHandle(e, knobSmall, SMALL_KNOB_STYLE)
}

// ---------------------------
//   EVENTS SOURIS
// ---------------------------
function stopDragging() {
  knobSmall.dragging = false
  knobBig.dragging = false

  // si plus aucun knob n'est drag → on coupe le son
  //stopMolette()
}

canvas.addEventListener("mousedown", (e) => {
  if (puzzleSolved) return

  const a = getMouseAngle(e)
  let startedDrag = false

  // GRAND KNOB (priorité)
  if (isOnBigHandle(e)) {
    knobBig.dragging = true
    knobBig.lastMouseAngle = a
    startedDrag = true
  }
  // PETIT KNOB
  else if (isOnSmallHandle(e)) {
    knobSmall.dragging = true
    knobSmall.lastMouseAngle = a
    startedDrag = true
  }

  // si on commence à drag un knob → on lance le son en loop
  //if (startedDrag) {
   // startMolette()
  //}
})

canvas.addEventListener("mousemove", (e) => {
  if (puzzleSolved) return

  const a = getMouseAngle(e)

  if (knobSmall.dragging) {
    const delta = shortestAngleDiff(a, knobSmall.lastMouseAngle)
    const newAngle = knobSmall.angle + delta * dragPower
    knobSmall.angle = clamp(newAngle, knobSmall.minAngle, knobSmall.maxAngle)
    knobSmall.lastMouseAngle = a
  }

  if (knobBig.dragging) {
    const delta = shortestAngleDiff(a, knobBig.lastMouseAngle)
    const newAngle = knobBig.angle + delta * dragPower
    knobBig.angle = clamp(newAngle, knobBig.minAngle, knobBig.maxAngle)
    knobBig.lastMouseAngle = a
  }
})

canvas.addEventListener("mouseup", stopDragging)
canvas.addEventListener("mouseleave", stopDragging)

// ---------------------------
//   BLUR & LOGIQUE DU PUZZLE
// ---------------------------
function triggerFinish() {
  if (hasFinishCalled) return
  hasFinishCalled = true
  finish()
}

function updateBlurFromRotation() {
  if (puzzleSolved) {
    blurAmount = 0
    return
  }

  const diffSmall = shortestAngleDiff(knobSmall.angle, knobSmall.targetAngle)
  const diffBig   = shortestAngleDiff(knobBig.angle,   knobBig.targetAngle)

  const absS = Math.abs(diffSmall)
  const absB = Math.abs(diffBig)

  const maxError = Math.PI / 4
  const normS = Math.min(absS / maxError, 1)
  const normB = Math.min(absB / maxError, 1)

  const error = (normS + normB) * 0.5
  blurAmount = error * maxBlur

  const tolerance = degToRad(2)
  if (absS < tolerance && absB < tolerance) {
    // Puzzle résolu → on verrouille les angles, on enlève le blur
    puzzleSolved = true
    solvedTime = 0 // reset du timer de latence
    knobSmall.angle = knobSmall.targetAngle
    knobBig.angle = knobBig.targetAngle
    blurAmount = 0
  }
}

// ---------------------------
//   DESSIN DU KNOB - CIRCLE
// ---------------------------
function drawGraduatedCircle(
  radius,
  strokeWidth,
  tickCount,
  majorScale,
  minorScale,
  handleLength,
  handleWidth,
  angle
) {
  ctx.save()

  // rotation du knob
  ctx.rotate(angle)
const colorCircle = "rgba(44, 44, 44, 1)"
  // --- CERCLE ---
  ctx.beginPath()
  ctx.lineWidth = strokeWidth
  ctx.strokeStyle = colorCircle
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.stroke()

  const base = radius + strokeWidth / 2
  const half = strokeWidth

  const majorSize = half * majorScale
  const minorSize = half * minorScale

  // --- GRADUATIONS ---
  for (let i = 0; i < tickCount; i++) {
    const isMajor = (i % 10 === 0)
    const size = isMajor ? majorSize : minorSize

    ctx.beginPath()
    ctx.moveTo(0, base)
    ctx.lineTo(0, base - size)
    ctx.lineWidth = isMajor ? 5 : 2
    ctx.strokeStyle = "white"
    ctx.stroke()

    ctx.rotate((Math.PI * 2) / tickCount)
  }

  // --- HANDLE ---
  ctx.beginPath()
  ctx.fillStyle = colorCircle
  ctx.strokeStyle = colorCircle
  ctx.lineWidth = 4

  ctx.rect(
    -handleWidth / 2,
    -(base + handleLength),
    handleWidth,
    handleLength
  )

  ctx.fill()
  ctx.stroke()

  ctx.restore()
}

function drawKnob(knob, style) {
  drawGraduatedCircle(
    knob.radius,
    style.strokeWidth,
    style.tickCount,
    style.majorScale,
    style.minorScale,
    style.handleLength,
    style.handleWidth,
    knob.angle
  )
}

// ---------------------------
//   WHITE BACKGROUND LENS
// ---------------------------

function drawBackground() {
  ctx.setTransform(1, 0, 0, 1, 0, 0) // reset transform
  ctx.fillStyle = "black"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
}

// le "2" centré écran (indépendant des translations des knobs)
function drawNumber2AtCenter(cx, cy) {
  ctx.save()
  ctx.translate(cx, cy) // number2() dessine autour de (0,0)
  number2()
  ctx.restore()
}

// disque blanc à l’intérieur du petit cercle (coordonnées globales)
function drawInnerSmallCircle(cx, cy) {
  const innerSmallRadius =
    knobSmall.radius - SMALL_KNOB_STYLE.strokeWidth / 2 + 1 // bord interne

  ctx.beginPath()
  ctx.arc(cx, cy, innerSmallRadius, 0, Math.PI * 2)
  ctx.fillStyle = "white"
  ctx.fill()
}

// groupe des knobs (offsetX/offsetY serviront plus tard pour l’intro/outro)
function drawKnobsScene(cx, cy, offsetX = 0, offsetY = 0) {
  ctx.save()
  ctx.translate(cx + offsetX, cy + offsetY)

  drawKnob(knobBig, BIG_KNOB_STYLE)
  drawKnob(knobSmall, SMALL_KNOB_STYLE)

  ctx.restore()
}

// ---------------------------
//   NOMBRE "2" AU CENTRE
// ---------------------------
function number2() {
  ctx.save()
  ctx.filter = `blur(${blurAmount}px)`

  ctx.fillStyle = "black"
  ctx.font = `${canvas.height * 0.4}px Helvetica Neue, Helvetica, bold`
  ctx.textBaseline = "middle"
  ctx.textAlign = "center"
  ctx.fillText("2", 0, 0)

  ctx.filter = "none"
  ctx.restore()
}

// ---------------------------
//   BOUCLE UPDATE
// ---------------------------
function update(dt) {
  const w = canvas.width
  const h = canvas.height
  const cx = w / 2
  const cy = h / 2

  // --- LOGIQUE DU PUZZLE (blur + détection de résolution) ---
  updateBlurFromRotation()

  // --- GESTION INTRO ---
  if (!isIntroDone) {
    introProgress += dt / INTRO_DURATION
    if (introProgress >= 1) {
      introProgress = 1
      isIntroDone = true
    }
  }

  // --- GESTION LATENCE APRÈS RÉSOLUTION ---
  if (puzzleSolved && !isOutroPlaying && !isOutroDone) {
    solvedTime += dt
    if (solvedTime >= POST_SOLVE_DELAY) {
      isOutroPlaying = true
      outroProgress = 0
    }
  }

  // --- GESTION OUTRO ---
  if (isOutroPlaying && !isOutroDone) {
    outroProgress += dt / OUTRO_DURATION
    if (outroProgress >= 1) {
      outroProgress = 1
      isOutroDone = true
      triggerFinish() // appel de finish à la fin de l'outro
    }
  }

  // ---------------------------
  //   CALCUL DES OFFSETS
  // ---------------------------
  let offsetX = 0
  let offsetY = 0

  // Intro : les knobs viennent du haut et descendent
  if (!isIntroDone) {
    const t = introProgress // 0 → 1
    const startOffsetY = h * 0.9  // distance depuis le haut
    const eased = t * t * (3 - 2 * t) // easeInOut simple
    offsetY = -(1 - eased) * startOffsetY // descend depuis le haut jusqu'à 0
  }
  // Outro : les knobs descendent vers le bas
  else if (isOutroPlaying) {
    const t = outroProgress // 0 → 1
    const endOffsetY = h * 1 // distance vers le bas
    const eased = t * t        // easeIn
    offsetY = eased * endOffsetY // 0 → +endOffsetY (vers le bas)
  }

  // ---------------------------
  //   DESSIN
  // ---------------------------

  // 1) fond noir
  drawBackground()

  // 2) ROND BLANC qui suit les knobs
  const circleX = cx + offsetX
  const circleY = cy + offsetY
  drawInnerSmallCircle(circleX, circleY)

  // 3) NUMÉRO 2 au centre, fixe
  drawNumber2AtCenter(cx, cy)

  // 4) KNOBS par-dessus, avec le même offset que le rond blanc
  drawKnobsScene(cx, cy, offsetX, offsetY)
    if(Math.abs(knobSmall.angle - (knobSmall.lastSoundAngle ?? 0)) > math.toRadian(3))
  {
    console.log(knobSmall.angle)
    knobSmall.lastSoundAngle = knobSmall.angle;
    const randomId = Math.floor(Math.random()*moletteMove.length)
    moletteMove[randomId].play({
      volue:math.lerp(.5,1,Math.random()),
      rate:math.lerp(.9,1.1,Math.random()),
    });
  }


  if(Math.abs(knobBig.angle - (knobBig.lastSoundAngle ?? 0)) > math.toRadian(3))
  {
    console.log(knobBig.angle)
    knobBig.lastSoundAngle = knobBig.angle;
    const randomId = Math.floor(Math.random()*moletteMove.length)
    moletteMove[randomId].play({
      volue:math.lerp(.5,1,Math.random()),
      rate:math.lerp(.9,1.1,Math.random()),
    });
  }
}

// lancement de la boucle
run(update)