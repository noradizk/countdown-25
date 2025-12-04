import { createEngine } from "../_shared/engine.js"
import { createSpringSettings, Spring } from "../_shared/spring.js"

const { renderer, input, math, run, finish, } = createEngine()
const { ctx, canvas } = renderer
run(update)

// =====================
// ÉTAT YOYO
// =====================

let initialized = false

let centerX = 0
let centerY = 0

let orbitRadius = 0      // rayon de la trajectoire du yoyo
const yoyoRadius = 100    // taille du yoyo

let angle = 0            // angle actuel en radians
let angularSpeed = 0     // vitesse angulaire (rad/s)
let isSpinning = false   // est-ce qu'il tourne ?

// =====================
// INIT
// =====================

function initIfNeeded() {
  if (initialized) return

  const w = canvas.width
  const h = canvas.height

  centerX = w / 2
  centerY = h / 2

  orbitRadius = Math.min(w, h) * 0.25  // un peu en dessous de la moitié

  initialized = true
}

// =====================
// INTERACTION
// =====================

canvas.addEventListener("pointerdown", () => {
  // au clic, on lance la rotation
  isSpinning = true
  angularSpeed = 4 // rad/s ≈ 0.64 tour/sec (2π ≈ 6.28)
})

// =====================
// UPDATE PRINCIPALE
// =====================

function update(dt) {
  initIfNeeded()

  // logique de rotation
  if (isSpinning) {
    angle += angularSpeed * dt
  }

  // === DESSIN ===
  const w = canvas.width
  const h = canvas.height

  // fond
  ctx.fillStyle = "black"
  ctx.fillRect(0, 0, w, h)

  // position du yoyo
  const yoyoX = centerX + Math.cos(angle) * orbitRadius
  const yoyoY = centerY + Math.sin(angle) * orbitRadius

  // fil : du centre au yoyo
  ctx.strokeStyle = "white"
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(centerX, centerY)
  ctx.lineTo(yoyoX, yoyoY)
  ctx.stroke()

  // yoyo : disque blanc
  ctx.fillStyle = "white"
  ctx.beginPath()
  ctx.arc(yoyoX, yoyoY, yoyoRadius, 0, Math.PI * 2)
  ctx.fill()

  // trou au centre du yoyo
  ctx.fillStyle = "black"
  ctx.beginPath()
  ctx.arc(yoyoX, yoyoY, yoyoRadius * 0.4, 0, Math.PI * 2)
  ctx.fill()
}
/*
run(update)

const spring = new Spring({
  position: 0
})

const settings1 = createSpringSettings({
  frequency: 3.5,
  halfLife: 0.05
})
const settings2 = createSpringSettings({
  frequency: .2,
  halfLife: 1.15
})


function update(dt) {

  if (input.isPressed()) {
    spring.target = -.1
    spring.settings = settings2
  }
  else {
    spring.target = 1
    spring.settings = settings1
  }

  spring.step(dt)

  const x = canvas.width / 2;
  const y = canvas.height / 2;
  const scale = Math.max(spring.position, 0)

  ctx.fillStyle = "black"
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = "white"
  ctx.textBaseline = "middle"
  ctx.font = `${canvas.height}px Helvetica Neue, Helvetica , bold`
  ctx.textAlign = "center"
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.fillText("0", 0, 0)

  if (scale <= 0) {
    finish()
  }

}
  */
