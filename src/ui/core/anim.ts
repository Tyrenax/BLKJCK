/**
 * Horloge d'animation : interpolations, attentes et ressorts, tous pilotés par une seule boucle
 * requestAnimationFrame. La vitesse du jeu (×1 ×2 ×4) accélère tout ; « passer » termine tout.
 */

type Task = { step(dt: number): boolean; finish(): void };

const tasks = new Set<Task>();
const frameHooks = new Set<(dt: number, realDt: number) => void>();

export const clock = {
  /** Multiplicateur de vitesse (réglage ×1 ×2 ×4). */
  speed: 1,
  /** Vrai pendant un « passer » : toute nouvelle animation se termine immédiatement. */
  skipping: false,
  /** Temps écoulé (ms, accéléré). */
  now: 0,
};

let last = 0;
let running = false;

/** Capture d'écran sans tête : ?ff=1 cadence l'horloge sur des minuteries à pas fixe. */
const fixedStep = typeof location !== 'undefined' && new URLSearchParams(location.search).has('ff');

function loop(t: number): void {
  const realDt = fixedStep ? 16 : last ? Math.min(100, t - last) : 16;
  last = t;
  const dt = realDt * clock.speed;
  clock.now += dt;
  for (const task of [...tasks]) {
    if (task.step(dt)) tasks.delete(task);
  }
  for (const f of frameHooks) f(dt, realDt);
  if (stopped) return;
  if (fixedStep) setTimeout(() => loop(last + 16), 16);
  else requestAnimationFrame(loop);
}

let stopped = false;
/** Arrête la boucle (fin d'une traversée du robot : la capture sans tête peut se terminer). */
export function stopClock(): void {
  stopped = true;
}

export function startClock(): void {
  if (running) return;
  running = true;
  if (fixedStep) setTimeout(() => loop(16), 16);
  else requestAnimationFrame(loop);
}

/** Abonne une fonction à chaque image (dt accéléré, dt réel). Renvoie le désabonnement. */
export function onFrame(f: (dt: number, realDt: number) => void): () => void {
  frameHooks.add(f);
  return () => frameHooks.delete(f);
}

// ───────────── Courbes ─────────────

export type Ease = (t: number) => number;
export const ease = {
  /** Arrivée avec dépassement (ressort amorti). */
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  /** Arrivée vive sans rebond. */
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  /** Sortie rapide. */
  inCubic: (t: number) => t * t * t,
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  /** Ressort élastique (gros dépassement). */
  outElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3.2)) + 1;
  },
};

// ───────────── Interpolations et attentes ─────────────

/** Interpole de 0 à 1 sur `ms` (temps de jeu). Résout immédiatement en mode « passer ». */
export function tween(ms: number, update: (k: number, t: number) => void, curve: Ease = ease.outCubic): Promise<void> {
  return new Promise((resolve) => {
    if (clock.skipping || ms <= 0) {
      update(curve(1), 1);
      resolve();
      return;
    }
    let el = 0;
    const task: Task = {
      step(dt) {
        el += dt;
        const t = Math.min(1, el / ms);
        update(curve(t), t);
        if (t >= 1) {
          resolve();
          return true;
        }
        return false;
      },
      finish() {
        update(curve(1), 1);
        resolve();
      },
    };
    tasks.add(task);
  });
}

export function wait(ms: number): Promise<void> {
  return tween(ms, () => {});
}

/** Termine immédiatement toutes les animations en cours. */
export function finishAll(): void {
  for (const t of [...tasks]) {
    tasks.delete(t);
    t.finish();
  }
  for (const s of springs) s.snap();
}

// ───────────── Ressorts ─────────────

/** Ressort critique-amorti (ou presque) sur une valeur scalaire. */
export class Spring {
  value: number;
  target: number;
  vel = 0;
  constructor(v: number, public stiffness = 170, public damping = 18) {
    this.value = v;
    this.target = v;
  }
  step(dt: number): void {
    const s = Math.min(dt, 32) / 1000;
    const f = -this.stiffness * (this.value - this.target) - this.damping * this.vel;
    this.vel += f * s;
    this.value += this.vel * s;
  }
  snap(): void {
    this.value = this.target;
    this.vel = 0;
  }
  get settled(): boolean {
    return Math.abs(this.value - this.target) < 0.05 && Math.abs(this.vel) < 0.5;
  }
}

const springs = new Set<{ snap(): void }>();
export function registerSnappable(s: { snap(): void }): () => void {
  springs.add(s);
  return () => springs.delete(s);
}

// ───────────── Secousse d'écran ─────────────

export const shake = {
  enabled: true,
  amp: 0,
  left: 0,
  x: 0,
  y: 0,
};

/** Secousse courte (≤ 250 ms). */
export function shakeScreen(amp = 8, ms = 220): void {
  if (!shake.enabled || clock.skipping) return;
  shake.amp = Math.max(shake.amp, amp);
  shake.left = Math.min(250, Math.max(shake.left, ms));
}

onFrame((_dt, realDt) => {
  if (shake.left > 0) {
    shake.left -= realDt;
    const k = Math.max(0, shake.left / 220);
    shake.x = Math.round((Math.random() * 2 - 1) * shake.amp * k / 2) * 2;
    shake.y = Math.round((Math.random() * 2 - 1) * shake.amp * k / 2) * 2;
    if (shake.left <= 0) {
      shake.amp = 0;
      shake.x = 0;
      shake.y = 0;
    }
  }
});
