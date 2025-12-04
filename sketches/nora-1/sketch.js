import { createEngine } from "../_shared/engine.js"
import { Spring } from "../_shared/spring.js"

const { renderer, input, math, run, finish } = createEngine()
const { ctx, canvas } = renderer

run(update)

// ==========================
//  CONFIG GLOBALE
// ==========================
const WIN_GROW_DURATION = 1.0   // en secondes
const WIN_MAX_SCALE = 1.8       // facteur de zoom max de la carte gagnante

// Outro après victoire
const OUTRO_DELAY_AFTER_WIN = 0.6  // secondes avant que la carte commence à tomber
let outroDelayTimer = 0
let outroStarted = false
let outroDone = false

let winningCard = null
let winAnimTime = 0
let winAnimationDone = false

const cardWidth  = 500
const cardHeight = 780

const NB_CARDS = 4              // ⇦ 4 cartes maintenant
const WIN_VALUE = 1             // valeur gagnante
const shuffleLerp = 0.18        // vitesse de lerp vers targetX/Y

// ==========================
//  AUDIO
// ==========================
const flipSound = new Audio("audio/card.mp3") // ⇦ adapte le chemin si besoin
flipSound.volume = 0.6 // optionnel, ajuste le volume (0.0 à 1.0)

function playFlipSound() {
  try {
    flipSound.currentTime = 0
    flipSound.play()
  } catch (e) {
    // policies navigateur, on ignore l'erreur
  }
}

// ==========================
//  INTRO
// ==========================
const INTRO_DROP_DELAY = 250      // ms entre chaque carte qui commence à tomber
const INTRO_CARD_DROP_TIME = 700  // ms pour qu'une carte ait le temps d'atteindre sa place
const INTRO_REVEAL_DELAY = 300    // ms après la fin des drops avant de retourner la carte gagnante
const INTRO_FACE_TIME = 900       // ms pendant lesquels la carte gagnante reste face visible
let introstarted = false

// ==========================
//  DÉFAITE / SHUFFLE
// ==========================
const LOSE_DROP_TIME = 600         // ms : temps de chute de la carte perdante
const NEW_CARD_IN_TIME = 600       // ms : temps pour la nouvelle carte qui descend
const DELAY_BEFORE_SHUFFLE = 400   // ms : pause avant le shuffle

// ==========================
//  ÉTAT DU JEU
// ==========================
const cards = []
let totalAttempts = 0          // nombre de manches (2 cartes = 1 manche)
let canClick = false           // clics OFF au début (intro)
let selectedCards = []         // cartes actuellement retournées (max 2)

// ==========================
//  POSITION DE BASE DES CARTES
// ==========================
const baseY   = canvas.height / 2 + 40
const spacing = cardWidth + 40
// rangée centrée quel que soit NB_CARDS
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

    value: null       // assigné ensuite
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
//
// On garde les mêmes positions horizontales (slots),
// mais on les assigne aux cartes dans un ordre aléatoire.
//
function randomizeRowLayout() {
  // 1) on construit la liste des slots X possibles
  const xs = []
  for (let i = 0; i < NB_CARDS; i++) {
    xs.push(startX + i * spacing)
  }

  // 2) on shuffle les slots
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
  }

  // 3) on assigne ces slots aux cartes
  cards.forEach((card, index) => {
    card.baseX = xs[index]
    card.targetX = card.baseX
  })
}

// ==========================
//  ASSIGNATION DES VALEURS
// ==========================
function assignRandomValues() {
  // une seule carte gagnante, trois perdantes
  const values = [WIN_VALUE, 2, 3, 4]    // ⇦ 4 valeurs

  // shuffle in-place (Fisher-Yates)
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[values[i], values[j]] = [values[j], values[i]]
  }

  cards.forEach((card, i) => {
    card.value = values[i]
    card.spring.position = 0
    card.spring.target = 0
  })
}

function getWinningCard() {
  return cards.find(c => c.value === WIN_VALUE) || null
}

// ==========================
//  INIT / RESET DU JEU
// ==========================
let gameInitialized = false
let frameCount = 0

function resetGame() {
  // Reset des variables globales
  winningCard = null
  winAnimTime = 0
  winAnimationDone = false
  totalAttempts = 0
  canClick = false
  selectedCards = []
  outroDelayTimer = 0
  outroStarted = false
  outroDone = false
  
  // on remet une nouvelle disposition de rangée
  randomizeRowLayout()

  // Réinitialisation des cartes
  cards.forEach(card => {
    card.x = card.baseX
    card.y = -cardHeight
    card.targetX = card.baseX
    card.targetY = -cardHeight
    card.extraAngle = 0
    card.spring.position = 0
    card.spring.target = 0
  })
  
  assignRandomValues()
}

function startIntroDelayed() {
  setTimeout(() => {
    startIntro()
  }, 2000)
}

// ==========================
//  INTRO
// ==========================
function startIntro() {
  canClick = false

  // 👉 on randomise déjà la disposition de la rangée pour l’intro
  randomizeRowLayout()

  // 1) cartes au-dessus de l'écran
  cards.forEach((card) => {
    card.x = card.baseX
    card.y = -cardHeight
    card.targetX = card.baseX
    card.targetY = -cardHeight
    card.extraAngle = 0
    card.spring.position = 0
    card.spring.target = 0
  })

  // 2) descente une par une
  cards.forEach((card, index) => {
    setTimeout(() => {
      card.targetY = card.baseY
    }, index * INTRO_DROP_DELAY)
  })

  // 3) calcul du temps total de drop
  const totalDropTime =
    (NB_CARDS - 1) * INTRO_DROP_DELAY + INTRO_CARD_DROP_TIME

  // 4) flip auto de la carte gagnante
  setTimeout(() => {
    const winCard = getWinningCard()
    if (!winCard) {
      canClick = true
      return
    }

    winCard.spring.target = 1

    // 5) elle reste face visible, puis se referme
    setTimeout(() => {
      winCard.spring.target = 0

      // 6) après le flip de fermeture → shuffle d'intro (sans changement de valeurs)
      setTimeout(() => {
        shuffleIntroRound()
      }, 400)
    }, INTRO_FACE_TIME)

  }, totalDropTime + INTRO_REVEAL_DELAY)
}

// premier setup
assignRandomValues()

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

  // bend vertical (haut creusé / bas bombé)
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

  let fillColor
  if (side === "front") {
    fillColor = "#ffffffff"
  } else {
    fillColor = "#ffffffff"
  }

  ctx.fillStyle = fillColor
  ctx.fill()

  ctx.lineWidth = 2
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
    ctx.lineWidth = 4
    ctx.stroke()
  }
}

// ==========================
//  SHUFFLE
// ==========================
function stackCards(centerX, centerY) {
  cards.forEach((card, i) => {
    card.targetX = centerX
    card.targetY = centerY - 60 + i * 30
    card.extraAngle = 0
  })
}

function fanOutCards(centerX, centerY) {
  cards.forEach((card, i) => {
    const offsetIndex = i - (NB_CARDS - 1) / 2
    card.targetX = centerX + offsetIndex * cardWidth * 0.5
    card.targetY = centerY - 140
    card.extraAngle = offsetIndex * 0.15
  })
}

function chaosCenter(centerX, centerY) {
  cards.forEach((card, i) => {
    const randAngle = (Math.random() - 0.5) * 0.6
    card.targetX = centerX + (Math.random() - 0.5) * 80
    card.targetY = centerY - 80 + i * 20
    card.extraAngle = randAngle
  })
}

function resetToRow() {
  // 👉 on randomise la disposition finale de la rangée
  randomizeRowLayout()

  cards.forEach(card => {
    card.targetX = card.baseX
    card.targetY = card.baseY
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
//  LOGIQUE DU CLIC
// ==========================
function enforceFirstRoundLose() {
  if (totalAttempts !== 0) return

  const hasWinInPair = selectedCards.some(c => c.value === WIN_VALUE)
  if (!hasWinInPair) return

  const winCardInPair = selectedCards.find(c => c.value === WIN_VALUE)
  const other = cards.find(c => !selectedCards.includes(c) && c.value !== WIN_VALUE)

  if (!winCardInPair || !other) return

  const tmp = winCardInPair.value
  winCardInPair.value = other.value
  other.value = tmp
}

function handleWin(card) {
  canClick = false
  winningCard = card
  winAnimTime = 0
  winAnimationDone = false
  outroDelayTimer = 0
  outroStarted = false
  outroDone = false

  const centerX = canvas.width / 2
  const centerY = canvas.height / 2

  cards.forEach((c) => {
    if (c === card) {
      c.targetX = centerX
      c.targetY = centerY
      c.extraAngle = 0
    } else {
      c.spring.target = 0
      c.targetX = c.x
      c.targetY = canvas.height + cardHeight
      c.extraAngle = 0
    }
  })
}

function handleLose(lostCards) {
  const dropTargetY = canvas.height + cardHeight

  lostCards.forEach((card) => {
    card.targetX = card.x
    card.targetY = dropTargetY
  })

  setTimeout(() => {
    lostCards.forEach((card) => {
      card.x = card.baseX
      card.y = -cardHeight
      card.targetX = card.baseX
      card.targetY = card.baseY
      card.extraAngle = 0

      card.spring.position = 0
      card.spring.target = 0
    })

    setTimeout(() => {
      shuffleLostRound()
    }, NEW_CARD_IN_TIME + DELAY_BEFORE_SHUFFLE)

  }, LOSE_DROP_TIME)
}

function handleCardClick(card) {
  if (!canClick) return
  if (selectedCards.includes(card)) return

  playFlipSound()

  card.spring.target = 1
  selectedCards.push(card)

  if (selectedCards.length < 2) {
    return
  }

  if (totalAttempts === 0) {
    enforceFirstRoundLose()
  }

  canClick = false
  totalAttempts++

  const isWin = selectedCards.some(c => c.value === WIN_VALUE)
  const pair = [...selectedCards]

  setTimeout(() => {
    if (isWin) {
      const winCard = pair.find(c => c.value === WIN_VALUE) || pair[0]
      handleWin(winCard)
    } else {
      handleLose(pair)
    }

    selectedCards = []
  }, 900)
}

// ==========================
//  INPUT SOURIS
// ==========================
function getMousePosOnCanvas(event) {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
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
  if (t < 0) t = 0
  if (t > 1) t = 1

  const flipAngle = t * Math.PI
  const scaleX = Math.cos(flipAngle)
  const tilt = 0.25 * Math.sin(flipAngle)

  const bendProgress = Math.sin(flipAngle)
  const bend = easeOutCubic(Math.max(0, bendProgress))

  const side = t < 0.5 ? "back" : "front"

  ctx.save()
  ctx.translate(card.x, card.y)
  ctx.rotate(tilt + card.extraAngle)

  const sx = Math.abs(scaleX)
  const dir = scaleX < 0 ? -1 : 1

  let extraScale = 1
  if (card === winningCard) {
    const tWin = Math.min(winAnimTime / WIN_GROW_DURATION, 1)
    const easedWin = easeOutCubic(tWin)
    extraScale = 1 + (WIN_MAX_SCALE - 1) * easedWin
  }

  ctx.scale(dir * sx * extraScale, extraScale)
  drawBentCard(bend, side, card.value)
  ctx.restore()
}

// ==========================
//  BOUCLE UPDATE
// ==========================
function update(dt) {
  if (!introstarted) {
    startIntro()
    introstarted = true
  }

  if (winningCard && !winAnimationDone) {
    winAnimTime += dt
    if (winAnimTime >= WIN_GROW_DURATION) {
      winAnimTime = WIN_GROW_DURATION
      winAnimationDone = true
    }
  }

  if (winningCard && winAnimationDone && !outroStarted) {
    outroDelayTimer += dt
    if (outroDelayTimer >= OUTRO_DELAY_AFTER_WIN) {
      outroStarted = true
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
