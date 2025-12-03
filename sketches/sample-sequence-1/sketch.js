import { createEngine } from "../_shared/engine.js"
import { Spring } from "../_shared/spring.js"

const { renderer, input, math, run, finish, } = createEngine()
const { ctx, canvas } = renderer
run(update)


// Spring simple entre 0 et 1
const spring = new Spring({
	position: 0,
	frequency: 2.0,
	halfLife: 0.25
});

const cardWidth  = 160;
const cardHeight = 220;

// easing
function easeOutCubic(t) {
	return 1 - Math.pow(1 - t, 3);
}

// Carte déformée + face (coords locales, 0,0 = centre)
function drawBentCard(bendAmount, side) {
	const w = cardWidth;
	const h = cardHeight;

	const x = -w / 2;
	const y = -h / 2;

	const left   = x;
	const right  = x + w;
	const top    = y;
	const bottom = y + h;

	const bend = bendAmount * 20; // plus grand = plus tordu

	const topCtrlY    = top - bend;
	const bottomCtrlY = bottom + bend;
	const leftCtrlX   = left - bend * 0.4;
	const rightCtrlX  = right + bend * 0.4;

	ctx.beginPath();

	// bord haut
	ctx.moveTo(left, top);
	ctx.quadraticCurveTo(
		(left + right) / 2, topCtrlY,
		right, top
	);

	// bord droit
	ctx.quadraticCurveTo(
		rightCtrlX, (top + bottom) / 2,
		right, bottom
	);

	// bord bas
	ctx.quadraticCurveTo(
		(left + right) / 2, bottomCtrlY,
		left, bottom
	);

	// bord gauche
	ctx.quadraticCurveTo(
		leftCtrlX, (top + bottom) / 2,
		left, top
	);

	ctx.closePath();

	// Style selon la face
	let grad;
	if (side === "front") {
		grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
		grad.addColorStop(0, "#ff6b6b");
		grad.addColorStop(1, "#feca57");
	} else {
		grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
		grad.addColorStop(0, "#1dd1a1");
		grad.addColorStop(1, "#5f27cd");
	}

	ctx.fillStyle = grad;
	ctx.fill();
	ctx.lineWidth = 2;
	ctx.strokeStyle = "white";
	ctx.stroke();

	// texte au centre (juste pour voir le flip)
	ctx.fillStyle = "white";
	ctx.font = "bold 28px system-ui";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(side.toUpperCase(), 0, 0);
}

// ================== UPDATE ==================
function update(dt) {
	
	// 1) spring 0 -> 1
	if (input.isPressed()) {
		spring.target = 1;
	} else {
		spring.target = 0;
	}
	spring.step(dt);

	let t = spring.position;
	if (t < 0) t = 0;
	if (t > 1) t = 1;

	// 2) flip + déformation
	const flipAngle = t * Math.PI;        // 0 → π
	const scaleX = Math.cos(flipAngle);   // flip (se referme / rouvre)
	const tilt = 0.25 * Math.sin(flipAngle); // petite diagonale

	// courbure max au milieu du flip
	const bendProgress = Math.sin(flipAngle); // 0 → 1 → 0
	const bend = easeOutCubic(Math.max(0, bendProgress));

	// face visible (avant la moitié / après)
	const side = t < 0.5 ? "front" : "back";

	// 3) clear
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.fillStyle = "black";
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// 4) dessine la carte
	const cx = canvas.width  / 2;
	const cy = canvas.height / 2 + 40;

	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate(tilt);

	// flip horizontal (petit hack pour éviter trop de miroir visuel)
	const sx = Math.abs(scaleX);
	const dir = scaleX < 0 ? -1 : 1;
	ctx.scale(dir * sx, 1);

	drawBentCard(bend, side);
	ctx.restore();
}

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
