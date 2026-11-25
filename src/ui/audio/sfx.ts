/**
 * Son entièrement synthétisé (WebAudio, aucun fichier). Le contexte démarre au premier geste.
 * Le marquage monte d'un demi-ton à chaque étape : une longue cascade s'entend comme une gamme.
 */
import { clock } from '../core/anim';
import { onSettings, settings } from '../core/settings';
import { music } from './music';

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function ensure(): AudioContext | null {
  if (ac) return ac;
  const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctor) return null;
  ac = new Ctor();
  master = ac.createGain();
  master.connect(ac.destination);
  applyVolume();
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}

function applyVolume(): void {
  if (!master || !ac) return;
  const v = settings.muted ? 0 : (settings.volume / 100) ** 1.5 * 0.8;
  master.gain.setTargetAtTime(v, ac.currentTime, 0.02);
}

onSettings(() => applyVolume());

/** À appeler sur le premier geste du joueur. */
export function unlockAudio(): void {
  const c = ensure();
  if (c && c.state === 'suspended') void c.resume();
  music.unlock();
}

function ready(): AudioContext | null {
  if (!ac || ac.state !== 'running' || clock.skipping) return null;
  if (settings.muted || settings.volume === 0) return null;
  return ac;
}

function env(g: GainNode, t: number, a: number, peak: number, d: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function noise(t: number, dur: number, filter: BiquadFilterType, freq: number, q: number, peak: number, attack = 0.002, freqEnd?: number): void {
  const c = ac!;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  f.Q.value = q;
  const g = c.createGain();
  env(g, t, attack, peak, dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random() * 0.5);
  src.stop(t + attack + dur + 0.05);
}

function tone(t: number, type: OscillatorType, freq: number, dur: number, peak: number, attack = 0.003, freqEnd?: number): void {
  const c = ac!;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = c.createGain();
  env(g, t, attack, peak, dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

const semi = (base: number, n: number) => base * Math.pow(2, n / 12);

export const sfx = {
  /** Carte qui glisse du sabot (côté croupier un peu plus grave : le va-et-vient s'entend). */
  card(side: 'player' | 'dealer' = 'player'): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    const k = side === 'dealer' ? 0.74 : 1;
    noise(t, 0.07, 'bandpass', 3200 * k, 0.9, 0.35, 0.004, 1800 * k);
    noise(t + 0.05, 0.03, 'highpass', 5000 * k, 0.7, 0.12);
  },
  /** Carte posée sur le tapis : claque sèche, plus grave chez le croupier, mate pour la carte cachée. */
  land(kind: 'player' | 'dealer' | 'hole'): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    if (kind === 'hole') {
      noise(t, 0.07, 'lowpass', 700, 0.8, 0.34, 0.002, 260);
      tone(t, 'sine', 150, 0.06, 0.18, 0.002, 90);
      return;
    }
    const f = kind === 'dealer' ? 1500 : 2100;
    noise(t, 0.03, 'bandpass', f, 1.4, 0.3, 0.001, f * 0.7);
  },
  /** Carte retournée. */
  flip(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    noise(t, 0.025, 'bandpass', 2600, 2, 0.3);
    noise(t + 0.06, 0.03, 'bandpass', 3600, 2, 0.22);
  },
  /** Clic boisé accordé (Jetons). `step` monte d'un demi-ton. */
  chip(step: number): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    const f = semi(330, Math.min(step, 30));
    tone(t, 'sine', f, 0.12, 0.35);
    tone(t, 'sine', f * 2.76, 0.05, 0.12);
    noise(t, 0.012, 'highpass', 6000, 0.7, 0.18);
  },
  /** Mult : même gamme, timbre plus rond et plus chaud. */
  mult(step: number): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    const f = semi(330, Math.min(step, 30));
    tone(t, 'triangle', f, 0.16, 0.32);
    tone(t, 'sine', f * 2, 0.1, 0.12);
    noise(t, 0.01, 'highpass', 5000, 0.7, 0.14);
  },
  /** ×Mult : un coup de cloche plus lourd. */
  xmult(step: number): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    const f = semi(330, Math.min(step, 30));
    tone(t, 'square', f / 2, 0.22, 0.12, 0.002, f / 2.1);
    tone(t, 'triangle', f, 0.3, 0.3);
    tone(t, 'sine', f * 1.5, 0.2, 0.14);
  },
  /** Cliquet de la Jauge (un cran). */
  ratchet(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    noise(t, 0.018, 'bandpass', 4200, 6, 0.4);
    tone(t, 'square', 1900, 0.012, 0.05);
  },
  /** Coup sourd : crevé. */
  thud(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    tone(t, 'sine', 120, 0.35, 0.9, 0.003, 38);
    noise(t, 0.2, 'lowpass', 600, 1, 0.5, 0.003, 120);
  },
  /** Le Mult se brise (défaite). */
  shatter(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    noise(t, 0.25, 'highpass', 3000, 1, 0.4, 0.002, 900);
    tone(t + 0.02, 'triangle', 1400, 0.08, 0.12);
    tone(t + 0.07, 'triangle', 1100, 0.08, 0.1);
    tone(t + 0.12, 'triangle', 900, 0.1, 0.08);
  },
  /** Arpège : table gagnée. */
  arpeggio(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    [0, 4, 7, 12, 16].forEach((n, i) => tone(t + i * 0.08, 'triangle', semi(392, n), 0.3, 0.28));
    tone(t + 0.4, 'sine', semi(392, 24), 0.5, 0.12);
  },
  /** Pièces (argent). */
  coin(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    tone(t, 'square', 1318, 0.05, 0.08);
    tone(t + 0.05, 'square', 1760, 0.12, 0.08);
    tone(t, 'sine', 2637, 0.15, 0.1);
  },
  /** Bouton pressé. */
  press(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    noise(t, 0.02, 'bandpass', 1500, 3, 0.25);
    tone(t, 'square', 180, 0.03, 0.05);
  },
  /** Refus (action impossible). */
  nope(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    tone(t, 'square', 140, 0.09, 0.08);
    tone(t + 0.1, 'square', 110, 0.12, 0.08);
  },
  /** Souffle (panneau qui arrive). */
  whoosh(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    noise(t, 0.22, 'bandpass', 500, 0.8, 0.18, 0.06, 2200);
  },
  /** Coup de tampon (annonce). */
  stamp(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    tone(t, 'sine', 90, 0.15, 0.6, 0.002, 50);
    noise(t, 0.06, 'lowpass', 1800, 1, 0.35);
  },
  /** Tic de compteur. */
  tick(): void {
    const c = ready();
    if (!c) return;
    noise(c.currentTime, 0.01, 'highpass', 7000, 0.7, 0.08);
  },
  /** Déchiqueteuse. */
  shred(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    for (let i = 0; i < 10; i++) noise(t + i * 0.035, 0.03, 'bandpass', 900 + (i % 3) * 400, 2, 0.3);
    tone(t, 'sawtooth', 70, 0.4, 0.08);
  },
  /** Entrée du patron : un coup grave et un bourdon qui descend. */
  boss(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    tone(t, 'sawtooth', 55, 1.1, 0.16, 0.05, 41);
    tone(t, 'sine', 82, 0.9, 0.4, 0.01, 55);
    noise(t, 0.5, 'lowpass', 400, 1, 0.3, 0.01, 90);
    tone(t + 0.35, 'triangle', 110, 0.6, 0.12, 0.02, 104);
  },
  /** Imprimante à ticket : une ligne. */
  print(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    for (let i = 0; i < 6; i++) noise(t + i * 0.022, 0.012, 'bandpass', 2400 + (i % 2) * 700, 4, 0.22);
    tone(t, 'square', 95, 0.13, 0.04);
  },
  /** Victoire de main : petite tierce. */
  win(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    tone(t, 'triangle', semi(523, 0), 0.12, 0.2);
    tone(t + 0.09, 'triangle', semi(523, 4), 0.2, 0.2);
  },
};
