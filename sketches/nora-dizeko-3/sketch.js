import { createEngine } from "../_shared/engine.js"
import { Spring } from "../_shared/spring.js"

const { renderer, input, math, run, finish, } = createEngine()
const { ctx, canvas } = renderer
run(update)


let introProgress = 0
let introComplete = false
let openProgress = 0
let isOpen = false
let isDragging = false
let dragStartX = 0
let dragStartProgress = 0
let outroProgress = 0
const openSpeed = 4
let canOutro = false
let outroDelay = 0
let finalDropProgress = 0     // 0 = pas encore descendu, 1 = descendu au max
const finalDropSpeed = 3    // vitesse de la descente (tu peux tweaker)


// ---- SONS PORTE ----
const doorOpenSound = new Audio("audio/")
const doorCloseSound = new Audio("sounds/door_close.mp3")

function playDoorSound(isOpening) {
  const s = isOpening ? doorOpenSound : doorCloseSound
  s.currentTime = 0 // repart du début à chaque fois
  s.play().catch(() => {
    // au cas où le navigateur bloque, on ignore l’erreur
  })
}

function getDoorGeometry() {
  const w = canvas.width
  const h = canvas.height

  const outroScale = 1 + outroProgress * 10

  const roomWidth = w * 0.1 * outroScale
  const roomHeight = h * 0.4 * outroScale
  const roomX = (w - roomWidth) / 2
  const roomY = (h - roomHeight) / 2

  const doorWidth = roomWidth / outroScale
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

canvas.addEventListener("pointerdown", (event) => {
  if (!introComplete) return

  const rect = canvas.getBoundingClientRect()
  const xInCanvas = event.clientX - rect.left
  const yInCanvas = event.clientY - rect.top
  const x = xInCanvas * (canvas.width / rect.width)
  const y = yInCanvas * (canvas.height / rect.height)

  // On récupère la géométrie actuelle de la porte
  const { doorLeftX, doorTopY, doorRightX, doorBottomY } = getDoorGeometry()

  // Test : clic dans le rectangle de la porte ?
  const isOnDoor =
    x >= doorLeftX && x <= doorRightX &&
    y >= doorTopY && y <= doorBottomY

  if (!isOnDoor) return // si on clique ailleurs → on ignore

  // Si on arrive ici : on commence le drag
  isDragging = true
  dragStartX = x
  dragStartProgress = openProgress
})

//event.clientX = Position X du pointeur dans la page, en pixels, à partir du bord gauche de la fenêtre.

canvas.addEventListener("pointermove", (event) => {
  if (!isDragging) return
  const rect = canvas.getBoundingClientRect() //limite le dragging dans tout le canva
  const xInCanvas = event.clientX - rect.left
  const x = xInCanvas * (canvas.width / rect.width)
  const dx = x - dragStartX
  const doorWidth = canvas.width * 0.1
  const deltaProgress = - dx / doorWidth
  openProgress = dragStartProgress + deltaProgress
  if (openProgress < 0) openProgress = 0
  if (openProgress > 1) openProgress = 1
})

function endDrag() {
  if (!isDragging) return
  isDragging = false

  const wasOpen = isOpen         // on garde l'ancien état
  isOpen = openProgress > 0.5    // nouveau choix : ouverte ou fermée ?

  // Si l'état a changé → on joue un son
  if (isOpen !== wasOpen) {
    playDoorSound(isOpen)        // true = ouverture, false = fermeture
  }
}

canvas.addEventListener("pointerup", endDrag)
canvas.addEventListener("pointerleave", endDrag)

function update(dt) {
  // --- INTRO ---
  if (!introComplete) {
    introProgress += 0.2 * dt
    if (introProgress > 1) {
      introProgress = 1
      introComplete = true
    }
  }

  // --- OUVERTURE AUTO (quand on ne drag pas) ---
  if (!isDragging && introComplete) {
    const target = isOpen ? 1 : 0
    if (openProgress < target) {
      openProgress += openSpeed * dt
      if (openProgress > target) openProgress = target
    } else if (openProgress > target) {
      openProgress -= openSpeed * dt
      if (openProgress < target) openProgress = target
    }
  }

  // --- OUTRO ---
  if (openProgress >= 1 && introComplete) {
    outroProgress += 0.8 * dt
    if (outroProgress > 1) outroProgress = 1
  }
  
  // --- ANIM FINALE DU "3" APRÈS L'OUTRO ---
  if (outroProgress >= 1 && finalDropProgress < 1) {
    finalDropProgress += finalDropSpeed * dt
    if (finalDropProgress > 1) finalDropProgress = 1
  }


  // --- GÉOMÉTRIE SALLE + PORTE ---
  const {
    w, h,
    roomWidth, roomHeight, roomX, roomY,
    doorWidth, doorHeight,
    doorLeftX, doorTopY,
    doorCenterY,
    outroScale
  } = getDoorGeometry()

  // --- FOND ---
  ctx.fillStyle = "black"
  ctx.fillRect(0, 0, w, h)

  // --- SALLE (RECTANGLE BLANC) ---
  if (introProgress > 0.01) {
    const fillProgress = (introProgress - 0.2) / 0.8
    ctx.globalAlpha = fillProgress
    ctx.fillStyle = "white"
    ctx.fillRect(roomX, roomY, roomWidth, roomHeight)
    ctx.globalAlpha = 1
  }

  // "3" NOIR AU CENTRE (apparaît à la fin de l'intro)
  if (introProgress > 0.2) {
    const textProgress = (introProgress - 0.5) / 0.5
    ctx.globalAlpha = Math.min(Math.max(textProgress, 0), 1)

    const fontSize = roomHeight * 0.7
    ctx.fillStyle = "black"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.font = `${fontSize}px Helvetica, Arial, sans-serif`

    // Décalage vertical pour le finish
    const dropDistance = h * 1.5 // le 3 descend de 30% de la hauteur de l'écran
    const dropOffset = finalDropProgress * dropDistance

    ctx.fillText("3", w / 2, h / 2 + dropOffset)
    ctx.globalAlpha = 1
  }
  // --- PORTE ---
  if (outroProgress < 0.3) {
    const doorOpacity = outroProgress > 0 ? 1 - (outroProgress / 0.3) : 1
    ctx.globalAlpha = doorOpacity

    const doorScaleX = 1 - openProgress
    const perspectiveOffset = openProgress * doorWidth * 0.3

    ctx.save()
    ctx.translate(doorLeftX, doorCenterY)
    ctx.scale(doorScaleX, 1)

    const doorPath = [
      { x: 0, y: -doorHeight / 2 },
      { x: doorWidth + perspectiveOffset, y: -doorHeight / 2 - perspectiveOffset * 0.5 },
      { x: doorWidth + perspectiveOffset, y: doorHeight / 2 + perspectiveOffset * 0.5 },
      { x: 0, y: doorHeight / 2 }
    ]

    // Remplissage noir
    ctx.beginPath()
    ctx.moveTo(doorPath[0].x, doorPath[0].y)
    for (let i = 1; i < doorPath.length; i++) {
      ctx.lineTo(doorPath[i].x, doorPath[i].y)
    }
    ctx.closePath()
    ctx.fillStyle = "black"
    ctx.fill()

    // Stroke blanc progressif
    ctx.lineWidth = 4
    ctx.strokeStyle = "white"
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    let totalLength = 0
    for (let i = 0; i < doorPath.length; i++) {
      const next = (i + 1) % doorPath.length
      const dx = doorPath[next].x - doorPath[i].x
      const dy = doorPath[next].y - doorPath[i].y
      totalLength += Math.sqrt(dx * dx + dy * dy)
    }

    const drawLength = totalLength * Math.min(introProgress / 0.8, 1)

    ctx.beginPath()
    let currentLength = 0
    ctx.moveTo(doorPath[0].x, doorPath[0].y)

    for (let i = 0; i < doorPath.length; i++) {
      const next = (i + 1) % doorPath.length
      const dx = doorPath[next].x - doorPath[i].x
      const dy = doorPath[next].y - doorPath[i].y
      const segmentLength = Math.sqrt(dx * dx + dy * dy)

      if (currentLength + segmentLength <= drawLength) {
        ctx.lineTo(doorPath[next].x, doorPath[next].y)
        currentLength += segmentLength
      } else {
        const remaining = drawLength - currentLength
        const ratio = remaining / segmentLength
        ctx.lineTo(
          doorPath[i].x + dx * ratio,
          doorPath[i].y + dy * ratio
        )
        break
      }
    }
    ctx.stroke()

    // Poignée
    if (introProgress > 0.6) {
      const handleProgress = (introProgress - 0.6) / 0.4
      ctx.globalAlpha = doorOpacity * handleProgress
      const handleWidth = 16
      const handleHeight = doorHeight * 0.35
      const handleX = doorWidth + perspectiveOffset - handleWidth - 30
      const handleY = -handleHeight / 2
      ctx.beginPath()
      ctx.roundRect(handleX, handleY, handleWidth, handleHeight, handleWidth / 2)
      ctx.lineWidth = 3
      ctx.strokeStyle = "white"
      ctx.stroke()
    }

    ctx.restore()
    ctx.globalAlpha = 1


  }
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