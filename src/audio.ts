let context: AudioContext | undefined,
  gain: GainNode | undefined,
  enabled = false;
export async function setSound(on: boolean) {
  enabled = on;
  if (on && !context) {
    context = new AudioContext();
    const buffer = context.createBuffer(
        1,
        context.sampleRate * 8,
        context.sampleRate,
      ),
      data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + (Math.random() * 2 - 1) * 0.025) / 1.025;
      data[i] = last * 5;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 650;
    gain = context.createGain();
    gain.gain.value = 0.13;
    const swell = context.createOscillator(),
      depth = context.createGain();
    swell.frequency.value = 0.12;
    depth.gain.value = 0.055;
    swell.connect(depth).connect(gain.gain);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start();
    swell.start();
  }
  if (context) {
    if (enabled && !document.hidden) await context.resume();
    else await context.suspend();
  }
}
export function suspendWhenHidden() {
  return setSound(enabled);
}
