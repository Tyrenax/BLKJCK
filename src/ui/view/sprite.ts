/**
 * Un objet-carte de la scène (carte à jouer, atout, combine…). Il a du poids :
 * position sur ressorts, il penche dans le sens du déplacement, se soulève au survol
 * (l'ombre s'éloigne), s'incline en 3D sous le curseur et se retourne.
 */
import { clock, ease, onFrame, registerSnappable, Spring, tween, wait } from '../core/anim';
import { el, toStage } from '../core/stage';
import { CARD_H, CARD_W } from '../gfx/cardArt';

export interface SpriteOptions {
  /** Facteur d'affichage (2 = cartes de table, 1 = atouts dans la colonne). */
  size?: number;
  face: HTMLCanvasElement;
  back?: HTMLCanvasElement;
  faceUp?: boolean;
  parent: HTMLElement;
  x?: number;
  y?: number;
  className?: string;
}

const all = new Set<Sprite>();

export class Sprite {
  readonly root: HTMLDivElement;
  readonly inner: HTMLDivElement;
  readonly shadow: HTMLDivElement;
  readonly faceWrap: HTMLDivElement;
  readonly backWrap: HTMLDivElement;
  readonly overlay: HTMLDivElement;
  readonly size: number;
  readonly w: number;
  readonly h: number;

  x: Spring;
  y: Spring;
  /** Rotation de repos (éventail). */
  rot: Spring;
  scale: Spring;
  lift: Spring;
  /** Inclinaison 3D au survol. */
  tiltX = new Spring(0, 200, 20);
  tiltY = new Spring(0, 200, 20);
  /** Rotation supplémentaire (secousse d'un atout qui s'active). */
  wiggle = new Spring(0, 520, 9);
  /** Saut vertical (marquage). */
  hop = new Spring(0, 380, 16);

  faceUp: boolean;
  flipK = 1; // 1 = face visible, -1 = dos visible (échelle X pendant le retournement)
  hoverable = true;
  hovered = false;
  /** Survol forcé (sélection). */
  raised = false;
  z = 0;
  dead = false;
  private unsnap: () => void;
  private lastX = 0;
  private lean = 0;

  constructor(o: SpriteOptions) {
    this.size = o.size ?? 2;
    this.w = CARD_W * this.size;
    this.h = CARD_H * this.size;
    this.faceUp = o.faceUp ?? true;
    this.flipK = this.faceUp ? 1 : -1;
    this.x = new Spring(o.x ?? 0, 160, 19);
    this.y = new Spring(o.y ?? 0, 160, 19);
    this.rot = new Spring(0, 160, 16);
    this.scale = new Spring(1, 300, 18);
    this.lift = new Spring(0, 260, 20);
    this.lastX = this.x.value;

    this.root = el('div', `sprite ${o.className ?? ''}`, o.parent) as HTMLDivElement;
    this.root.style.width = `${this.w}px`;
    this.root.style.height = `${this.h}px`;
    this.shadow = el('div', 'sprite-shadow', this.root) as HTMLDivElement;
    this.inner = el('div', 'sprite-inner', this.root) as HTMLDivElement;
    this.faceWrap = el('div', 'sprite-face', this.inner) as HTMLDivElement;
    this.backWrap = el('div', 'sprite-back', this.inner) as HTMLDivElement;
    this.overlay = el('div', 'sprite-overlay', this.inner) as HTMLDivElement;
    this.root.style.setProperty('--sz', String(this.size));
    this.setFace(o.face);
    if (o.back) this.setBack(o.back);

    this.root.addEventListener('pointerenter', () => {
      this.hovered = true;
    });
    this.root.addEventListener('pointerleave', () => {
      this.hovered = false;
      this.tiltX.target = 0;
      this.tiltY.target = 0;
    });
    this.root.addEventListener('pointermove', (e) => {
      if (!this.hoverable) return;
      const p = toStage(e.clientX, e.clientY);
      const u = (p.x - this.x.value) / (this.w / 2);
      const v = (p.y - this.y.value) / (this.h / 2);
      this.tiltY.target = Math.max(-1, Math.min(1, u)) * 14;
      this.tiltX.target = -Math.max(-1, Math.min(1, v)) * 14;
    });

    this.unsnap = registerSnappable(this);
    all.add(this);
    this.render(0);
  }

  setFace(c: HTMLCanvasElement): void {
    this.faceWrap.innerHTML = '';
    c.style.width = `${this.w}px`;
    c.style.height = `${this.h}px`;
    this.faceWrap.appendChild(c);
  }

  setBack(c: HTMLCanvasElement): void {
    this.backWrap.innerHTML = '';
    c.style.width = `${this.w}px`;
    c.style.height = `${this.h}px`;
    this.backWrap.appendChild(c);
  }

  moveTo(x: number, y: number, rot?: number): void {
    this.x.target = x;
    this.y.target = y;
    if (rot !== undefined) this.rot.target = rot;
  }

  jump(x: number, y: number, rot = 0): void {
    this.x.value = this.x.target = x;
    this.y.value = this.y.target = y;
    this.rot.value = this.rot.target = rot;
    this.x.vel = this.y.vel = this.rot.vel = 0;
    this.lastX = x;
  }

  snap(): void {
    for (const s of [this.x, this.y, this.rot, this.scale, this.lift, this.wiggle, this.hop]) s.snap();
    this.flipK = this.faceUp ? 1 : -1;
    this.lean = 0;
    this.lastX = this.x.value;
  }

  /** Attend que la carte soit arrivée (ou un délai max). */
  async arrive(maxMs = 600): Promise<void> {
    if (clock.skipping) {
      this.snap();
      return;
    }
    let t = 0;
    await new Promise<void>((resolve) => {
      const off = onFrame((dt) => {
        t += dt;
        const d = Math.hypot(this.x.value - this.x.target, this.y.value - this.y.target);
        if (d < 6 || t > maxMs || clock.skipping) {
          off();
          resolve();
        }
      });
    });
  }

  /** Retourne la carte (face visible ou dos). */
  flip(faceUp: boolean, ms = 240): Promise<void> {
    if (this.faceUp === faceUp && Math.abs(this.flipK) === 1) return Promise.resolve();
    const from = this.flipK;
    const to = faceUp ? 1 : -1;
    this.faceUp = faceUp;
    return tween(ms, (k) => {
      this.flipK = from + (to - from) * k;
    }, ease.inOut);
  }

  /** Petit saut (marquage). */
  bump(power = 1): void {
    this.hop.vel = -900 * power;
    this.scale.vel = 6 * power;
  }

  /** Grossit nettement puis revient (atout qui paie) : on voit QUI vient de payer. */
  pulse(to = 1.5, ms = 320): void {
    if (clock.skipping) return;
    this.scale.target = to;
    this.scale.vel = 8;
    const z = this.z;
    this.z = 950;
    void wait(ms).then(() => {
      this.scale.target = 1;
      this.z = z;
    });
  }

  /** Secousse (atout qui s'active). */
  shakeIt(power = 1): void {
    this.wiggle.vel = (Math.random() > 0.5 ? 1 : -1) * 420 * power;
    this.scale.vel = 5 * power;
  }

  step(dt: number): void {
    for (const s of [this.x, this.y, this.rot, this.scale, this.lift, this.tiltX, this.tiltY, this.wiggle, this.hop]) s.step(dt);
    this.lift.target = this.hoverable && (this.hovered || this.raised) ? 1 : 0;
    const vx = (this.x.value - this.lastX) / Math.max(1, dt) * 16;
    this.lastX = this.x.value;
    this.lean += (Math.max(-14, Math.min(14, vx * 0.9)) - this.lean) * Math.min(1, dt / 60);
    this.render(dt);
  }

  private render(_dt: number): void {
    const lift = this.lift.value;
    const ly = -lift * 10 * (this.size / 2) + this.hop.value * (this.size / 2);
    const tx = this.x.value - this.w / 2;
    const ty = this.y.value - this.h / 2 + ly;
    const r = this.rot.value + this.lean + this.wiggle.value * 0.05;
    const s = this.scale.value * (1 + lift * 0.04);
    this.root.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) rotate(${r.toFixed(2)}deg) scale(${s.toFixed(3)})`;
    this.root.style.zIndex = String(this.z + (lift > 0.5 ? 100 : 0));
    const fk = this.flipK;
    const showFace = fk >= 0;
    this.faceWrap.style.visibility = showFace ? '' : 'hidden';
    this.backWrap.style.visibility = showFace ? 'hidden' : '';
    this.overlay.style.visibility = showFace ? '' : 'hidden';
    const sx = Math.max(0.02, Math.abs(fk));
    this.inner.style.transform = `perspective(600px) rotateX(${this.tiltX.value.toFixed(2)}deg) rotateY(${this.tiltY.value.toFixed(2)}deg) scaleX(${sx.toFixed(3)})`;
    const off = (4 + lift * 6 - this.hop.value * 0.02) * (this.size / 2) * 2;
    this.shadow.style.transform = `translate(${(lift * 3).toFixed(1)}px, ${off.toFixed(1)}px) scaleX(${sx.toFixed(3)})`;
  }

  destroy(): void {
    this.dead = true;
    this.unsnap();
    all.delete(this);
    this.root.remove();
  }
}

onFrame((dt) => {
  for (const s of all) s.step(dt);
});
