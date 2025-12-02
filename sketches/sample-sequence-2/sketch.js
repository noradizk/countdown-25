import { createEngine } from "../_shared/engine.js"
import { Spring } from "../_shared/spring.js"

const { renderer, input, math, run, finish } = createEngine()
const { ctx, canvas } = renderer

let angle = 0;
let dragging = false;
let lastMouseAngle = 0;
let blurAmount = 0;

function getMouseAngle(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left - canvas.width / 2;
  const y = e.clientY - rect.top - canvas.height / 2;
  return Math.atan2(y, x);
}

function isOnHandle(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left - canvas.width / 2;
  const y = e.clientY - rect.top - canvas.height / 2;
  
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const rx = x * cos - y * sin;
  const ry = x * sin + y * cos;
  
  const radius = canvas.height * 0.3;
  const strokeWidth = 100;
  const base = radius + strokeWidth/2;
  const handleLength = 80;
  const handleWidth = 90;
  
  return (
    rx >= -handleWidth / 2 &&
    rx <= handleWidth / 2 &&
    ry >= -(base + handleLength) &&
    ry <= -base
  );
}

canvas.addEventListener("mousedown", (e) => {
  if (isOnHandle(e)) {
    dragging = true;
    lastMouseAngle = getMouseAngle(e);
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (!dragging && isOnHandle(e)) {
    canvas.style.cursor = "grab";
  } else if (!dragging) {
    canvas.style.cursor = "default";
  }
  
  if (!dragging) return;
  
  const currentMouseAngle = getMouseAngle(e);
  const delta = currentMouseAngle - lastMouseAngle;
  
  angle += delta;
  lastMouseAngle = currentMouseAngle;
});

canvas.addEventListener("mouseup", () => {
  dragging = false;
});

canvas.addEventListener("mouseleave", () => {
  dragging = false;
});

function updateBlurFromRotation() {
  let normalizedAngle = angle % (Math.PI * 2);
  if (normalizedAngle > Math.PI) normalizedAngle -= Math.PI * 2;
  if (normalizedAngle < -Math.PI) normalizedAngle += Math.PI * 2;
  
  const diff = Math.abs(normalizedAngle);
  blurAmount = (diff / Math.PI) * 20;
}

function drawGraduatedCircle(
  radius,
  strokeWidth = 50,
  tickCount = 120,
  majorScale = 0.5,
  minorScale = 0.25,
  handleLength = 90,
  handleWidth = 50
) {
  ctx.save();
  
  ctx.beginPath();
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = "black";
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
  
  const base = radius + strokeWidth/2;
  const half = strokeWidth;
  let majorSize = half * majorScale;
  let minorSize = half * minorScale;
  
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

function update(dt) {
  updateBlurFromRotation();
  
  ctx.fillStyle = "red";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  
  ctx.save();
  ctx.filter = `blur(${blurAmount}px)`;
  ctx.fillStyle = "black";
  ctx.font = `bold ${canvas.height * 0.4}px Helvetica Neue, Helvetica, Arial`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText("2", 0, 0);
  ctx.restore();
  
  ctx.rotate(angle);
  drawGraduatedCircle(
    canvas.height * 0.3,
    100,
    120,
    0.6,
    0.3,
    80,
    90
  );
  
  ctx.restore();
}

run(update);

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