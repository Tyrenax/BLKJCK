/**
 * La Jauge : règle graduée en laiton posée en travers du tapis, de 0 à la limite, zone Bordeaux
 * « crève » au-delà, butée au bout. Ton total = aiguille (élan, rebond, tremblement près de la limite).
 * Total visible du croupier = curseur au-dessus ; son seuil d'arrêt = cran gravé.
 * Quand la limite change, la règle s'allonge ou se fait rogner, cran par cran, au bruit de cliquet.
 *
 * Le spectre du prochain tirage : pendant ton tour, chaque carte restante de ton sabot est un
 * point empilé à la graduation où elle t'amènerait. Ceux qui font crever s'empilent dans le Bordeaux.
 */
import type { Card } from '../../engine/types';
import { sfx } from '../audio/sfx';
import { clock, ease, onFrame, registerSnappable, Spring, tween } from '../core/anim';
import { col } from '../core/palette';
import { el, place, stageRect } from '../core/stage';
import { ctx2d, drawMask, makeCanvas, maskFromRows, rect, type Mask } from '../gfx/pixel';
import { attachTip } from './tooltip';

const LW = 344; // largeur logique (×2 à l'écran)
const SPEC_H = 42; // hauteur logique du spectre (au-dessus de la règle)
const RULER_H = 30;
const LH = SPEC_H + RULER_H + 8;
const ORIGIN = 8; // x logique du 0
const RULER_Y = SPEC_H + 2;
const BUST_POINTS = 3;
/**
 * Les étiquettes « toi » / « croupier » suivent leur curseur mais restent entre la colonne des atouts
 * (bord droit à x = 330 sur la scène) et le panneau de score (x = 978) : coordonnées de la Jauge.
 */
const TAG_MIN = 40;
const TAG_MAX = 676;
function tagLeft(x: number, w: number): number {
  return Math.round(Math.max(TAG_MIN, Math.min(TAG_MAX - w, x - w / 2)));
}
const DOT = 4;
const DOT_STEP = 5;
export const GAUGE_X = 296;
export const GAUGE_Y = 214;
const CANVAS_TOP = 34; // unités, dans la racine de la Jauge

const DIGITS: Record<string, string[]> = {
  '0': ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
  '1': ['.X.', 'XX.', '.X.', '.X.', 'XXX'],
  '2': ['XXX', '..X', 'XXX', 'X..', 'XXX'],
  '3': ['XXX', '..X', '.XX', '..X', 'XXX'],
  '4': ['X.X', 'X.X', 'XXX', '..X', '..X'],
  '5': ['XXX', 'X..', 'XXX', '..X', 'XXX'],
  '6': ['XXX', 'X..', 'XXX', 'X.X', 'XXX'],
  '7': ['XXX', '..X', '.X.', '.X.', '.X.'],
  '8': ['XXX', 'X.X', 'XXX', 'X.X', 'XXX'],
  '9': ['XXX', 'X.X', 'XXX', '..X', 'XXX'],
};
const digitMasks: Record<string, Mask> = Object.fromEntries(Object.entries(DIGITS).map(([k, v]) => [k, maskFromRows(v)]));

function engrave(g: CanvasRenderingContext2D, n: number, cx: number, y: number, color: string): void {
  const s = String(n);
  const w = s.length * 4 - 1;
  let x = Math.round(cx - w / 2);
  for (const ch of s) {
    drawMask(g, digitMasks[ch], x, y, color);
    x += 4;
  }
}

interface Dot {
  id: number;
  x: Spring;
  y: Spring;
  bust: boolean;
  next: boolean;
  alive: boolean;
  /** Place dans le spectre, en valeur (pas en pixels) : suit la règle quand elle s'allonge. */
  total: number;
  /** Rang dans sa pile (colonne et ligne calculées à chaque image). */
  index: number;
}

export class Gauge {
  readonly root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private spec: HTMLCanvasElement;
  private sg: CanvasRenderingContext2D;
  private needle: HTMLElement;
  private ghost: HTMLElement;
  private cursor: HTMLElement;
  private pTag: HTMLElement;
  private dTag: HTMLElement;
  private limitTag: HTMLElement;
  private bustWord: HTMLElement;
  private risk: HTMLElement;
  private bustFlash: HTMLElement;
  private duel: HTMLElement;

  readonly limit = new Spring(21, 70, 13);
  readonly needleS = new Spring(0, 150, 10);
  readonly dealerS = new Spring(0, 150, 13);
  private drawnLimit = -1;
  private drawnStand = -1;
  private drawnDealerLimit = -1;
  private lastCrossed = 21;
  standOn = 17;
  dealerLimit = 21;
  /** Butée de la maison : la limite ne dépassera jamais cette valeur (balance.maxPlayerLimit). */
  maxLimit: number | null = null;
  private houseStop: HTMLElement;
  /** Entrée de la butée de la maison (0 = absente, 1 = vissée). */
  private houseK = 0;
  private houseOn = false;
  private drawnHouseK = -1;
  /** Limite du croupier de base (balance) : la butée Pétrole se montre quand elle en diffère. */
  baseDealerLimit = 21;
  private dLimit: HTMLElement;
  private dLimitS = new Spring(21, 120, 12);
  private dLimitShown = false;
  total = 0;
  soft = false;
  dealerTotal = 0;
  showPlayer = false;
  showDealer = false;
  busted = false;
  dealerBusted = false;
  /** Duel visible (le croupier a joué) : bande entre son curseur et ton aiguille. */
  duelOn = false;
  private tremble = 0;
  private dots = new Map<number, Dot>();
  private specVisible = false;
  private specEnabled = true;
  private riskPct = 0;
  private riskShown = false;
  private bustCX = 0;
  private bustTop = 0;
  /** Largeur des étiquettes « toi » / « croupier » (relue quand leur texte change). */
  private pTagW = 0;
  private dTagW = 0;

  constructor(parent: HTMLElement) {
    this.root = place(el('div', 'gauge', parent), GAUGE_X, GAUGE_Y, LW * 2, 230);
    this.spec = makeCanvas(LW, SPEC_H + 2);
    this.spec.className = 'gauge-spec';
    this.root.appendChild(this.spec);
    this.sg = ctx2d(this.spec);
    this.canvas = makeCanvas(LW, LH);
    this.canvas.className = 'gauge-canvas';
    this.root.appendChild(this.canvas);
    this.g = ctx2d(this.canvas);
    this.root.appendChild(this.spec); // le spectre passe devant le cadre de la règle
    this.duel = el('div', 'gauge-duel', this.root);
    this.bustFlash = el('div', 'gauge-bustflash', this.root);
    this.limitTag = el('div', 'gauge-limit t-num', this.root);
    this.bustWord = el('div', 'gauge-bustword t-num', this.root, 'crève');
    // étiquettes gravées sur la règle (voulu) : l'audit de mise en page les laisse sur leur dessin
    for (const e of [this.limitTag, this.bustWord]) e.dataset.onArt = '1';
    this.risk = el('div', 'gauge-risk t-num', this.root);
    this.risk.dataset.onArt = '1';
    this.houseStop = el('div', 'gauge-housestop', this.root);
    this.dLimit = el('div', 'gauge-dlimit', this.root);
    el('div', 'gdl-post', this.dLimit);
    el('div', 'gdl-lab t-num', this.dLimit, 'il crève');
    attachTip(this.dLimit, () => ({ name: `Le croupier crève au-delà de ${this.dealerLimit}`, body: this.dealerLimit < this.limit.target ? 'Il saute plus tôt que toi.' : 'Il tient plus longtemps que toi.' }));
    attachTip(this.houseStop, () => (this.maxLimit !== null ? { name: 'Butée de la maison', body: `Vissée dans le tapis : ta limite ne dépassera jamais ${this.maxLimit}.` } : null));
    this.ghost = el('div', 'gauge-ghost', this.root);
    this.cursor = el('div', 'gauge-cursor', this.root);
    this.needle = el('div', 'gauge-needle', this.root);
    this.pTag = el('div', 'gauge-tag ptag', this.root);
    this.dTag = el('div', 'gauge-tag dtag', this.root);
    attachTip(this.spec, () =>
      this.specVisible
        ? { name: 'Spectre du prochain tirage', body: `Chaque point est une carte de ton sabot, posée là où elle t'amènerait. Crève : ${this.riskPct} %.` }
        : null,
    );
    attachTip(this.limitTag, () => ({ name: `Limite ${Math.round(this.limit.target)}`, body: 'Ton dernier total sûr. Au-delà, tu crèves.' }));
    attachTip(this.bustWord, () => ({ name: 'Crève', body: `Au-delà de ${Math.round(this.limit.target)}, la main ne marque rien.` }));
    registerSnappable({
      snap: () => {
        this.limit.snap();
        this.needleS.snap();
        this.dealerS.snap();
        for (const d of this.dots.values()) {
          d.x.snap();
          d.y.snap();
        }
      },
    });
    onFrame((dt) => this.step(dt));
  }

  /** Pixels logiques par point (la règle se tasse si la limite devient très grande). */
  private ppp(limit: number): number {
    const span = Math.max(limit + BUST_POINTS, (this.maxLimit ?? 0) + 1.5);
    return Math.min(12, (LW - ORIGIN - 10) / span);
  }

  setMaxLimit(n: number | null): void {
    if (this.maxLimit === n) return;
    this.maxLimit = n;
    this.drawnLimit = -1;
  }

  /** Position x (unités de scène, relative à la Jauge) d'une valeur. */
  xOf(v: number): number {
    return (ORIGIN + v * this.ppp(this.limit.value)) * 2;
  }

  setRules(limit: number, standOn: number, dealerLimit: number, instant = false): void {
    this.limit.target = limit;
    this.standOn = standOn;
    const moved = dealerLimit !== this.dealerLimit;
    this.dealerLimit = dealerLimit;
    this.dLimitS.target = dealerLimit;
    if (instant) {
      this.limit.snap();
      this.dLimitS.snap();
      this.lastCrossed = limit;
    } else if (moved && this.dLimitShown && !clock.skipping) {
      // la butée du croupier bouge sous les yeux du joueur
      sfx.ratchet();
      this.dLimit.classList.remove('bump');
      void this.dLimit.offsetWidth;
      this.dLimit.classList.add('bump');
    }
  }

  setPlayer(total: number, soft: boolean, visible = true): void {
    this.total = total;
    this.soft = soft;
    this.showPlayer = visible;
    if (!this.busted) this.needleS.target = total;
  }

  setDealer(total: number, visible = true): void {
    this.dealerTotal = total;
    this.showDealer = visible;
    if (!this.dealerBusted) this.dealerS.target = total;
    // texte posé tout de suite : sa largeur sert au tampon de verdict, qui l'évite
    const dtxt = `<span class="who">croupier</span>${total}`;
    if (this.dTag.innerHTML !== dtxt) {
      this.dTag.innerHTML = dtxt;
      this.dTagW = this.dTag.offsetWidth;
    }
  }

  /** L'aiguille tape la butée. */
  bust(on: boolean): void {
    this.busted = on;
    this.needleS.target = on ? this.limit.target + BUST_POINTS + 0.4 : this.total;
    if (on) {
      this.needleS.vel = 60;
      this.bustFlash.classList.remove('go');
      void this.bustFlash.offsetWidth;
      this.bustFlash.classList.add('go');
    }
  }

  dealerBust(on: boolean): void {
    this.dealerBusted = on;
    this.dealerS.target = on ? this.limit.target + BUST_POINTS + 0.4 : this.dealerTotal;
    if (on) this.dealerS.vel = 60;
  }

  reset(): void {
    this.busted = false;
    this.dealerBusted = false;
    this.showPlayer = false;
    this.showDealer = false;
    this.duelOn = false;
    this.total = 0;
    this.dealerTotal = 0;
    this.needleS.target = 0;
    this.dealerS.target = 0;
    this.setSpectrum(null);
  }

  setSpectrumEnabled(on: boolean): void {
    this.specEnabled = on;
    if (!on) this.setSpectrum(null);
  }

  /**
   * Spectre : pour chaque carte restante, le total qu'elle donnerait.
   * `entries` = null pour masquer (les points retombent dans la règle).
   */
  setSpectrum(entries: { card: Card; total: number }[] | null, next: Card | null = null): void {
    const show = !!entries && this.specEnabled && entries.length > 0;
    this.specVisible = show;
    const limit = this.limit.target;
    const p = this.ppp(limit);
    const seen = new Set<number>();
    if (show) {
      // regroupe par total ; au-delà de la limite, un seul tas dans le Bordeaux
      const byTotal = new Map<number, Card[]>();
      const bust: Card[] = [];
      for (const e of entries!) {
        if (e.total > limit) bust.push(e.card);
        else {
          const k = e.total;
          if (!byTotal.has(k)) byTotal.set(k, []);
          byTotal.get(k)!.push(e.card);
        }
      }
      const placeDot = (c: Card, x: number, y: number, isBust: boolean, total: number, index: number) => {
        seen.add(c.id);
        let d = this.dots.get(c.id);
        if (!d) {
          d = { id: c.id, x: new Spring(x, 120, 15), y: new Spring(SPEC_H + 4, 120, 15), bust: isBust, next: false, alive: true, total, index };
          this.dots.set(c.id, d);
        }
        d.alive = true;
        d.bust = isBust;
        d.total = total;
        d.index = index;
        d.next = !!next && next.id === c.id;
        d.x.target = x;
        d.y.target = y;
      };
      for (const [total, cards] of byTotal) {
        const cx = ORIGIN + total * p;
        const cols = 2;
        cards.forEach((c, i) => {
          const colI = i % cols;
          const row = Math.floor(i / cols);
          placeDot(c, Math.round(cx - DOT + colI * DOT_STEP), SPEC_H - DOT - row * DOT_STEP, false, total, i);
        });
      }
      const x0 = ORIGIN + limit * p + 2;
      const zoneW = Math.max(DOT_STEP, BUST_POINTS * p - 3);
      const cols = Math.max(1, Math.floor(zoneW / DOT_STEP));
      bust.forEach((c, i) => {
        const colI = i % cols;
        const row = Math.floor(i / cols);
        placeDot(c, Math.round(x0 + colI * DOT_STEP), SPEC_H - DOT - row * DOT_STEP, true, 0, i);
      });
      this.riskPct = Math.round((bust.length / entries!.length) * 100);
      this.risk.textContent = `${this.riskPct} %`;
    }
    this.risk.style.visibility = show ? 'visible' : 'hidden';
    if (show !== this.riskShown) {
      this.riskShown = show;
      this.placeBustLabels();
      // pendant ton tour, le spectre occupe le haut de la Jauge : l'étiquette « il crève » du poteau
      // du croupier s'efface (le poteau reste) et revient quand le croupier joue
      this.dLimit.classList.toggle('quiet', show);
    }
    for (const d of this.dots.values()) {
      if (!seen.has(d.id)) {
        d.alive = false;
        d.y.target = SPEC_H + 6; // retombe dans la règle
      }
    }
  }

  /** 0..1 : proximité de la limite (pour la fumée et le tremblement). */
  /** « crève » dans le Bordeaux ; le risque du prochain tirage écrit juste dessous, dans la même zone. */
  private placeBustLabels(): void {
    const t = `translateX(${this.bustCX}px) translateX(-50%)`;
    this.bustWord.style.transform = t;
    this.bustWord.style.top = `${this.bustTop + (this.riskShown ? 7 : 18)}px`;
    this.risk.style.transform = t;
    this.risk.style.top = `${this.bustTop + 31}px`;
  }

  /** Boîte de l'étiquette du croupier, en coordonnées de scène, à sa position d'arrivée (le tampon l'évite). */
  dealerTagBox(): { x: number; y: number; w: number; h: number } | null {
    if (!this.showDealer) return null;
    const w = this.dTagW || this.dTag.offsetWidth;
    // position d'arrivée du curseur (dans la zone « crève » s'il a crevé)
    const x = tagLeft((ORIGIN + Math.min(this.limit.target + BUST_POINTS + 0.4, Math.max(0, this.dealerS.target)) * this.ppp(this.limit.target)) * 2, w);
    return { x: this.root.offsetLeft + x, y: this.root.offsetTop + this.dTag.offsetTop, w, h: this.dTag.offsetHeight + 4 };
  }

  /** La règle elle-même (scène) : le tampon l'évite si possible, sans que ce soit interdit. */
  rulerBox(): { x: number; y: number; w: number; h: number } {
    return { x: this.root.offsetLeft, y: this.root.offsetTop + this.bustTop - 12, w: LW * 2, h: RULER_H * 2 + 24 };
  }

  /** Ce que le tampon de verdict ne doit pas couvrir : étiquette du croupier, limite, « crève », butée du croupier. */
  avoidBoxes(): { x: number; y: number; w: number; h: number }[] {
    const out: { x: number; y: number; w: number; h: number }[] = [];
    const d = this.dealerTagBox();
    if (d) out.push(d);
    for (const e of [this.limitTag, this.bustWord, this.risk, this.dLimit]) {
      if (e.style.visibility === 'hidden') continue;
      const r = stageRect(e);
      if (r.w > 0 && r.h > 0) out.push(r);
    }
    return out;
  }

  heat(): number {
    if (!this.showPlayer) return 0;
    if (this.busted) return 1;
    const l = this.limit.target;
    return Math.max(0, Math.min(1, (this.total - (l - 7)) / 7));
  }

  private step(dt: number): void {
    this.limit.step(dt);
    this.needleS.step(dt);
    this.dealerS.step(dt);
    // cliquet à chaque cran franchi quand la règle s'allonge ou se rogne
    const crossed = Math.round(this.limit.value);
    if (crossed !== this.lastCrossed) {
      this.lastCrossed = crossed;
      if (!clock.skipping && this.root.style.visibility !== 'hidden') sfx.ratchet();
    }
    const L = this.limit.value;
    // butée de la maison : elle n'entre en scène qu'à l'approche du plafond, et se visse
    // (à 1 cran ou au plafond : avec un plafond de 23 et une base de 21, « 2 crans » la montrerait toujours)
    const houseOn = this.maxLimit !== null && this.limit.target >= this.maxLimit - 1;
    if (houseOn && !this.houseOn) {
      this.houseOn = true;
      if (clock.skipping || this.root.style.visibility === 'hidden') this.houseK = 1;
      else {
        sfx.ratchet();
        void tween(420, (k) => (this.houseK = k), ease.outBack).then(() => sfx.ratchet());
      }
    } else if (!houseOn && this.houseOn) {
      this.houseOn = false;
      this.houseK = 0;
    }
    if (Math.abs(L - this.drawnLimit) > 0.01 || this.standOn !== this.drawnStand || this.dealerLimit !== this.drawnDealerLimit || this.houseK !== this.drawnHouseK) {
      this.draw(L);
    }
    // butée du croupier (Pétrole, au-dessus de la règle) quand sa limite diffère
    this.dLimitS.step(dt);
    const showD = this.dealerLimit !== this.baseDealerLimit || this.dealerLimit !== Math.round(this.limit.target);
    this.dLimitShown = showD;
    this.dLimit.style.visibility = showD ? 'visible' : 'hidden';
    if (showD) this.dLimit.style.transform = `translateX(${Math.round(this.xOf(this.dLimitS.value))}px)`;
    this.drawSpectrum(dt);
    const p = this.ppp(L);
    const maxV = L + BUST_POINTS + 0.4;
    // tremblement près de la limite
    const h = this.heat();
    this.tremble = h > 0.4 && !this.busted ? (Math.random() * 2 - 1) * (h - 0.4) * 5 : 0;
    const nv = Math.min(maxV, Math.max(0, this.needleS.value));
    const nx = (ORIGIN + nv * p) * 2 + this.tremble;
    this.needle.style.transform = `translateX(${Math.round(nx)}px)`;
    this.needle.style.visibility = this.showPlayer ? 'visible' : 'hidden';
    this.pTag.style.visibility = this.showPlayer ? 'visible' : 'hidden';
    const ptxt = `<span class="who">toi</span>${this.total}`;
    if (this.pTag.innerHTML !== ptxt) {
      this.pTag.innerHTML = ptxt;
      this.pTagW = this.pTag.offsetWidth;
    }
    this.pTag.style.transform = `translateX(${tagLeft(nx, this.pTagW)}px)`;
    this.pTag.classList.toggle('hot', h >= 0.72 && !this.busted);
    this.pTag.classList.toggle('bust', this.busted);
    const gv = this.total - 10;
    const showGhost = this.showPlayer && this.soft && !this.busted && gv >= 0;
    this.ghost.style.visibility = showGhost ? 'visible' : 'hidden';
    this.ghost.style.transform = `translateX(${Math.round((ORIGIN + gv * p) * 2)}px)`;
    const dv = Math.min(maxV, Math.max(0, this.dealerS.value));
    const dx = (ORIGIN + dv * p) * 2;
    this.cursor.style.transform = `translateX(${Math.round(dx)}px)`;
    this.cursor.style.visibility = this.showDealer ? 'visible' : 'hidden';
    this.dTag.style.visibility = this.showDealer ? 'visible' : 'hidden';
    const dtxt = `<span class="who">croupier</span>${this.dealerTotal}`;
    if (this.dTag.innerHTML !== dtxt) {
      this.dTag.innerHTML = dtxt;
      this.dTagW = this.dTag.offsetWidth;
    }
    this.dTag.style.transform = `translateX(${tagLeft(dx, this.dTagW)}px)`;
    this.dTag.classList.toggle('bust', this.dealerBusted);
    // duel : bande sur la règle entre le croupier et toi
    const duel = this.duelOn && this.showDealer && this.showPlayer && !this.busted && !this.dealerBusted;
    this.duel.style.visibility = duel ? 'visible' : 'hidden';
    if (duel) {
      const a = Math.min(nx, dx);
      const b = Math.max(nx, dx);
      this.duel.style.left = `${Math.round(a)}px`;
      this.duel.style.width = `${Math.max(4, Math.round(b - a))}px`;
      this.duel.classList.toggle('lead', this.total > this.dealerTotal);
      this.duel.classList.toggle('behind', this.total < this.dealerTotal);
    }
  }

  private drawSpectrum(dt: number): void {
    const g = this.sg;
    g.clearRect(0, 0, LW, SPEC_H + 2);
    if (!this.dots.size) return;
    const ivoire = col('ivoire');
    const cerise = col('cerise');
    const nuit = col('nuit');
    // les points suivent la règle : x recalculé depuis la limite courante (elle peut être en train de s'allonger)
    const L = this.limit.value;
    const p = this.ppp(L);
    const bustCols = Math.max(1, Math.floor(Math.max(DOT_STEP, BUST_POINTS * p - 3) / DOT_STEP));
    for (const [id, d] of this.dots) {
      if (d.alive) {
        if (d.bust) {
          d.x.target = Math.round(ORIGIN + L * p + 2 + (d.index % bustCols) * DOT_STEP);
          d.y.target = SPEC_H - DOT - Math.floor(d.index / bustCols) * DOT_STEP;
        } else d.x.target = Math.round(ORIGIN + d.total * p - DOT + (d.index % 2) * DOT_STEP);
      }
      d.x.step(dt);
      d.y.step(dt);
      if (!d.alive && d.y.value > SPEC_H + 2) {
        this.dots.delete(id);
        continue;
      }
      const x = Math.round(d.x.value);
      const y = Math.round(d.y.value);
      if (d.next) {
        rect(g, x - 2, y - 2, DOT + 4, DOT + 4, nuit);
        rect(g, x - 1, y - 1, DOT + 2, DOT + 2, ivoire);
        rect(g, x, y, DOT, DOT, d.bust ? cerise : nuit);
      } else {
        rect(g, x, y + 1, DOT, DOT, nuit);
        rect(g, x, y, DOT, DOT, d.bust ? cerise : ivoire);
      }
    }
  }

  private draw(L: number): void {
    this.drawnLimit = L;
    this.drawnStand = this.standOn;
    this.drawnDealerLimit = this.dealerLimit;
    const g = this.g;
    g.clearRect(0, 0, LW, LH);
    const p = this.ppp(L);
    const xL = Math.round(ORIGIN + L * p);
    const xB = Math.round(ORIGIN + (L + BUST_POINTS) * p);
    const y0 = RULER_Y;
    const y1 = RULER_Y + RULER_H;
    // ombre portée dure
    rect(g, ORIGIN - 3, y0 + 3, xB - ORIGIN + 10, RULER_H + 2, col('nuit'));
    // zone crève : Bordeaux hachuré
    rect(g, xL, y0 - 1, xB - xL + 1, RULER_H + 2, col('nuit'));
    rect(g, xL + 1, y0, xB - xL - 1, RULER_H, col('bordeaux'));
    for (let y = y0; y < y1; y++) {
      for (let x = xL + 1; x < xB; x++) if ((x + y) % 6 < 2) rect(g, x, y, 1, 1, col('bordeaux-sombre'));
    }
    // butée
    rect(g, xB, y0 - 6, 6, RULER_H + 12, col('nuit'));
    rect(g, xB + 1, y0 - 5, 4, RULER_H + 10, col('cendre-sombre'));
    rect(g, xB + 1, y0 - 5, 1, RULER_H + 10, col('cendre'));
    // corps de la règle en laiton (biseau clair en haut, tranche sombre en bas)
    rect(g, ORIGIN - 4, y0 - 1, xL - ORIGIN + 5, RULER_H + 2, col('nuit'));
    rect(g, ORIGIN - 3, y0, xL - ORIGIN + 3, RULER_H, col('laiton-sombre'));
    rect(g, ORIGIN - 3, y0, xL - ORIGIN + 3, RULER_H - 4, col('laiton'));
    rect(g, ORIGIN - 3, y0, xL - ORIGIN + 3, 1, col('laiton-clair'));
    rect(g, ORIGIN - 3, y0 + 1, xL - ORIGIN + 3, 1, col('laiton-clair'));
    // graduations : un cran par point, plus long tous les 5 ; les nombres gravés
    const top = Math.floor(L + 0.001);
    for (let v = 0; v <= top; v++) {
      const x = Math.round(ORIGIN + v * p);
      const long = v % 5 === 0;
      rect(g, x, y0 + 2, 1, long ? 9 : 5, col('laiton-nuit'));
      const showNum = v === 0 || v % 5 === 0 || v >= Math.max(11, top - 10);
      if (showNum && v < top - 1) engrave(g, v, x + 0.5, y0 + 13, col('laiton-nuit'));
    }
    // cran du croupier (seuil d'arrêt) : encoche en V dans le bord haut
    if (this.standOn <= L + BUST_POINTS) {
      const xs = Math.round(ORIGIN + this.standOn * p);
      for (let k = 0; k < 5; k++) rect(g, xs - 4 + k, y0 - 1 + k, 9 - 2 * k, 1, col('nuit'));
      rect(g, xs, y0 + 4, 1, 3, col('petrole-pale'));
    }
    // butée de la maison, vissée dans le tapis : la règle ne passera jamais au-delà
    this.drawnHouseK = this.houseK;
    if (this.maxLimit !== null && this.houseK > 0) {
      const xm = Math.round(ORIGIN + this.maxLimit * p) + 3;
      const dy = Math.round((1 - this.houseK) * -18);
      rect(g, xm, y0 - 9 + dy, 8, RULER_H + 18, col('nuit'));
      rect(g, xm + 1, y0 - 8 + dy, 6, RULER_H + 16, col('plomb'));
      rect(g, xm + 1, y0 - 8 + dy, 1, RULER_H + 16, col('plomb-clair'));
      for (const sy of [y0 - 6, y1 + 3]) {
        rect(g, xm + 2, sy + dy, 4, 4, col('nuit'));
        rect(g, xm + 3, sy + 1 + dy, 2, 1, col('plomb-clair'));
      }
      this.houseStop.style.left = `${xm * 2}px`;
      this.houseStop.style.top = `${CANVAS_TOP + (y0 - 9) * 2}px`;
      this.houseStop.style.height = `${(RULER_H + 18) * 2}px`;
      this.houseStop.style.visibility = 'visible';
    } else this.houseStop.style.visibility = 'hidden';
    // poteau de limite : sombre et franc, comme la butée
    rect(g, xL - 3, y0 - 6, 6, RULER_H + 12, col('nuit'));
    rect(g, xL - 2, y0 - 5, 4, RULER_H + 10, col('laiton-nuit'));
    rect(g, xL - 2, y0 - 5, 1, RULER_H + 10, col('laiton-sombre'));

    // étiquettes DOM : la limite côté laiton, « crève » dans le Bordeaux
    const top0 = CANVAS_TOP + y0 * 2;
    this.limitTag.textContent = String(Math.round(L));
    this.limitTag.style.transform = `translateX(${(xL - 3) * 2}px) translateX(-100%)`;
    this.limitTag.style.top = `${top0 + 6}px`;
    this.bustCX = Math.round((xL + xB) / 2) * 2;
    this.bustTop = top0;
    this.placeBustLabels();
    this.bustFlash.style.left = `${xL * 2}px`;
    this.bustFlash.style.width = `${(xB - xL) * 2}px`;
    this.bustFlash.style.top = `${top0}px`;
    this.duel.style.top = `${top0 - 2}px`;
  }
}

export const GAUGE_GEOM = { CANVAS_TOP, RULER_Y, RULER_H, SPEC_H };
