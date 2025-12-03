import { createEngine } from "../_shared/engine.js"
import { Spring } from "../_shared/spring.js"

const { renderer, input, math, run, finish, } = createEngine()
const { ctx, canvas } = renderer
run(update)

// =====================
// ÉTAT GLOBAL ANIM
// =====================
let introProgress = 0
let introComplete = false

let openProgress = 0
let isOpen = false
let isDragging = false
let dragStartX = 0
let dragStartProgress = 0

let outroProgress = 0
let canOutro = false      // pas utilisé ici, mais conservé au cas où ailleurs
let outroDelay = 0        // idem

const openSpeed = 4

// ANIM FINALE DU "3"
let finalDropProgress = 0     // 0 = pas encore descendu, 1 = descendu au max
const finalDropSpeed = 1      // vitesse de la descente

// RECTANGLE NOIR FINAL
let blackRectProgress = 0

// =====================
// SONS PORTE
// =====================
const doorOpenSound = new Audio("audio/")
const doorCloseSound = new Audio("sounds/door_close.mp3")

function playDoorSound(isOpening) {
  const s = isOpening ? doorOpenSound : doorCloseSound
  s.currentTime = 0
  s.play().catch(() => {
    // si le navigateur bloque la lecture auto, on ignore
  })
}

// =====================
// GÉOMÉTRIE
// =====================
function getDoorGeometry() {
  const w = canvas.width
  const h = canvas.height

  // scale de la salle pendant l'outro
  const outroScale = 1 + outroProgress * 10

  const roomWidth = w * 0.2 * outroScale // change 0.1 for the width
  const roomHeight = h * 0.6 * outroScale //change 0.4 for the height
  const roomX = (w - roomWidth) / 2
  const roomY = (h - roomHeight) / 2

  // La porte garde des proportions constantes
  const doorWidth = roomWidth / outroScale      // => w * 0.1
  const doorHeight = roomHeight / outroScale
  const doorLeftX = roomX
  const doorTopY = roomY
  const doorRightX = doorLeftX + doorWidth
  const doorBottomY = doorTopY + doorHeight
  const doorCenterY = roomY + doorHeight / 2

  return {
    w, h,
    roomWidth, roomHeight, roomX, roomY,
    doorWidth, doorHeight,
    doorLeftX, doorTopY, doorRightX, doorBottomY,
    doorCenterY,
    outroScale
  }
}

// =====================
// HELPERS INTERACTION
// =====================

function getCanvasCoordinates(event) {
  const rect = canvas.getBoundingClientRect()
  const xInCanvas = event.clientX - rect.left
  const yInCanvas = event.clientY - rect.top

  const x = xInCanvas * (canvas.width / rect.width)
  const y = yInCanvas * (canvas.height / rect.height)

  return { x, y }
}

function isPointOnDoor(x, y) {
  const { doorLeftX, doorTopY, doorRightX, doorBottomY } = getDoorGeometry()
  return (
    x >= doorLeftX && x <= doorRightX &&
    y >= doorTopY && y <= doorBottomY
  )
}

// =====================
// EVENTS POINTER
// =====================

canvas.addEventListener("pointerdown", (event) => {
  if (!introComplete) return

  const { x, y } = getCanvasCoordinates(event)
  if (!isPointOnDoor(x, y)) return

  // Début du drag
  isDragging = true
  dragStartX = x
  dragStartProgress = openProgress
})

canvas.addEventListener("pointermove", (event) => {
  if (!isDragging) return

  const { x } = getCanvasCoordinates(event)
  const dx = x - dragStartX

  // On conserve la même logique : 10% de la largeur du canvas
  const { doorWidth } = getDoorGeometry()
  const deltaProgress = -dx / doorWidth

  openProgress = dragStartProgress + deltaProgress
  if (openProgress < 0) openProgress = 0
  if (openProgress > 1) openProgress = 1
})

function endDrag() {
  if (!isDragging) return

  isDragging = false

  const wasOpen = isOpen
  // Seuil de décision : > 0.5 = ouvert
  isOpen = openProgress > 0.5

  // Si changement d'état → son
  if (isOpen !== wasOpen) {
    playDoorSound(isOpen)
  }
}

canvas.addEventListener("pointerup", endDrag)
canvas.addEventListener("pointerleave", endDrag)

// =====================
// UPDATE LOGIQUE
// =====================

function updateIntro(dt) {
  if (introComplete) return

  introProgress += 0.2 * dt
  if (introProgress > 1) {
    introProgress = 1
    introComplete = true
  }
}

function updateDoorAuto(dt) {
  if (isDragging || !introComplete) return

  const target = isOpen ? 1 : 0

  if (openProgress < target) {
    openProgress += openSpeed * dt
    if (openProgress > target) openProgress = target
  } else if (openProgress > target) {
    openProgress -= openSpeed * dt
    if (openProgress < target) openProgress = target
  }
}

function updateOutroAndFinal(dt) {
  // OUTRO (quand la porte est complètement ouverte)
  if (openProgress >= 1 && introComplete) {
    outroProgress += 0.8 * dt
    if (outroProgress > 1) outroProgress = 1
  }

  // ANIM FINALE DU "3"
  if (outroProgress >= 1 && finalDropProgress < 1) {
    finalDropProgress += finalDropSpeed * dt
    if (finalDropProgress > 1) finalDropProgress = 1
  }

  // RECTANGLE NOIR FINAL
  if (finalDropProgress >= 1 && blackRectProgress < 1) {
    blackRectProgress += finalDropSpeed * dt
    if (blackRectProgress > 1) {
      blackRectProgress = 1
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

function drawRoom(geom) {
  const { roomX, roomY, roomWidth, roomHeight } = geom

  // Salle (rectangle blanc) qui fade in avec l'intro
  if (introProgress <= 0.01) return

  const fillProgress = (introProgress - 0.2) / 0.8
  ctx.globalAlpha = fillProgress
  ctx.fillStyle = "white"
  ctx.fillRect(roomX, roomY, roomWidth, roomHeight)
  ctx.globalAlpha = 1
}

function drawFinalNumberThree(geom) {
  const { h, w, roomHeight } = geom

  // "3" noir au centre (apparaît à la fin de l'intro)
  if (introProgress <= 0.2) return

  const textProgress = (introProgress - 0.5) / 0.5
  ctx.globalAlpha = Math.min(Math.max(textProgress, 0), 1)

  const fontSize = roomHeight * 0.7
  ctx.fillStyle = "black"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = `${fontSize}px Helvetica, Arial, sans-serif`

  // Décalage vertical pour la descente finale
  const dropDistance = h * 1.5
  const dropOffset = finalDropProgress * dropDistance

  ctx.fillText("3", w / 2, h / 2 + dropOffset)
  ctx.globalAlpha = 1
}

function drawBlackClosingRect(geom) {
  const { w, h } = geom
  if (blackRectProgress <= 0) return

  ctx.fillStyle = "black"
  const rectDropDistance = h * 1
  const rectY = -h + (blackRectProgress * rectDropDistance)
  ctx.fillRect(0, rectY, w, h)
}

function computeDoorPath(doorWidth, doorHeight, perspectiveOffset) {
  return [
    { x: 0, y: -doorHeight / 2 },
    {
      x: doorWidth + perspectiveOffset,
      y: -doorHeight / 2 - perspectiveOffset * 0.5
    },
    {
      x: doorWidth + perspectiveOffset,
      y: doorHeight / 2 + perspectiveOffset * 0.5
    },
    { x: 0, y: doorHeight / 2 }
  ]
}

function getPathPerimeter(path) {
  let totalLength = 0
  for (let i = 0; i < path.length; i++) {
    const next = (i + 1) % path.length
    const dx = path[next].x - path[i].x
    const dy = path[next].y - path[i].y
    totalLength += Math.sqrt(dx * dx + dy * dy)
  }
  return totalLength
}

function strokePathProgressive(path, t) {
  // t ∈ [0, 1] = % de la longueur totale à dessiner
  t = Math.max(0, Math.min(1, t))

  ctx.lineWidth = 4
  ctx.strokeStyle = "white"
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  const totalLength = getPathPerimeter(path)
  const drawLength = totalLength * t

  ctx.beginPath()
  let currentLength = 0
  ctx.moveTo(path[0].x, path[0].y)

  for (let i = 0; i < path.length; i++) {
    const next = (i + 1) % path.length
    const dx = path[next].x - path[i].x
    const dy = path[next].y - path[i].y
    const segmentLength = Math.sqrt(dx * dx + dy * dy)

    if (currentLength + segmentLength <= drawLength) {
      ctx.lineTo(path[next].x, path[next].y)
      currentLength += segmentLength
    } else {
      const remaining = drawLength - currentLength
      const ratio = remaining / segmentLength
      ctx.lineTo(
        path[i].x + dx * ratio,
        path[i].y + dy * ratio
      )
      break
    }
  }

  ctx.stroke()
}


function drawDoor(geom) {
  const { doorWidth, doorHeight, doorLeftX, doorCenterY } = geom

  if (outroProgress >= 0.3) return

  const doorOpacity = outroProgress > 0
    ? 1 - (outroProgress / 0.3)
    : 1

  ctx.globalAlpha = doorOpacity

  const doorScaleX = 1 - openProgress
  const perspectiveOffset = openProgress * doorWidth * 0.3

  ctx.save()
  ctx.translate(doorLeftX, doorCenterY)
  ctx.scale(doorScaleX, 1)

  const doorPath = computeDoorPath(doorWidth, doorHeight, perspectiveOffset)

  // Remplissage noir
  ctx.beginPath()
  ctx.moveTo(doorPath[0].x, doorPath[0].y)
  for (let i = 1; i < doorPath.length; i++) {
    ctx.lineTo(doorPath[i].x, doorPath[i].y)
  }
  ctx.closePath()
  ctx.fillStyle = "black"
  ctx.fill()

  // Stroke blanc qui se dessine avec l'intro
  const tDoor = Math.min(introProgress / 0.8, 1)
  strokePathProgressive(doorPath, tDoor)

  // Poignée
// Poignée dessinée en tracé progressif
if (introProgress > 0.6) {
  // Progression locale de la poignée (0 → 1 entre 0.6 et 1.0)
  const handleProgress = Math.min(introProgress / 0.8, 1)


  const handleWidth = 16
  const handleHeight = doorHeight * 0.35
  const handleX = doorWidth + perspectiveOffset - handleWidth - 30
  const handleY = -handleHeight / 2

  // On crée un path rectangle simple (tu peux complexifier ensuite)
  const handlePath = [
    { x: handleX,                 y: handleY },
    { x: handleX + handleWidth,   y: handleY },
    { x: handleX + handleWidth,   y: handleY + handleHeight },
    { x: handleX,                 y: handleY + handleHeight }
  ]

  ctx.globalAlpha = doorOpacity
  strokePathProgressive(handlePath, handleProgress)
}


  ctx.restore()
  ctx.globalAlpha = 1
}

function drawScene() {
  const geom = getDoorGeometry()
  const { w, h } = geom

  drawBackground(w, h)
  drawRoom(geom)
  drawFinalNumberThree(geom)
  drawBlackClosingRect(geom)
  drawDoor(geom)
}

// =====================
// BOUCLE PRINCIPALE
// =====================

function update(dt) {
  // logique
  updateIntro(dt)
  updateDoorAuto(dt)
  updateOutroAndFinal(dt)

  // rendu
  drawScene()

  // Appelle finish() quand l'écran est complètement noir
  if (blackRectProgress >= 1) {
    finish()
  }
}

