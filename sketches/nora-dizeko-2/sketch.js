import { createEngine } from "../_shared/engine.js"
import { Spring } from "../_shared/spring.js"

const { renderer, input, math, run, finish } = createEngine()
const { ctx, canvas } = renderer
run(update);

// ---------------------------
//   PARAMS GLOBAUX
// ---------------------------
const dragPower = 1.0;
const maxBlur = 100;

let blurAmount = maxBlur;
let puzzleSolved = false;
// --- INTRO FOND NOIR ---
let introProgress = 0;      // 0 = full noir, 1 = noir disparu
const outroDuration = 2;   // durée totale de l’outro en secondes
let outroDone = false;
const introDuration = 2;  // durée de l'intro en secondes (tu peux tweaker)
let introDone = false;

// --- OUTRO ---
let outroTime = 0;
let isOutroPlaying = false;
let hasFinishCalled = false;

// ---------------------------
//   HELPERS ANGLES / MATHS
// ---------------------------
function degToRad(d) {
  return d * Math.PI / 180;
}

function shortestAngleDiff(a, b) {
  let diff = (a - b) % (2 * Math.PI);
  if (diff >  Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  return diff;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

const totalSpanDeg = 170;
const halfSpanRad = degToRad(totalSpanDeg / 2);
const centerSmall = degToRad(0);
const centerBig   = centerSmall + Math.PI;

// ---------------------------
//   KNOBS
// ---------------------------
let knobSmall = {
  angle: centerSmall - halfSpanRad,       // départ au bord
  dragging: false,
  lastMouseAngle: 0,
  radius: canvas.height * 0.30,

  minAngle: centerSmall - halfSpanRad,
  maxAngle: centerSmall + halfSpanRad,

  centerAngle: centerSmall,
  range: halfSpanRad,
  targetAngle: centerSmall              // sera randomisé après
};

let knobBig = {
  angle: centerBig + halfSpanRad,        // départ au bord
  dragging: false,
  lastMouseAngle: 0,
  radius: canvas.height * 0.35,

  minAngle: centerBig - halfSpanRad,
  maxAngle: centerBig + halfSpanRad,

  centerAngle: centerBig,
  range: halfSpanRad,
  targetAngle: centerBig                // sera randomisé après
};


// ---------------------------
//   RANDOMISATION DE LA SOLUTION
// ---------------------------

function randomizeSolution() {
  const marginDeg = 10;                // éviter les bords
  const margin = degToRad(marginDeg);

  // petit knob : random dans SA plage verticale
  const minSmall = knobSmall.minAngle + margin;
  const maxSmall = knobSmall.maxAngle - margin;
  const randS = Math.random();
  knobSmall.targetAngle = minSmall + randS * (maxSmall - minSmall);

  // grand knob : random dans SA plage opposée
  const minBig = knobBig.minAngle + margin;
  const maxBig = knobBig.maxAngle - margin;
  const randB = Math.random();
  knobBig.targetAngle = minBig + randB * (maxBig - minBig);

  // positions de départ (optionnel)
  knobSmall.angle = knobSmall.minAngle;
  knobBig.angle   = knobBig.maxAngle;
}
// on lance une solution aléatoire au début
randomizeSolution();

// ---------------------------
//   MOUSE → COORDS CANVAS
// ---------------------------
function getMousePosCanvas(e) {
  const rect = canvas.getBoundingClientRect();

  const xCss = e.clientX - rect.left;
  const yCss = e.clientY - rect.top;

  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: xCss * scaleX - canvas.width  / 2,
    y: yCss * scaleY - canvas.height / 2
  };
}

function getMouseAngle(e) {
  const { x, y } = getMousePosCanvas(e);
  return Math.atan2(y, x);
}

// ---------------------------
//   HITTEST SUR LA POIGNÉE
// ---------------------------
function isOnHandle(e, knob, strokeWidth, handleLength, handleWidth) {
  const { x, y } = getMousePosCanvas(e);

  // passer dans le repère du knob : rotation inverse
  const cos = Math.cos(-knob.angle);
  const sin = Math.sin(-knob.angle);
  const xr = x * cos - y * sin;
  const yr = x * sin + y * cos;

  const base = knob.radius + strokeWidth / 2;

  const rectX = -handleWidth / 2;
  const rectY = -(base + handleLength);
  const rectW = handleWidth;
  const rectH = handleLength;

  return (
    xr >= rectX &&
    xr <= rectX + rectW &&
    yr >= rectY &&
    yr <= rectY + rectH
  );
}

function isOnBigHandle(e) {
  // mêmes paramètres que drawGraduatedCircle du grand knob
  return isOnHandle(e, knobBig, 100, 100, 70);
}

function isOnSmallHandle(e) {
  // mêmes paramètres que drawGraduatedCircle du petit knob
  return isOnHandle(e, knobSmall, 100, 200, 90);
}

// ---------------------------
//   EVENTS SOURIS
// ---------------------------
canvas.addEventListener("mousedown", (e) => {
  if (puzzleSolved) return;

  const a = getMouseAngle(e);

  // GRAND KNOB (priorité)
  if (isOnBigHandle(e)) {
    knobBig.dragging = true;
    knobBig.lastMouseAngle = a;
    return;
  }
  // PETIT KNOB
  if (isOnSmallHandle(e)) {
    knobSmall.dragging = true;
    knobSmall.lastMouseAngle = a;
    return;
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (puzzleSolved) return;

  const a = getMouseAngle(e);

  if (knobSmall.dragging) {
    const delta = shortestAngleDiff(a, knobSmall.lastMouseAngle);
    let newAngle = knobSmall.angle + delta * dragPower;
    knobSmall.angle = clamp(newAngle, knobSmall.minAngle, knobSmall.maxAngle);
    knobSmall.lastMouseAngle = a;
  }

  if (knobBig.dragging) {
    const delta = shortestAngleDiff(a, knobBig.lastMouseAngle);
    let newAngle = knobBig.angle + delta * dragPower;
    knobBig.angle = clamp(newAngle, knobBig.minAngle, knobBig.maxAngle);
    knobBig.lastMouseAngle = a;
  }
});


canvas.addEventListener("mouseup", () => {
  knobSmall.dragging = false;
  knobBig.dragging = false;
});

canvas.addEventListener("mouseleave", () => {
  knobSmall.dragging = false;
  knobBig.dragging = false;
});

// ---------------------------
//   BLUR & LOGIQUE DU PUZZLE
// ---------------------------
function updateBlurFromRotation() {
  if (puzzleSolved) {
    blurAmount = 0;
    return;
  }

  const diffSmall = shortestAngleDiff(knobSmall.angle, knobSmall.targetAngle);
  const diffBig   = shortestAngleDiff(knobBig.angle,   knobBig.targetAngle);

  const absS = Math.abs(diffSmall);
  const absB = Math.abs(diffBig);

  const maxError = Math.PI / 4;
  const normS = Math.min(absS / maxError, 1);
  const normB = Math.min(absB / maxError, 1);

  const error = (normS + normB) * 0.5;
  blurAmount = error * maxBlur;

  const tolerance = degToRad(2);
  if (absS < tolerance && absB < tolerance) {
    puzzleSolved = true;
    knobSmall.angle = knobSmall.targetAngle;
    knobBig.angle = knobBig.targetAngle;
    blurAmount = 0;
    
    // Lance l'outro
    isOutroPlaying = true;
    outroTime = 0;
  }
}
// ---------------------------
//   DESSIN DU KNOB
// ---------------------------
function drawGraduatedCircle(
  radius,
  strokeWidth = 50,
  tickCount = 120,
  majorScale = 0.5,
  minorScale = 0.25,
  handleLength = 90,
  handleWidth = 50,
  angle = 0
) {
  ctx.save();

  // rotation du knob
  ctx.rotate(angle);

  // --- CERCLE ---
  ctx.beginPath();
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = "black";
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  const base = radius + strokeWidth / 2;
  const half = strokeWidth;

  const majorSize = half * majorScale;
  const minorSize = half * minorScale;

  // --- GRADUATIONS ---
  for (let i = 0; i < tickCount; i++) {
    const isMajor = (i % 10 === 0);
    const size = isMajor ? majorSize : minorSize;

    ctx.beginPath();
    ctx.moveTo(0, base);
    ctx.lineTo(0, base - size);
    ctx.lineWidth = isMajor ? 5 : 2;
    ctx.strokeStyle = "white";
    ctx.stroke();

    ctx.rotate((Math.PI * 2) / tickCount);
  }

  // --- HANDLE ---
  ctx.beginPath();
  ctx.fillStyle = "black";
  ctx.strokeStyle = "black";
  ctx.lineWidth = 4;

  ctx.rect(
    -handleWidth / 2,
    -(base + handleLength),
    handleWidth,
    handleLength
  );

  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

// ---------------------------
//   NOMBRE "2" AU CENTRE
// ---------------------------
function number2() {
  ctx.save();
  ctx.filter = `blur(${blurAmount}px)`;

  ctx.fillStyle = "black";
  ctx.font = `${canvas.height * 0.4}px Helvetica Neue, Helvetica, bold`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText("2", 0, 0);

  ctx.filter = "none";
  ctx.restore();
}

// ---------------------------
//   BOUCLE UPDATE
// ---------------------------
function update(dt) {
  const x = canvas.width / 2;
  const y = canvas.height / 2;
  
  // --- ANIM INTRO (fond noir qui descend) ---
  if (!introDone) {
    introProgress += dt / introDuration;
    if (introProgress >= 1) {
      introProgress = 1;
      introDone = true;
    }
  }

  // offset vertical de toute la scène pendant l'intro
  // introProgress : 0 -> 1  => offset : -canvas.height -> 0
  let sceneOffsetY = 0;
  if (!introDone) {
    sceneOffsetY = (introProgress - 1) * canvas.height;
  }


  updateBlurFromRotation();
  // --- OUTRO TIMER ---
if (isOutroPlaying && !hasFinishCalled) {
  outroTime += dt;
}

const tHideBig = 0.4;
const tHideSmall = 0.8;
const tCutBlack = 1.2;

// Appel finish()
if (isOutroPlaying && outroTime >= tCutBlack && !hasFinishCalled) {
  hasFinishCalled = true;
  finish();
}

// PAR :
if (!isOutroPlaying || outroTime < tCutBlack) {
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
} else {
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
ctx.save();
ctx.translate(x, y + sceneOffsetY);

const showBig = !isOutroPlaying || outroTime < tHideBig;
const showSmall = !isOutroPlaying || outroTime < tHideSmall;
const show2 = !isOutroPlaying || outroTime < tCutBlack;

if (show2) {
  number2();
}

if (showBig) {
  drawGraduatedCircle(
    knobBig.radius,
    100,
    200,
    0.55,
    0.25,
    100,
    70,
    knobBig.angle
  );
}

if (showSmall) {
  drawGraduatedCircle(
    knobSmall.radius,
    100,
    120,
    0.6,
    0.3,
    200,
    90,
    knobSmall.angle
  );
}

ctx.restore();

// --- FOND NOIR D'INTRO QUI DROP PAR-DESSUS TOUT ---
if (!introDone) {
  const yDrop = introProgress * canvas.height;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // coords écran
  ctx.fillStyle = "black";
  ctx.fillRect(0, yDrop, canvas.width, canvas.height);
  ctx.restore();
  } 
}
/*
const ySpring = new Spring({
  position: -canvas.height,
  target: 0,
  frequency: 1.5,
  halfLife: 0.05
})
const scaleSpring = new Spring({
  position: 1,
  frequency: 1.5,
  halfLife: 0.1
})
const rotationSpring = new Spring({
  position: 180,
  frequency: 0.5,
  halfLife: 0.805,
  wrap: 360
})

let fallPos = 0
let fallVel = 0

const State = {
  WaitingForInput: "waitingForInput",
  Interactive: "interactive",
  Falling: "falling",
  Finished: "finished"
}
let currentState = State.WaitingForInput
let startInputX = 0

function update(dt) {



  let nextState = undefined
  switch (currentState) {
    case State.WaitingForInput: {

      if (input.hasStarted()) {
        startInputX = input.getX()
        nextState = State.Interactive
      }
      break
    }

    case State.Interactive: {
      const xOffset = input.getX() - startInputX
      rotationSpring.target = math.map(xOffset, 0, canvas.width, 0, 360) + 180
      rotationSpring.step(dt)
      if (Math.abs(math.deltaAngleDeg(rotationSpring.position, 0)) < 5 && Math.abs(rotationSpring.velocity, 0) < 10)
        nextState = State.Falling
      break
    }

    case State.Falling: {
      const drag = 0.1
      const gravity = canvas.height * 3
      const rotationForce = 200 * Math.sign(rotationSpring.velocity)
      rotationSpring.velocity += rotationForce * dt;
      rotationSpring.velocity *= Math.exp(-dt * drag)
      rotationSpring.position += rotationSpring.velocity * dt
      fallVel += gravity * dt;
      fallPos += fallVel * dt;
      if (fallPos > canvas.height)
        nextState = State.Finished
      break
    }

    case State.Finished: {
      break
    }
  }

  if (nextState !== undefined) {

    currentState = nextState
    switch (currentState) {
      case State.Finished:

        finish()
        break;
      case State.Falling:

        scaleSpring.target = 1.2
        break;
    }
    // change state
  }


  ySpring.step(dt)
  scaleSpring.step(dt)

  const x = canvas.width / 2;
  const y = canvas.height / 2 + fallPos;
  const rot = rotationSpring.position
  const scale = scaleSpring.position

  ctx.fillStyle = "black"
  ctx.fillRect(0, 0, canvas.width, canvas.height)


  ctx.fillStyle = "white"
  ctx.textBaseline = "middle"
  ctx.font = `${canvas.height}px Helvetica Neue, Helvetica , bold`
  ctx.textAlign = "center"
  ctx.translate(x, y + ySpring.position)
  ctx.rotate(math.toRadian(rot))
  ctx.scale(scale, scale)
  ctx.fillText("2", 0, 0)


}
*/