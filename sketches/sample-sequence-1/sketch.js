import { createEngine } from "../_shared/engine.js"
import { Spring } from "../_shared/spring.js"

const { renderer, input, math, run, finish, } = createEngine()
const { ctx, canvas } = renderer
run(update)


// Paramètres de la carte
const cardWidth = 160;
const cardHeight = 220;
const cardCenterX = canvas.width / 2;
const cardCenterY = canvas.height / 2;

let isFlipping = false;
let flipStartTime = 0;
const flipDuration = 600; // ms
let showingFront = true;

// Dessine une carte avec coins arrondis
function drawRoundedCard(x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function renderCard(side, scaleX) {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // On se place au centre de la carte
  ctx.translate(cardCenterX, cardCenterY);
  ctx.scale(scaleX, 1); // scaleX va de 1 -> 0 -> -1 pour le flip

  // Dessin de la carte en coordonnées locales (centre = 0,0)
  const x = -cardWidth / 2;
  const y = -cardHeight / 2;

  drawRoundedCard(x, y, cardWidth, cardHeight, 16);

  if (side === 'front') {
    // Face avant
    const grad = ctx.createLinearGradient(x, y, x + cardWidth, y + cardHeight);
    grad.addColorStop(0, '#ff6b6b');
    grad.addColorStop(1, '#feca57');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FRONT', 0, 0);
  } else {
    // Face arrière
    const grad = ctx.createLinearGradient(x, y, x + cardWidth, y + cardHeight);
    grad.addColorStop(0, '#1dd1a1');
    grad.addColorStop(1, '#5f27cd');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BACK', 0, 0);
  }

  ctx.restore();
}

function renderStatic() {
  renderCard(showingFront ? 'front' : 'back', 1);
}

// Animation avec requestAnimationFrame
function animateFlip(timestamp) {
  if (!isFlipping) return;

  if (!flipStartTime) {
    flipStartTime = timestamp;
  }

  const elapsed = timestamp - flipStartTime;
  let t = elapsed / flipDuration;
  if (t > 1) t = 1;

  // Angle de 0 à PI
  const angle = t * Math.PI;
  const scaleX = Math.cos(angle);

  // Détermine si on dessine la face avant ou arrière
  const side = angle < Math.PI / 2
    ? (showingFront ? 'front' : 'back')
    : (!showingFront ? 'front' : 'back');

  renderCard(side, scaleX);

  if (t < 1) {
    requestAnimationFrame(animateFlip);
  } else {
    // Fin de l’animation, on inverse l’état
    showingFront = !showingFront;
    isFlipping = false;
    flipStartTime = 0;
    renderStatic();
  }
}

// Détection du clic sur la carte
canvas.addEventListener('click', (e) => {
  if (isFlipping) return; // éviter de spam pendant le flip

  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // On teste avec un rectangle simple autour de la carte
  const left = cardCenterX - cardWidth / 2;
  const right = cardCenterX + cardWidth / 2;
  const top = cardCenterY - cardHeight / 2;
  const bottom = cardCenterY + cardHeight / 2;

  const isInside =
    mouseX >= left && mouseX <= right &&
    mouseY >= top && mouseY <= bottom;

  if (isInside) {
    isFlipping = true;
    flipStartTime = 0;
    requestAnimationFrame(animateFlip);
  }
});

// Premier rendu
renderStatic();
/*
const spring = new Spring({
	position: -canvas.width,
	frequency: 0.50,
	halfLife: 0.3
})


function update(dt) {

	if (input.isPressed()) {
		spring.target = canvas.width
	}
	else {
		spring.target = 0
	}

	spring.step(dt)

	const x = canvas.width / 2 + spring.position;
	const y = canvas.height / 2;

	ctx.fillStyle = "black"
	ctx.fillRect(0, 0, canvas.width, canvas.height)

	ctx.fillStyle = "white"
	ctx.textBaseline = "middle"
	ctx.font = `${canvas.height}px Helvetica Neue, Helvetica , bold`
	ctx.textAlign = "center"
	ctx.translate(x, y)
	ctx.rotate(math.toRadian(-spring.velocity * 0.03))
	ctx.fillText("1", 0, 0)

	if (spring.position >= canvas.width - 10) {
		finish()
	}

}

*/
