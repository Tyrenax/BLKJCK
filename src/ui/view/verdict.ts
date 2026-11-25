/**
 * Tampon de verdict : posé de travers près de la Jauge à la fin de la main, il reste jusqu'à
 * « Main suivante ». Titre en gothique, conséquence en dessous.
 */
import type { HandResult, Rules } from '../../engine/types';
import { sfx } from '../audio/sfx';
import { clock, ease, shakeScreen, tween } from '../core/anim';
import { el, place } from '../core/stage';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** Bande du tapis où le tampon peut se poser (scène) : de la colonne des atouts au panneau de score. */
const L = 336;
const R = 970;
const TOP = 226;

export function verdictText(r: Pick<HandResult, 'outcome' | 'dealerBust'>, rules: Rules | null): { title: string; sub: string; tone: string } {
  switch (r.outcome) {
    case 'win':
      return r.dealerBust
        ? { title: 'La banque saute', sub: 'le croupier a crevé', tone: 'petrole' }
        : { title: 'Victoire', sub: 'tu marques tout', tone: 'ivoire' };
    case 'push':
      return { title: 'Égalité', sub: rules && rules.pushMultKeep >= 1 ? 'ton Mult est sauf' : 'la banque prend la moitié de ton Mult', tone: 'cendre' };
    case 'loss':
      return { title: 'Défaite', sub: rules && rules.lossMultKeep > 0 ? 'la banque garde une part de ton Mult' : 'la banque garde ton Mult', tone: 'cerise' };
    case 'bust':
    default:
      return { title: 'Crevé', sub: 'la main ne marque rien', tone: 'cerise' };
  }
}

export class Verdict {
  readonly root: HTMLElement;
  private title: HTMLElement;
  private sub: HTMLElement;
  private shown = '';
  constructor(parent: HTMLElement) {
    this.root = place(el('div', 'verdict', parent), 356, 232);
    this.title = el('div', 'vd-title t-gothic', this.root);
    this.sub = el('div', 'vd-sub t-body', this.root);
    this.root.style.visibility = 'hidden';
  }

  /** Boîtes (scène) que le tampon ne doit jamais couvrir : étiquettes de la Jauge (croupier, limite, « crève »). */
  avoid: () => Box[] = () => [];
  /** Boîtes que le tampon évite s'il le peut (la règle de la Jauge). */
  prefer: () => Box[] = () => [];

  /**
   * Place du tampon : la première, dans l'ordre (gauche, droite, centre, puis un cran plus bas), dont la
   * boîte penchée ne touche aucune boîte à éviter et reste sur le tapis, entre la colonne des atouts
   * et le panneau de score.
   */
  private placeStamp(): void {
    const w = this.root.offsetWidth;
    const h = this.root.offsetHeight;
    const a = (7 * Math.PI) / 180;
    const bw = w * Math.cos(a) + h * Math.sin(a);
    const bh = w * Math.sin(a) + h * Math.cos(a);
    // sept places de gauche à droite (la gauche d'abord), puis la même rangée un cran plus bas
    const xs = Array.from({ length: 13 }, (_, i) => L + bw / 2 + ((R - L - bw) * i) / 12);
    const ys = [TOP + h / 2, TOP + 40 + h / 2];
    const boxes = this.avoid();
    const soft = this.prefer();
    const area = (b: Box, o: Box, m: number) => {
      const ow = Math.min(b.x + b.w, o.x + o.w + m) - Math.max(b.x, o.x - m);
      const oh = Math.min(b.y + b.h, o.y + o.h + m) - Math.max(b.y, o.y - m);
      return ow > 0 && oh > 0 ? ow * oh : 0;
    };
    let best: { cx: number; cy: number; hit: number } | null = null;
    for (const cy of ys) {
      for (const cx of xs) {
        const b = { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
        // une étiquette couverte coûte cent fois plus qu'un bout de règle
        let hit = 0;
        for (const o of boxes) hit += 100 * area(b, o, 6);
        for (const o of soft) hit += area(b, o, 0);
        if (!best || hit < best.hit) best = { cx, cy, hit };
        if (hit === 0) break;
      }
      if (best?.hit === 0) break;
    }
    if (!best) return;
    this.root.style.left = `${Math.round(best.cx - w / 2)}px`;
    this.root.style.top = `${Math.round(best.cy - h / 2)}px`;
  }

  /** Pose le tampon (animé). */
  async stamp(r: Pick<HandResult, 'outcome' | 'dealerBust'>, rules: Rules | null, animate = true): Promise<void> {
    const t = verdictText(r, rules);
    const key = `${t.title}|${t.sub}`;
    if (this.shown === key && this.root.style.visibility === 'visible') {
      this.placeStamp();
      return;
    }
    this.shown = key;
    this.title.textContent = t.title;
    this.sub.textContent = t.sub;
    this.root.className = `verdict tone-${t.tone}`;
    this.placeStamp();
    this.root.style.visibility = 'visible';
    if (!animate || clock.skipping) {
      this.root.style.transform = 'rotate(-7deg)';
      this.root.style.opacity = '1';
      return;
    }
    sfx.stamp();
    await tween(220, (k) => {
      this.root.style.transform = `rotate(${(-12 + 5 * k).toFixed(2)}deg) scale(${(1.9 - 0.9 * k).toFixed(3)})`;
      this.root.style.opacity = String(Math.min(1, k * 1.6));
    }, ease.inCubic);
    shakeScreen(4, 120);
    await tween(120, (k) => {
      this.root.style.transform = `rotate(-7deg) scale(${(1 - 0.04 * Math.sin(k * Math.PI)).toFixed(3)})`;
    }, ease.outCubic);
  }

  hide(): void {
    this.shown = '';
    this.root.style.visibility = 'hidden';
  }
}
