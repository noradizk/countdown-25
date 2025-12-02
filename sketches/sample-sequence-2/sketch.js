import { createEngine } from "../_shared/engine.js"
import { Spring } from "../_shared/spring.js"

const { renderer, input, math, run, finish } = createEngine()
const { ctx, canvas } = renderer
run(update)

function update(dt){
  ctx.fillStyle = "white"
  ctx.textBaseline = "middle"
  ctx.font = `${canvas.height}px Helvetica Neue, Helvetica , bold`
  ctx.textAlign = "center"
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