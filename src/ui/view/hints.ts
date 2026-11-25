/**
 * Indices de première partie : une étiquette épinglée près de l'objet concerné, une à la fois,
 * qui disparaît à l'action suivante. Chaque indice ne sert qu'une fois (mémorisé dans le navigateur).
 */
import { sfx } from '../audio/sfx';
import { clock, ease, tween } from '../core/anim';
import { el } from '../core/stage';

export type HintId = 'gauge' | 'score' | 'loss' | 'discard' | 'order';

export const HINT_TEXT: Record<HintId, string> = {
  gauge: "Chaque point au-dessus de la règle est une carte de ton sabot, posée là où elle t'amènerait.",
  score: "Jetons × Mult : la seule multiplication qu'on enseigne ici.",
  loss: 'Perdu : la banque garde ton Mult et te laisse tes Jetons, par pure bonté.',
  discard: "Défausser retire une carte de ta main ; une fois crevé, c'est trop tard.",
  order: "Tes atouts jouent de gauche à droite : glisse-les pour changer l'ordre.",
};

const KEY = 'sabot.hints';

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export class Hints {
  private seen = load();
  private tag: HTMLElement | null = null;
  private extras: HTMLElement[] = [];
  enabled = true;

  /** `under` : calque de la table ; la ficelle y passe SOUS les panneaux, les cartes et la Jauge (elle ne masque rien). */
  constructor(private layer: HTMLElement, private under: HTMLElement) {}

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify([...this.seen]));
    } catch {
      /* stockage indisponible : les indices reviendront, tant pis */
    }
  }

  has(id: HintId): boolean {
    return this.seen.has(id);
  }

  /**
   * Épingle un indice dans une zone libre du tapis (`at` = coin haut-gauche de l'étiquette),
   * avec une ficelle tendue de la punaise jusqu'à l'objet visé (`target`). Un indice ne cache
   * jamais une information de jeu : on choisit `at` hors des étiquettes et des cartes.
   */
  show(id: HintId, target: { x: number; y: number }, at: { x: number; y: number }, w = 250): void {
    if (!this.enabled || this.seen.has(id) || this.tag || clock.skipping) return;
    this.seen.add(id);
    this.save();
    const t = el('div', 'hint', this.layer);
    t.style.width = `${w}px`;
    t.style.left = `${Math.round(at.x / 2) * 2}px`;
    t.style.top = `${Math.round(at.y / 2) * 2}px`;
    const pin = el('div', 'hint-pin', t);
    el('div', 'hint-txt t-body', t, HINT_TEXT[id]);
    // la ficelle part du bord de l'étiquette le plus proche de la cible et passe derrière elle
    const h = t.offsetHeight;
    const anchors = [
      { x: w / 2, y: 0 },
      { x: w / 2, y: h },
      { x: 0, y: h / 2 },
      { x: w, y: h / 2 },
    ];
    const a = anchors.reduce((best, p) =>
      Math.hypot(target.x - (at.x + p.x), target.y - (at.y + p.y)) < Math.hypot(target.x - (at.x + best.x), target.y - (at.y + best.y)) ? p : best,
    );
    pin.style.left = `${Math.round(a.x) - 6}px`;
    pin.style.top = `${Math.round(a.y) - 6}px`;
    pin.style.marginLeft = '0';
    const sx = at.x + a.x;
    const sy = at.y + a.y;
    const dx = target.x - sx;
    const dy = target.y - sy;
    const str = el('div', 'hint-string');
    this.under.insertBefore(str, this.under.firstChild);
    str.style.left = `${Math.round(sx)}px`;
    str.style.top = `${Math.round(sy)}px`;
    str.style.width = `${Math.round(Math.hypot(dx, dy))}px`;
    str.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    const knot = el('div', 'hint-knot', this.layer);
    knot.style.left = `${Math.round(target.x) - 4}px`;
    knot.style.top = `${Math.round(target.y) - 4}px`;
    this.extras = [str, knot];
    this.tag = t;
    sfx.tick();
    void tween(260, (k) => {
      t.style.transform = `translateY(${(-16 * (1 - k)).toFixed(1)}px) scale(${(0.8 + 0.2 * k).toFixed(3)})`;
      t.style.opacity = String(Math.min(1, k * 2));
    }, ease.outBack);
  }

  /** L'indice part à l'action suivante. */
  dismiss(): void {
    const t = this.tag;
    if (!t) return;
    this.tag = null;
    for (const e of this.extras) e.remove();
    this.extras = [];
    void tween(140, (k) => {
      t.style.transform = `translateY(${(8 * k).toFixed(1)}px) scale(${(1 - 0.2 * k).toFixed(3)})`;
      t.style.opacity = String(1 - k);
    }, ease.inCubic).then(() => t.remove());
  }

  /** Réglage « Revoir les indices ». */
  reset(): void {
    this.seen.clear();
    this.save();
  }
}
