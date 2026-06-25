"use client";

/**
 * The game's signature synthesized sound effects, but routed into an arbitrary
 * AudioNode (the video's MediaStreamAudioDestinationNode) instead of the
 * speakers — so they land on the RECORDED audio track in sync with each scene.
 * Mirrors lib/games/audio.ts so the reel "sounds like" the game.
 */

function tone(ctx: AudioContext, target: AudioNode, freq: number, dur: number, type: OscillatorType, vol: number, at: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(vol, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(target);
  osc.start(at);
  osc.stop(at + dur + 0.03);
}

export function sfxPop(ctx: AudioContext, target: AudioNode, at: number) {
  tone(ctx, target, 520, 0.06, "triangle", 0.12, at);
  tone(ctx, target, 880, 0.09, "triangle", 0.12, at + 0.045);
}
export function sfxTick(ctx: AudioContext, target: AudioNode, at: number, urgent = false) {
  tone(ctx, target, urgent ? 920 : 640, 0.06, "square", urgent ? 0.1 : 0.06, at);
}
export function sfxCorrect(ctx: AudioContext, target: AudioNode, at: number) {
  tone(ctx, target, 660, 0.12, "sine", 0.17, at);
  tone(ctx, target, 880, 0.12, "sine", 0.17, at + 0.1);
  tone(ctx, target, 1175, 0.2, "sine", 0.19, at + 0.2);
}
export function sfxWrong(ctx: AudioContext, target: AudioNode, at: number) {
  tone(ctx, target, 330, 0.18, "sawtooth", 0.12, at);
  tone(ctx, target, 233, 0.3, "sawtooth", 0.12, at + 0.12);
}
export function sfxComplete(ctx: AudioContext, target: AudioNode, at: number) {
  [523, 659, 784, 1047].forEach((f, i) => tone(ctx, target, f, 0.24, "sine", 0.18, at + i * 0.13));
}
