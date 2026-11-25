/**
 * Musique générative très discrète : contrebasse en pizzicato (ligne qui marche en ré mineur)
 * et balais sur les temps 2 et 4. Tempo lent ; à la table du patron, elle se tend (plus vite,
 * bourdon grave, secondes mineures). Volume séparé, coupée par défaut.
 */
import { onSettings, settings } from '../core/settings';

let ac: AudioContext | null = null;
let out: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let timer: number | null = null;
let nextTime = 0;
let beat = 0;
let tension = 0;
let drone: { osc: OscillatorNode; gain: GainNode } | null = null;

// ré mineur : Dm7 | Gm7 | A7 | Dm7  (notes MIDI de la basse, une par temps)
const BARS: number[][] = [
  [38, 41, 45, 48],
  [43, 46, 50, 46],
  [45, 49, 52, 49],
  [38, 45, 41, 40],
];
const BOSS_BARS: number[][] = [
  [38, 39, 38, 44],
  [38, 41, 39, 38],
  [37, 38, 44, 43],
  [38, 39, 41, 39],
];

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function vol(): number {
  return (settings.muted ? 0 : (settings.music / 100) ** 1.6 * 0.55);
}

function pluck(t: number, midi: number, accent: number): void {
  const c = ac!;
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(hz(midi) * 1.01, t);
  o.frequency.exponentialRampToValueAtTime(hz(midi), t + 0.05);
  const o2 = c.createOscillator();
  o2.type = 'sine';
  o2.frequency.value = hz(midi) * 2;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(900, t);
  f.frequency.exponentialRampToValueAtTime(220, t + 0.35);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5 * accent, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  const g2 = c.createGain();
  g2.gain.value = 0.18;
  o.connect(f);
  o2.connect(g2).connect(f);
  f.connect(g).connect(out!);
  o.start(t);
  o2.start(t);
  o.stop(t + 0.6);
  o2.stop(t + 0.6);
}

function brush(t: number, len: number, level: number): void {
  const c = ac!;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 3800;
  f.Q.value = 0.6;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + len * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(out!);
  src.start(t, Math.random() * 0.5);
  src.stop(t + len + 0.05);
}

function schedule(): void {
  if (!ac || !out) return;
  const bpm = 70 + tension * 14;
  const spb = 60 / bpm;
  while (nextTime < ac.currentTime + 0.4) {
    const bars = tension > 0.5 ? BOSS_BARS : BARS;
    const bar = bars[Math.floor(beat / 4) % bars.length];
    const n = beat % 4;
    // swing léger : les temps faibles arrivent un poil en retard
    const t = nextTime + (n % 2 === 1 ? spb * 0.06 : 0);
    // la basse saute parfois une note (respiration) ; jamais le premier temps
    if (n === 0 || Math.random() > 0.12) pluck(t, bar[n] - (Math.random() > 0.85 ? 12 : 0), n === 0 ? 1 : 0.75);
    // balais : frotté continu discret, frappé sur 2 et 4
    brush(t, spb * 0.9, 0.012);
    if (n === 1 || n === 3) brush(t, 0.12, 0.05);
    nextTime += spb;
    beat++;
  }
}

function ensure(): boolean {
  if (ac) return true;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return false;
  ac = new Ctor();
  out = ac.createGain();
  out.gain.value = 0;
  out.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}

function apply(): void {
  if (!ac || !out) return;
  const v = vol();
  out.gain.setTargetAtTime(v, ac.currentTime, 0.3);
  if (v > 0 && timer === null && ac.state === 'running') {
    nextTime = ac.currentTime + 0.1;
    timer = window.setInterval(schedule, 100);
  } else if (v === 0 && timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  // bourdon grave à la table du patron
  if (tension > 0.5 && v > 0 && !drone) {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz(26);
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 160;
    const g = ac.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.05, ac.currentTime, 1.5);
    o.connect(f).connect(g).connect(out);
    o.start();
    drone = { osc: o, gain: g };
  } else if ((tension <= 0.5 || v === 0) && drone) {
    const d = drone;
    drone = null;
    d.gain.gain.setTargetAtTime(0, ac.currentTime, 0.6);
    d.osc.stop(ac.currentTime + 3);
  }
}

export const music = {
  /** Premier geste du joueur. */
  unlock(): void {
    if (!ensure()) return;
    if (ac!.state === 'suspended') void ac!.resume().then(apply);
    else apply();
  },
  /** 0 = salon ordinaire, 1 = table du patron. */
  setTension(t: number): void {
    if (t === tension) return;
    tension = t;
    apply();
  },
};

onSettings(() => apply());
