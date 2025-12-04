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

let winningCard = null
let winAnimTime = 0
let winAnimationDone = false

const cardWidth  = 500
const cardHeight = 780

const NB_CARDS = 4              // ⇦ 4 cartes maintenant
const WIN_VALUE = 1             // valeur gagnante
const shuffleLerp = 0.18        // vitesse de lerp vers targetX/Y

// ==========================
//  INTRO
// ==========================
const INTRO_DROP_DELAY = 250      // ms entre chaque carte qui commence à tomber
const INTRO_CARD_DROP_TIME = 700  // ms pour qu'une carte ait le temps d'atteindre sa place
const INTRO_REVEAL_DELAY = 300    // ms après la fin des drops avant de retourner la carte 1
const INTRO_FACE_TIME = 900       // ms pendant lesquels la carte 1 reste face visible
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
  // On attend quelques frames avant de déclencher l'animation
  setTimeout(() => {
    startIntro()
  }, 2000)
}

// ==========================
//  INTRO
// ==========================
function startIntro() {
  canClick = false

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

  const left   = x
  const right  = x + w
  const top    = y
  const bottom = y + h

  const bend = bendAmount * 20

  const topCtrlY    = top - bend
  const bottomCtrlY = bottom + bend
  const leftCtrlX   = left - bend * 0.4
  const rightCtrlX  = right + bend * 0.4

  ctx.beginPath()

  // bord haut
  ctx.moveTo(left, top)
  ctx.quadraticCurveTo(
    (left + right) / 2, topCtrlY,
    right, top
  )

  // bord droit
  ctx.quadraticCurveTo(
    rightCtrlX, (top + bottom) / 2,
    right, bottom
  )

  // bord bas
  ctx.quadraticCurveTo(
    (left + right) / 2, bottomCtrlY,
    left, bottom
  )

  // bord gauche
  ctx.quadraticCurveTo(
    leftCtrlX, (top + bottom) / 2,
    left, top
  )

  ctx.closePath()

 let fillColor

if (side === "front") {
  fillColor = "#ffffffff"   // face avant : gris clair uniforme
} else {
  fillColor = "#ffffffff"   // face arrière : gris uniforme
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
    ctx.strokeStyle = "rgba(45, 45, 45, 0.25)"
    ctx.lineWidth = 4
    const pad = 60
    ctx.strokeRect(-w / 2 + pad, -h / 2 + pad, w - pad * 2, h - pad * 2)
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
    const offsetIndex = i - (NB_CARDS - 1) / 2   // ex: 0→-1.5, 1→-0.5, 2→0.5, 3→1.5
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
  if (totalAttempts !== 0) return  // seulement pour la toute première manche

  const hasWinInPair = selectedCards.some(c => c.value === WIN_VALUE)
  if (!hasWinInPair) return

  // On prend la carte gagnante dans la paire...
  const winCardInPair = selectedCards.find(c => c.value === WIN_VALUE)
  // ...et une carte non gagnante en dehors de la paire
  const other = cards.find(c => !selectedCards.includes(c) && c.value !== WIN_VALUE)

  if (!winCardInPair || !other) return

  // On échange leurs valeurs -> la paire ne contient plus la carte gagnante
  const tmp = winCardInPair.value
  winCardInPair.value = other.value
  other.value = tmp
}


function handleWin(card) {
  canClick = false
  winningCard = card
  winAnimTime = 0
  winAnimationDone = false

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
  const dropTargetY = canvas.height + cardHeight // en-dessous de l'écran

  // Étape 1 : toutes les cartes perdues tombent
  lostCards.forEach((card) => {
    card.targetX = card.x
    card.targetY = dropTargetY
  })

  setTimeout(() => {
    // Étape 2 : respawn au-dessus, puis redescente à leur base
    lostCards.forEach((card) => {
      card.x = card.baseX
      card.y = -cardHeight
      card.targetX = card.baseX
      card.targetY = card.baseY
      card.extraAngle = 0

      card.spring.position = 0
      card.spring.target = 0
    })

    // Étape 3 : une fois qu'elles ont eu le temps de redescendre, on shuffle
    setTimeout(() => {
      shuffleLostRound()
    }, NEW_CARD_IN_TIME + DELAY_BEFORE_SHUFFLE)

  }, LOSE_DROP_TIME)
}

function handleCardClick(card) {
  if (!canClick) return
  if (selectedCards.includes(card)) return  // pas 2x la même

  // On flip la carte cliquée
  card.spring.target = 1
  selectedCards.push(card)

  // Si c'est la 1ère carte de la paire → on attend la 2e
  if (selectedCards.length < 2) {
    return
  }

  // On a maintenant UNE PAIRE → on résout le tour
  // On force la première manche à être perdante si besoin
  if (totalAttempts === 0) {
    enforceFirstRoundLose()
  }

  canClick = false
  totalAttempts++

  const isWin = selectedCards.some(c => c.value === WIN_VALUE)
  const pair = [...selectedCards]   // copie, pour l'utiliser dans le setTimeout

  setTimeout(() => {
    if (isWin) {
      // On récupère la carte gagnante dans la paire
      const winCard = pair.find(c => c.value === WIN_VALUE) || pair[0]
      handleWin(winCard)
    } else {
      // Les deux cartes retournées sont perdues et doivent tomber
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
  if(!introstarted){
    startIntro();
    introstarted=true;
  }
  // anim de victoire (zoom carte gagnante)
  if (winningCard && !winAnimationDone) {
    winAnimTime += dt
    if (winAnimTime >= WIN_GROW_DURATION) {
      winAnimTime = WIN_GROW_DURATION
      winAnimationDone = true
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
