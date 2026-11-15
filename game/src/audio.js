// Procedural sound: every effect is synthesised with WebAudio, so the game
// ships no audio files and makes no network request. Created on first input;
// silent where audio is unavailable.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx || typeof window.AudioContext === 'undefined') return false;
    ctx = new window.AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);
    return true;
  }

  function noise(seconds, filterFreq, gain) {
    if (!ctx) return;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const amp = ctx.createGain();
    amp.gain.value = gain;
    source.connect(filter).connect(amp).connect(master);
    source.start();
  }

  function tone(freq, seconds, gain, type = 'sine') {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(amp).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }

  return {
    ensure,
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
    shot() { noise(0.09, 1800, 0.9); },
    reload() { tone(320, 0.06, 0.25, 'square'); },
    hit() { tone(880, 0.05, 0.3); },
    kill() { tone(660, 0.07, 0.35); tone(990, 0.09, 0.3); },
    explosion() { noise(0.7, 300, 1.4); tone(55, 0.6, 0.8); },
    beep() { tone(1200, 0.07, 0.35, 'square'); },
    plant() { tone(520, 0.12, 0.35); tone(780, 0.16, 0.35); },
    roundWin() { tone(523, 0.12, 0.3); setTimeout(() => tone(784, 0.18, 0.3), 110); },
  };
}
