import { createEngine } from "../_shared/engine.js"
import { Spring } from "../_shared/spring.js"

const { renderer, input, math, run, finish, } = createEngine()
const { ctx, canvas } = renderer
run(update)


let openProgress = 0        // 0 = fermée, 1 = ouverte
let isOpen = false          // état cible après snap
let isDragging = false
let dragStartX = 0
let dragStartProgress = 0
const openSpeed = 4         // vitesse de snap auto (ajuste si besoin)



canvas.addEventListener("pointerdown", (event) => {
  const rect = canvas.getBoundingClientRect()
  const xInCanvas = event.clientX - rect.left
  const x = xInCanvas * (canvas.width / rect.width)

  isDragging = true
  dragStartX = x
  dragStartProgress = openProgress
})

canvas.addEventListener("pointermove", (event) => {
  if (!isDragging) return

  const rect = canvas.getBoundingClientRect()
  const xInCanvas = event.clientX - rect.left
  const x = xInCanvas * (canvas.width / rect.width)

  const dx = x - dragStartX

  // même largeur que ta salle : w * 0.1
  const doorWidth = canvas.width * 0.1
  const deltaProgress = - dx / doorWidth   // tirer de largeur de porte ≈ 0 → 1

  openProgress = dragStartProgress + deltaProgress

  // clamp entre 0 et 1
  if (openProgress < 0) openProgress = 0
  if (openProgress > 1) openProgress = 1
})

function endDrag() {
  if (!isDragging) return
  isDragging = false

  // seuil : si plus de la moitié -> état "ouvert", sinon "fermé"
  isOpen = openProgress > 0.5
}

canvas.addEventListener("pointerup", endDrag)
canvas.addEventListener("pointerleave", endDrag)


function update(dt) {
  const w = canvas.width
  const h = canvas.height

  // --- FOND ---
  ctx.fillStyle = "black"
  ctx.fillRect(0, 0, w, h)

  // --- SALLE (RECTANGLE BLANC) ---
  const roomWidth = w * 0.1
  const roomHeight = h * 0.4
  const roomX = (w - roomWidth) / 2
  const roomY = (h - roomHeight) / 2

  // Salle blanche
  ctx.fillStyle = "white"
  ctx.fillRect(roomX, roomY, roomWidth, roomHeight)

  // "3" NOIR AU CENTRE
  const fontSize = roomHeight * 0.7
  ctx.fillStyle = "black"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = `${fontSize}px Helvetica, Arial, sans-serif`
  ctx.fillText("3", w / 2, h / 2)

// --- MISE À JOUR OUVERTURE ---
if (!isDragging) {
  const target = isOpen ? 1 : 0

  if (openProgress < target) {
    openProgress += openSpeed * dt
    if (openProgress > target) openProgress = target
  } else if (openProgress > target) {
    openProgress -= openSpeed * dt
    if (openProgress < target) openProgress = target
  }
}


// --- PORTE AVEC PERSPECTIVE VERS L'EXTÉRIEUR ---
const doorWidth = roomWidth
const doorHeight = roomHeight
const doorScaleX = 1 - openProgress

// Effet de perspective : les coins droits s'écartent quand la porte s'ouvre
const perspectiveOffset = openProgress * doorWidth * 0.3

ctx.save()
const doorLeftX = roomX
const doorCenterY = roomY + doorHeight / 2
ctx.translate(doorLeftX, doorCenterY)
ctx.scale(doorScaleX, 1)

// Dessiner la porte avec un quadrilatère
ctx.beginPath()
// Coin supérieur gauche (charnière, reste fixe)
ctx.moveTo(0, -doorHeight / 2)
// Coin supérieur droit (s'écarte vers le haut-droite)
ctx.lineTo(doorWidth + perspectiveOffset, -doorHeight / 2 - perspectiveOffset * 0.5)
// Coin inférieur droit (s'écarte vers le bas-droite)
ctx.lineTo(doorWidth + perspectiveOffset, doorHeight / 2 + perspectiveOffset * 0.5)
// Coin inférieur gauche (charnière, reste fixe)
ctx.lineTo(0, doorHeight / 2)
ctx.closePath()

// Remplissage
ctx.fillStyle = "black"
ctx.fill()

// Bordure
ctx.lineWidth = 4
ctx.strokeStyle = "white"
ctx.stroke()

// Poignée (suit le bord droit qui bouge)
const handleWidth = 16
const handleHeight = doorHeight * 0.35
const handleX = doorWidth + perspectiveOffset - handleWidth - 30
const handleY = -handleHeight / 2
ctx.beginPath()
ctx.roundRect(handleX, handleY, handleWidth, handleHeight, handleWidth / 2)
ctx.lineWidth = 3
ctx.strokeStyle = "white"
ctx.stroke()

ctx.restore()
}

/*
const spring = new Spring({
  position: 0,
  frequency: 2.5,
  halfLife: 0.05
})

function update(dt) {

  if (input.isPressed()) {
    spring.target = 0
  }
  else {
    spring.target = 1
  }

  spring.step(dt)

  const x = canvas.width / 2;
  const y = canvas.height / 2;
  //code pour le scale
  const scale = Math.max(spring.position, 0)

  //c'est le code pour le "style" du chiffre
  ctx.fillStyle = "black"
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = "white"
  ctx.textBaseline = "middle"
  ctx.font = `${canvas.height}px Helvetica Neue, Helvetica , bold`
  ctx.textAlign = "center"
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.fillText("3", 0, 0)

  if (scale <= 0) {
    finish()
  }

}
*/