import { createEngine } from "../_shared/engine.js"
import { Spring } from "../_shared/spring.js"

const { renderer, input, math, run, finish } = createEngine()
const { ctx, canvas } = renderer

run(update)

// ==========================
//  CONFIG GLOBALE
// ==========================
const WIN_GROW_DURATION = 1.0     // durée du zoom sur la carte gagnante (sec)
const WIN_MAX_SCALE     = 1.8     // zoom max de la carte gagnante

// Outro après victoire
const OUTRO_DELAY_AFTER_WIN = 0.6 // secondes avant que la carte commence à tomber
let outroDelayTimer = 0
let outroStarted    = false
let outroDone       = false

let winningCard       = null
let winAnimTime       = 0
let winAnimationDone  = false

const cardWidth  = 500
const cardHeight = 780

const NB_CARDS   = 4              // 4 cartes
const WIN_VALUE  = 1              // nombre gagnant affiché
const shuffleLerp = 0.18          // vitesse de lerp vers targetX/Y

// ==========================
//  AUDIO
// ==========================
const flipSound = new Audio("audio/card-lose-2.wav")
flipSound.volume = 0.3

const winSound = new Audio("audio/card-win.wav")
winSound.volume = 0.9

function playFlipSound() {
  try {
    flipSound.currentTime = 0
    flipSound.play()
  } catch (e) {
    // policies navigateur
  }
}

function playWinSound() {
  try {
    winSound.currentTime = 0
    winSound.play()
  } catch (e) {
    // policies navigateur
  }
}

// ==========================
//  INTRO
// ==========================
const INTRO_DROP_DELAY     = 250
const INTRO_CARD_DROP_TIME = 700
const INTRO_REVEAL_DELAY   = 300
const INTRO_FACE_TIME      = 900

let introStarted = false

// ==========================
//  DÉFAITE / SHUFFLE
// ==========================
const LOSE_DROP_TIME        = 600
const NEW_CARD_IN_TIME      = 600
const DELAY_BEFORE_SHUFFLE  = 400

// ==========================
//  ÉTAT DU JEU
// ==========================
const cards = []

let canClick      = false     // clics désactivés au début (intro)
let selectedCards = []        // cartes actuellement retournées (max 2 pour la lose)

// nombre de manches perdues
let attemptCount = 0

// ==========================
//  POSITION DE BASE DES CARTES
// ==========================
const baseY   = canvas.height / 2 + 40
const spacing = cardWidth + 40
const startX  = canvas.width / 2 - spacing * (NB_CARDS - 1) / 2

// ==========================
//  INIT CARTES
// ==========================
function createCard(id, x, y) {
  return {
    id,
    x,
    y,
    baseX: x,
    baseY: y,
    targetX: x,
    targetY: y,
    extraAngle: 0,

    spring: new Spring({
      position: 0,    // 0 = dos, 1 = face
      frequency: 2.0,
      halfLife: 0.25
    }),

    displayValue: null // chiffre affiché
  }
}

function initCards() {
  for (let i = 0; i < NB_CARDS; i++) {
    const posX = startX + i * spacing
    const posY = baseY
    cards.push(createCard(i, posX, posY))
  }
}

initCards()

// ==========================
//  RANDOMISATION DES SLOTS
// ==========================
function randomizeRowLayout() {
  const xs = []
  for (let i = 0; i < NB_CARDS; i++) {
    xs.push(startX + i * spacing)
  }

  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
  }

  cards.forEach((card, index) => {
    card.baseX   = xs[index]
    card.targetX = card.baseX
  })
}

// ==========================
//  ASSIGNATION DES VALEURS
// ==========================
function assignRandomValues() {
  const values = [WIN_VALUE, 2, 3, 4]

  // shuffle in-place
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[values[i], values[j]] = [values[j], values[i]]
  }

  cards.forEach((card, i) => {
    card.displayValue    = values[i]
    card.spring.position = 0
    card.spring.target   = 0
  })
}

function getWinningCard() {
  return cards.find(c => c.displayValue === WIN_VALUE) || null
}

// ==========================
//  EASING
// ==========================
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

// ==========================
//  CARTE DÉFORMÉE
// ==========================
function drawBentCard(bendAmount, side, value) {
  const w = cardWidth
  const h = cardHeight

  const x = -w / 2
  const y = -h / 2

  let left   = x
  let right  = x + w
  let top    = y
  let bottom = y + h

  const bend = bendAmount * 20
  top    -= bend
  bottom += bend

  const radius = 60

  ctx.beginPath()
  ctx.moveTo(left + radius, top)
  ctx.lineTo(right - radius, top)
  ctx.quadraticCurveTo(right, top, right, top + radius)
  ctx.lineTo(right, bottom - radius)
  ctx.quadraticCurveTo(right, bottom, right - radius, bottom)
  ctx.lineTo(left + radius, bottom)
  ctx.quadraticCurveTo(left, bottom, left, bottom - radius)
  ctx.lineTo(left, top + radius)
  ctx.quadraticCurveTo(left, top, left + radius, top)
  ctx.closePath()

  ctx.fillStyle = "#ffffffff"
  ctx.fill()

  ctx.lineWidth   = 2
  ctx.strokeStyle = "white"
  ctx.stroke()

  if (side === "front") {
    ctx.fillStyle = "black"
    ctx.font = "bold 250px system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    ctx.scale(-1, 1)
    ctx.fillText(value != null ? value : "?", 0, 0)
  } else {
    const pad = 60
    const innerLeft   = -w / 2 + pad
    const innerRight  =  w / 2 - pad
    const innerTop    = -h / 2 + pad
    const innerBottom =  h / 2 - pad
    const innerRadius = 30

    ctx.beginPath()
    ctx.moveTo(innerLeft + innerRadius, innerTop)
    ctx.lineTo(innerRight - innerRadius, innerTop)
    ctx.quadraticCurveTo(innerRight, innerTop, innerRight, innerTop + innerRadius)
    ctx.lineTo(innerRight, innerBottom - innerRadius)
    ctx.quadraticCurveTo(innerRight, innerBottom, innerRight - innerRadius, innerBottom)
    ctx.lineTo(innerLeft + innerRadius, innerBottom)
    ctx.quadraticCurveTo(innerLeft, innerBottom, innerLeft, innerBottom - innerRadius)
    ctx.lineTo(innerLeft, innerTop + innerRadius)
    ctx.quadraticCurveTo(innerLeft, innerTop, innerLeft + innerRadius, innerTop)

    ctx.strokeStyle = "rgba(45, 45, 45, 0.25)"
    ctx.lineWidth   = 4
    ctx.stroke()
  }
}

// ==========================
//  SHUFFLE
// ==========================
function stackCards(centerX, centerY) {
  cards.forEach((card, i) => {
    card.targetX   = centerX
    card.targetY   = centerY - 60 + i * 30
    card.extraAngle = 0
  })
}

function fanOutCards(centerX, centerY) {
  cards.forEach((card, i) => {
    const offsetIndex = i - (NB_CARDS - 1) / 2
    card.targetX   = centerX + offsetIndex * cardWidth * 0.5
    card.targetY   = centerY - 140
    card.extraAngle = offsetIndex * 0.15
  })
}

function chaosCenter(centerX, centerY) {
  cards.forEach((card, i) => {
    const randAngle = (Math.random() - 0.5) * 0.6
    card.targetX   = centerX + (Math.random() - 0.5) * 80
    card.targetY   = centerY - 80 + i * 20
    card.extraAngle = randAngle
  })
}

function resetToRow() {
  randomizeRowLayout()
  cards.forEach(card => {
    card.targetX   = card.baseX
    card.targetY   = card.baseY
    card.extraAngle = 0
  })
}

function runShuffle(reassignValues) {
  const centerX = canvas.width / 2
  const centerY = canvas.height / 2

  cards.forEach(c => {
    c.spring.target = 0
  })

  setTimeout(() => {
    stackCards(centerX, centerY)
  }, 200)

  setTimeout(() => {
    fanOutCards(centerX, centerY)
  }, 700)

  setTimeout(() => {
    chaosCenter(centerX, centerY)
  }, 1200)

  setTimeout(() => {
    resetToRow()

    setTimeout(() => {
      if (reassignValues) {
        assignRandomValues()
      }
      canClick = true
      selectedCards = []
    }, 500)
  }, 1800)
}

function shuffleLostRound() {
  runShuffle(true)
}

function shuffleIntroRound() {
  runShuffle(false)
}

// ==========================
//  INTRO (LANCÉE DANS UPDATE)
// ==========================
function startIntro() {
  canClick = false

  randomizeRowLayout()

  // cartes au-dessus de l'écran
  cards.forEach(card => {
    card.x        = card.baseX
    card.y        = -cardHeight
    card.targetX  = card.baseX
    card.targetY  = -cardHeight
    card.extraAngle = 0
    card.spring.position = 0
    card.spring.target   = 0
  })

  // descente une par une
  cards.forEach((card, index) => {
    setTimeout(() => {
      card.targetY = card.baseY
    }, index * INTRO_DROP_DELAY)
  })

  const totalDropTime =
    (NB_CARDS - 1) * INTRO_DROP_DELAY + INTRO_CARD_DROP_TIME

  // flip auto de la carte gagnante
  setTimeout(() => {
    const winCard = getWinningCard()
    if (!winCard) {
      canClick = true
      return
    }

    winCard.spring.target = 1

    // elle reste face visible, puis se referme
    setTimeout(() => {
      winCard.spring.target = 0

      // après le flip de fermeture → shuffle d'intro (sans changement de valeurs)
      setTimeout(() => {
        shuffleIntroRound()
      }, 400)
    }, INTRO_FACE_TIME)

  }, totalDropTime + INTRO_REVEAL_DELAY)
}

// Premier setup
assignRandomValues()

// ==========================
//  LOGIQUE WIN / LOSE
// ==========================
function handleWin(card) {
  canClick          = false
  winningCard       = card
  winAnimTime       = 0
  winAnimationDone  = false
  outroDelayTimer   = 0
  outroStarted      = false
  outroDone         = false

  const centerX = canvas.width / 2
  const centerY = canvas.height / 2

  cards.forEach((c) => {
    if (c === card) {
      c.targetX    = centerX
      c.targetY    = centerY
      c.extraAngle = 0
    } else {
      c.spring.target = 0
      c.targetX       = c.x
      c.targetY       = canvas.height + cardHeight
      c.extraAngle    = 0
    }
  })
}

function handleLose(lostCards) {
  // on compte cette manche comme une tentative ratée
  attemptCount++

  const dropTargetY = canvas.height + cardHeight

  lostCards.forEach((card) => {
    card.targetX = card.x
    card.targetY = dropTargetY
  })

  setTimeout(() => {
    lostCards.forEach((card) => {
      card.x        = card.baseX
      card.y        = -cardHeight
      card.targetX  = card.baseX
      card.targetY  = card.baseY
      card.extraAngle = 0
      card.spring.position = 0
      card.spring.target   = 0
    })

    setTimeout(() => {
      shuffleLostRound()
    }, NEW_CARD_IN_TIME + DELAY_BEFORE_SHUFFLE)

  }, LOSE_DROP_TIME)
}

// ==========================
//  HANDLE CLICK
// ==========================
function handleCardClick(card) {
  if (!canClick) return
  if (selectedCards.includes(card)) return

  // valeur logique gagnante
  let isWinCard = (card.displayValue === WIN_VALUE)

  // 🎯 TRICHE : si on a déjà perdu 1 manche (attemptCount === 1),
  // alors la première carte du nouveau tour devient FORCÉMENT gagnante
  if (attemptCount === 1 && selectedCards.length === 0) {
    card.displayValue = WIN_VALUE
    isWinCard = true
  }

  // Son selon carte (après éventuelle triche)
  if (isWinCard) {
    playWinSound()
  } else {
    playFlipSound()
  }

  // on la retourne
  card.spring.target = 1
  selectedCards.push(card)
  canClick = false  // on bloque le temps de l'anim

  setTimeout(() => {
    if (isWinCard) {
      // 🎯 Win immédiate
      handleWin(card)
      selectedCards = []
      return
    }

    // Carte perdante
    if (selectedCards.length >= 2) {
      // 2 mauvaises → lose de la paire
      const pair = [...selectedCards]
      handleLose(pair)
      selectedCards = []
    } else {
      // 1 seule mauvaise → on laisse le joueur cliquer une autre carte
      canClick = true
    }
  }, 900) // durée approx du flip
}

// ==========================
//  INPUT SOURIS
// ==========================
function getMousePosOnCanvas(event) {
  const rect   = canvas.getBoundingClientRect()
  const scaleX = canvas.width  / rect.width
  const scaleY = canvas.height / rect.height

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top)  * scaleY
  }
}

function getCardAtPosition(x, y) {
  for (const card of cards) {
    const left   = card.x - cardWidth  / 2
    const right  = card.x + cardWidth  / 2
    const top    = card.y - cardHeight / 2
    const bottom = card.y + cardHeight / 2

    if (x >= left && x <= right && y >= top && y <= bottom) {
      return card
    }
  }
  return null
}

canvas.addEventListener("click", (event) => {
  const { x, y } = getMousePosOnCanvas(event)
  const card = getCardAtPosition(x, y)
  if (card) {
    handleCardClick(card)
  }
})

// ==========================
//  DESSIN D’UNE CARTE
// ==========================
function drawAnimatedCard(card, dt) {
  card.spring.step(dt)

  let t = card.spring.position
  t = Math.max(0, Math.min(1, t))

  const flipAngle = t * Math.PI
  const scaleX    = Math.cos(flipAngle)
  const tilt      = 0.25 * Math.sin(flipAngle)

  const bendProgress = Math.sin(flipAngle)
  const bend         = easeOutCubic(Math.max(0, bendProgress))

  const side = t < 0.5 ? "back" : "front"

  ctx.save()
  ctx.translate(card.x, card.y)
  ctx.rotate(tilt + card.extraAngle)

  const sx  = Math.abs(scaleX)
  const dir = scaleX < 0 ? -1 : 1

  let extraScale = 1
  if (card === winningCard) {
    const tWin    = Math.min(winAnimTime / WIN_GROW_DURATION, 1)
    const easedWin = easeOutCubic(tWin)
    extraScale    = 1 + (WIN_MAX_SCALE - 1) * easedWin
  }

  ctx.scale(dir * sx * extraScale, extraScale)
  drawBentCard(bend, side, card.displayValue)
  ctx.restore()
}

// ==========================
//  BOUCLE UPDATE
// ==========================
function update(dt) {
  if (!introStarted) {
    introStarted = true
    startIntro()
  }

  if (winningCard && !winAnimationDone) {
    winAnimTime += dt
    if (winAnimTime >= WIN_GROW_DURATION) {
      winAnimTime      = WIN_GROW_DURATION
      winAnimationDone = true
    }
  }

  if (winningCard && winAnimationDone && !outroStarted) {
    outroDelayTimer += dt
    if (outroDelayTimer >= OUTRO_DELAY_AFTER_WIN) {
      outroStarted        = true
      winningCard.targetY = canvas.height + cardHeight * 3
    }
  }

  if (outroStarted && !outroDone && winningCard) {
    if (winningCard.y - cardHeight / 2 > canvas.height) {
      outroDone = true
      finish()
    }
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = "black"
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (const card of cards) {
    card.x += (card.targetX - card.x) * shuffleLerp
    card.y += (card.targetY - card.y) * shuffleLerp

    drawAnimatedCard(card, dt)
  }
}
