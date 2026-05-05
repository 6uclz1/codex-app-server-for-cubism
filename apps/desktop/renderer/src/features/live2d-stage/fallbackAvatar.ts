import type { CharacterEmotion, CharacterState } from "@cubism/shared-types";
import type { GazePoint } from "@cubism/live2d-domain";

export function drawFallbackAvatar(canvas: HTMLCanvasElement, state: CharacterState, emotion: CharacterEmotion, lipSync: number, gaze: GazePoint, scale = 0.9, offsetX = 0, offsetY = 0): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);

  const centerX = width / 2 + offsetX * window.devicePixelRatio;
  const centerY = height / 2 + 20 + offsetY * window.devicePixelRatio;
  const radius = Math.min(width, height) * 0.28 * (scale / 0.9);
  const stateColor = state === "speaking" ? "#2f7d73" : state === "listening" ? "#8b6f47" : state === "thinking" ? "#5668a6" : "#49515c";
  const blush = emotion === "joy" || emotion === "fun" ? "#e98a8a" : emotion === "surprised" ? "#f5b35a" : "#9bb0bd";

  context.fillStyle = "#eef1f3";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#343a40";
  context.beginPath();
  context.arc(centerX, centerY - 12, radius + 28, Math.PI, 0);
  context.quadraticCurveTo(centerX + radius + 48, centerY + radius, centerX, centerY + radius + 32);
  context.quadraticCurveTo(centerX - radius - 48, centerY + radius, centerX - radius - 28, centerY - 12);
  context.fill();

  context.fillStyle = "#f4d0be";
  context.beginPath();
  context.ellipse(centerX, centerY, radius, radius * 1.08, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = blush;
  context.globalAlpha = emotion === "neutral" || emotion === "thinking" ? 0.25 : 0.5;
  context.beginPath();
  context.ellipse(centerX - radius * 0.48, centerY + 14, 26, 12, 0, 0, Math.PI * 2);
  context.ellipse(centerX + radius * 0.48, centerY + 14, 26, 12, 0, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  const eyeOffsetX = gaze.x * 7;
  const eyeOffsetY = gaze.y * 5;
  context.fillStyle = "#1f2933";
  context.beginPath();
  const happyEyeHeight = emotion === "joy" || emotion === "fun" ? 4 : 13;
  context.ellipse(centerX - radius * 0.36 + eyeOffsetX, centerY - 30 + eyeOffsetY, 9, happyEyeHeight, 0, 0, Math.PI * 2);
  context.ellipse(centerX + radius * 0.36 + eyeOffsetX, centerY - 30 + eyeOffsetY, 9, happyEyeHeight, 0, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = stateColor;
  context.lineWidth = 6;
  context.beginPath();
  if (emotion === "sorrow") {
    context.arc(centerX, centerY + 52, 28, Math.PI * 1.1, Math.PI * 1.9);
  } else if (emotion === "anger") {
    context.moveTo(centerX - 36, centerY + 44);
    context.lineTo(centerX + 36, centerY + 44);
  } else if (emotion === "surprised") {
    context.ellipse(centerX, centerY + 44, 15, 18 + lipSync * 18, 0, 0, Math.PI * 2);
  } else if (emotion === "fun") {
    context.arc(centerX, centerY + 34, 34, 0.1, Math.PI - 0.1);
  } else {
    context.ellipse(centerX, centerY + 42, 34, 6 + lipSync * 22, 0, 0, Math.PI);
  }
  context.stroke();

  context.fillStyle = stateColor;
  context.font = "600 14px Inter, system-ui";
  context.textAlign = "center";
  context.fillText(state.toUpperCase(), centerX, height - 26);
}
