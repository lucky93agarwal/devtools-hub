/** Sound effects for a clip, built from Web Audio nodes: clean-up filters, bass and treble, echo. */
import { AudioFx } from './project';

/** True when the effects change the sound at all. */
export const hasAudioFx = (fx: AudioFx | undefined): fx is AudioFx => !!fx && (fx.echo > 0 || fx.bass !== 0 || fx.treble !== 0 || fx.clean);

/**
 * Connects `input` through the effects and returns the last node, to connect onwards.
 * Works with a live AudioContext (preview) and an OfflineAudioContext (export).
 */
export function connectAudioFx(context: BaseAudioContext, input: AudioNode, fx: AudioFx | undefined): AudioNode {
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
