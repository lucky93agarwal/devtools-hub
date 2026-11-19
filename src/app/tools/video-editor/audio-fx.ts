/** Sound effects for a clip, built from Web Audio nodes: clean-up filters, bass and treble, echo. */
import { AudioFx } from './project';

/** True when the effects change the sound at all. */
export const hasAudioFx = (fx: AudioFx | undefined): fx is AudioFx =>
  !!fx && (fx.echo > 0 || fx.bass !== 0 || fx.treble !== 0 || fx.clean || !!fx.mid || !!fx.denoise || !!fx.compressor || !!fx.distortion || !!fx.robot || !!fx.phone);

/** A soft-clipping curve for the distortion effect; `amount` 0..1. */
export function distortionCurve(amount: number, samples = 1024): Float32Array<ArrayBuffer> {
  const k = 2 + amount * 60;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

/**
 * Connects `input` through the effects and returns the last node, to connect onwards.
 * Oscillators the effects start are added to `sources`, so they can be stopped later.
 * Works with a live AudioContext (preview) and an OfflineAudioContext (export).
 */
export function connectAudioFx(context: BaseAudioContext, input: AudioNode, fx: AudioFx | undefined, sources: AudioScheduledSourceNode[] = []): AudioNode {
  if (!hasAudioFx(fx)) return input;
  let node: AudioNode = input;
  const chain = (next: AudioNode) => {
    node.connect(next);
    node = next;
  };
  if (fx.clean) {
    // Speech sits roughly between 80 Hz and 9 kHz: cut rumble below and hiss above.
    const low = context.createBiquadFilter();
    low.type = 'highpass';
    low.frequency.value = 80;
    chain(low);
    const high = context.createBiquadFilter();
    high.type = 'lowpass';
    high.frequency.value = 9000;
    chain(high);
  }
  if (fx.denoise) {
    // Mains hum (50 and 60 Hz) is notched out, rumble and steady hiss are cut.
    for (const hz of [50, 60, 100, 120]) {
      const notch = context.createBiquadFilter();
      notch.type = 'notch';
      notch.frequency.value = hz;
      notch.Q.value = 12;
      chain(notch);
    }
    const low = context.createBiquadFilter();
    low.type = 'highpass';
    low.frequency.value = 90;
    chain(low);
    const hiss = context.createBiquadFilter();
    hiss.type = 'highshelf';
    hiss.frequency.value = 6000;
    hiss.gain.value = -12;
    chain(hiss);
  }
  if (fx.phone) {
    // A telephone passes roughly 300 Hz to 3.4 kHz.
    const low = context.createBiquadFilter();
    low.type = 'highpass';
    low.frequency.value = 400;
    low.Q.value = 0.9;
    chain(low);
    const high = context.createBiquadFilter();
    high.type = 'lowpass';
    high.frequency.value = 3000;
    high.Q.value = 0.9;
    chain(high);
  }
  if (fx.bass) {
    const bass = context.createBiquadFilter();
    bass.type = 'lowshelf';
    bass.frequency.value = 200;
    bass.gain.value = fx.bass;
    chain(bass);
  }
  if (fx.treble) {
    const treble = context.createBiquadFilter();
    treble.type = 'highshelf';
    treble.frequency.value = 3500;
    treble.gain.value = fx.treble;
    chain(treble);
  }
  if (fx.mid) {
    const mid = context.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 1000;
    mid.Q.value = 0.8;
    mid.gain.value = fx.mid;
    chain(mid);
  }
  if (fx.distortion || fx.phone) {
    const shaper = context.createWaveShaper();
    shaper.curve = distortionCurve(fx.distortion || 0.15);
    shaper.oversample = '2x';
    chain(shaper);
    const level = context.createGain();
    level.gain.value = 0.8;
    chain(level);
  }
  if (fx.robot) {
    // Ring modulation: the sound's level swings at 50 Hz, which gives the metallic tone.
    const ring = context.createGain();
    ring.gain.value = 0;
    const oscillator = context.createOscillator();
    oscillator.frequency.value = 50;
    oscillator.connect(ring.gain);
    oscillator.start();
    // Kept so the preview can stop it when the effects change.
    sources.push(oscillator);
    chain(ring);
    const lift = context.createGain();
    lift.gain.value = 1.6;
    chain(lift);
  }
  if (fx.compressor) {
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -28;
    compressor.knee.value = 20;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.2;
    chain(compressor);
    const makeUp = context.createGain();
    makeUp.gain.value = 1.6;
    chain(makeUp);
  }
  if (fx.echo > 0) {
    // Dry sound plus a repeating, fading copy 0.3 s later.
    const mix = context.createGain();
    node.connect(mix);
    const delay = context.createDelay(1);
    delay.delayTime.value = 0.3;
    const feedback = context.createGain();
    feedback.gain.value = 0.25 + fx.echo * 0.4;
    const wet = context.createGain();
    wet.gain.value = fx.echo;
    node.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(mix);
    node = mix;
  }
  return node;
}

/** A copy of an AudioBuffer played backwards, for reversed clips. */
export function reversed(context: BaseAudioContext, buffer: AudioBuffer): AudioBuffer {
  const out = context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) out.copyToChannel(Float32Array.from(buffer.getChannelData(c)).reverse(), c);
  return out;
}
