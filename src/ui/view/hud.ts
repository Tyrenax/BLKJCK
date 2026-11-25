/**
 * Panneaux d'information : plaque de table (haut gauche), compteur Jetons × Mult et
 * progression (droite), et la bande mains / défausses / argent.
 */
import type { BossDef, TableKind } from '../../engine/types';
import { sfx } from '../audio/sfx';
import { clock, ease, shakeScreen, tween, wait } from '../core/anim';
import { col } from '../core/palette';
import { el, place, stageRect } from '../core/stage';
import { drawEmblem } from '../gfx/cardArt';
import { flash, pop, shards } from './fx';
import { attachTip, colorize } from './tooltip';

export function fmt(n: number): string {
  const neg = n < 0;
  const a = Math.abs(n);
  let s: string;
  if (Number.isInteger(a)) s = String(a);
  else s = (Math.round(a * 10) / 10).toFixed(1).replace('.', ',');
  const [int, dec] = s.split(',');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (neg ? '−' : '') + grouped + (dec ? `,${dec}` : '');
}

/**
 * Rétrécit des textes d'une ligne (gros nombres) jusqu'à ce que leur rangée tienne dans sa boîte :
 * un score à 7 chiffres ne se coupe jamais sur deux lignes et ne sort pas de son cadre.
 */
export function fitRow(row: HTMLElement, items: HTMLElement[], min = 18): void {
  for (const e of items) e.style.fontSize = '';
  const over = () => row.scrollWidth > row.clientWidth + 0.5 || items.some((e) => e.scrollWidth > e.clientWidth + 0.5);
  for (let i = 0; i < 24 && over(); i++) {
    let changed = false;
    for (const e of items) {
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (fs - 2 >= min) {
        e.style.fontSize = `${fs - 2}px`;
        changed = true;
      }
    }
    if (!changed) break;
  }
}

/** Un texte d'une ligne qui rétrécit pour tenir dans sa propre boîte. */
export function fitText(e: HTMLElement, min = 18): void {
  fitRow(e, [e], min);
}

/** Nombre qui défile chiffre par chiffre et grossit brièvement à chaque ajout. */
export class Counter {
  value = 0;
  shown = 0;
  private gen = 0;
  private len = -1;
  /** Appelé quand le nombre de caractères change (réajuster la taille du texte). */
  onResize: (() => void) | null = null;
  constructor(readonly e: HTMLElement, private tickSound = true) {}
  private write(v: number): void {
    const t = fmt(v);
    this.e.textContent = t;
    if (this.onResize && t.length !== this.len) {
      this.len = t.length;
      this.onResize();
    }
  }
  set(v: number, animate = true, ms = 220): Promise<void> {
    const from = this.shown;
    this.value = v;
    const g = ++this.gen;
    if (!animate || clock.skipping) {
      this.shown = v;
      this.write(v);
      return Promise.resolve();
    }
    this.bump();
    let lastTick = 0;
    return tween(ms, (k) => {
      if (g !== this.gen) return;
      const cur = from + (v - from) * k;
      this.shown = Number.isInteger(v) && Number.isInteger(from) ? Math.round(cur) : Math.round(cur * 10) / 10;
      this.write(this.shown);
      if (this.tickSound && k - lastTick > 0.25) {
        lastTick = k;
        sfx.tick();
      }
    }, ease.outCubic);
  }
  bump(power = 1): void {
    if (clock.skipping) return;
    void tween(240, (k) => {
      const s = 1 + 0.28 * power * Math.sin(k * Math.PI) * (1 - k * 0.3);
      this.e.style.transform = `scale(${s.toFixed(3)})`;
    }, (t) => t);
  }
}

// ───────────── Plaque de table ─────────────

const KIND_NAME: Record<TableKind, string> = { petite: 'Petite table', grande: 'Grande table', patron: 'Table du patron' };

export class Plaque {
  readonly root: HTMLElement;
  private line1: HTMLElement;
  private bossName: HTMLElement;
  private bossRule: HTMLElement;
  private target: HTMLElement;
  private reward: HTMLElement;
  private bossChip: HTMLElement;
  private steps: HTMLElement[] = [];
  boss: BossDef | null = null;
  isBossTable = false;

  constructor(parent: HTMLElement) {
    this.root = place(el('div', 'plaque f-brass', parent), 20, 16, 300, 182);
    this.line1 = el('div', 'pl-line1 t-num', this.root);
    this.bossName = el('div', 'pl-boss t-gothic', this.root);
    this.bossRule = el('div', 'pl-rule t-body', this.root);
    const row = el('div', 'pl-row', this.root);
    el('div', 'pl-lab t-num', row, 'objectif');
    this.target = el('div', 'pl-target t-num', row);
    this.reward = el('div', 'pl-reward t-num', row);
    this.bossChip = el('div', 'pl-bosschip t-num', this.root);
    attachTip(this.bossChip, () => (this.boss ? { name: this.boss.name, sub: 'Patron du salon', body: this.boss.description } : null));
    attachTip(this.bossName, () => (this.boss ? { name: this.boss.name, sub: 'Patron du salon', body: this.boss.description } : null));
  }

  private row: HTMLElement | null = null;

  set(o: { salon: number; tableIndex: number; kind: TableKind; target: number | null; reward: number; boss: BossDef | null; shop?: boolean }): void {
    this.boss = o.boss;
    this.isBossTable = o.kind === 'patron' && !o.shop;
    this.line1.innerHTML = `${o.shop ? 'Boutique' : KIND_NAME[o.kind]}<span class="pl-salon">salon ${o.salon}</span>`;
    this.row ??= this.target.parentElement;
    if (this.row) this.row.style.visibility = o.target === null ? 'hidden' : '';
    this.steps.forEach((s, i) => {
      s.className = `pl-step ${i < o.tableIndex ? 'done' : i === o.tableIndex ? 'now' : ''} ${i === 2 ? 'boss' : ''}`;
    });
    this.target.textContent = o.target === null ? '?' : fmt(o.target);
    if (this.row) fitRow(this.row, [this.target]);
    this.reward.textContent = `gain ${o.reward} $`;
    this.root.classList.toggle('is-boss', this.isBossTable);
    if (this.isBossTable && o.boss) {
      this.bossName.textContent = o.boss.name;
      this.bossRule.innerHTML = colorize(o.boss.description);
      this.bossRule.classList.remove('small');
      if (this.bossRule.scrollHeight > 3 * 19 + 1) this.bossRule.classList.add('small');
      this.bossChip.textContent = '';
    } else {
      this.bossName.textContent = '';
      this.bossRule.textContent = '';
      this.bossChip.innerHTML = o.boss ? `patron : <span class="c-ivoire">${o.boss.name}</span>` : '';
    }
  }

  /** Entrée du patron : son nom en gothique s'abat du centre de la table sur la plaque. */
  async bossEntrance(name: string): Promise<void> {
    if (clock.skipping) return;
    const layer = this.root.parentElement!;
    const t = el('div', 'boss-drop t-gothic', layer, name);
    const from = { x: 640, y: 330 };
    const to = { x: 20 + 150, y: 16 + 74 };
    await tween(360, (k) => {
      t.style.transform = `translate(${from.x}px, ${from.y}px) translate(-50%, -50%) scale(${(0.6 + 0.6 * k).toFixed(3)}) rotate(${(-4 * k).toFixed(2)}deg)`;
      t.style.opacity = String(Math.min(1, k * 2));
    }, ease.outBack);
    await wait(520);
    await tween(240, (k) => {
      const x = from.x + (to.x - from.x) * k;
      const y = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 60;
      t.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${(1.2 - 0.7 * k).toFixed(3)}) rotate(-4deg)`;
    }, ease.inCubic);
    t.remove();
    sfx.stamp();
    shakeScreen(8, 200);
    this.flare();
    this.shakeIt();
  }

  /** Petit éclat sur la plaque (la règle du patron s'applique). */
  flare(): void {
    if (clock.skipping) return;
    this.root.classList.remove('flare');
    void this.root.offsetWidth;
    this.root.classList.add('flare');
  }

  shakeIt(): void {
    if (clock.skipping) return;
    void tween(360, (k) => {
      const a = Math.sin(k * Math.PI * 6) * (1 - k) * 3;
      this.root.style.transform = `rotate(${a.toFixed(2)}deg)`;
    }, (t) => t);
  }
}

// ───────────── Compteur Jetons × Mult et progression ─────────────

export class ScorePanel {
  readonly root: HTMLElement;
  private figName: HTMLElement;
  private figLvl: HTMLElement;
  private chipsBox: HTMLElement;
  private multBox: HTMLElement;
  private times: HTMLElement;
  readonly chips: Counter;
  readonly mult: Counter;
  private result: HTMLElement;
  readonly handScore: Counter;
  private tableScoreEl: HTMLElement;
  readonly tableScore: Counter;
  private targetEl: HTMLElement;
  private bar: HTMLElement;
  private barFill: HTMLElement;
  private flames: HTMLElement;
  target = 1;
  private preview = true;

  constructor(parent: HTMLElement) {
    this.root = place(el('div', 'score f-dark', parent), 978, 232, 284, 248);
    const head = el('div', 'sc-head', this.root);
    this.figName = el('div', 'sc-fig t-num', head);
    this.figLvl = el('div', 'sc-lvl t-num', head);
    const row = el('div', 'sc-row', this.root);
    this.chipsBox = el('div', 'sc-box chips f-ink', row);
    this.times = el('div', 'sc-x t-num', row, '×');
    this.multBox = el('div', 'sc-box mult f-ink', row);
    this.chips = new Counter(el('div', 'sc-num t-num', this.chipsBox), false);
    this.mult = new Counter(el('div', 'sc-num t-num', this.multBox), false);
    this.flames = el('canvas', 'sc-flames', this.root) as unknown as HTMLElement;
    this.result = el('div', 'sc-result t-num', this.root);
    this.handScore = new Counter(el('span', 'sc-hand', this.result), true);
    const tab = el('div', 'sc-table', this.root);
    el('div', 'sc-tlab t-num', tab, 'table');
    this.tableScoreEl = el('div', 'sc-tscore t-num', tab);
    this.tableScore = new Counter(this.tableScoreEl, false);
    this.targetEl = el('div', 'sc-target t-num', tab);
    this.bar = el('div', 'sc-bar', this.root);
    this.barFill = el('div', 'sc-fill', this.bar);
    this.chips.onResize = () => fitRow(this.chipsBox, [this.chips.e]);
    this.mult.onResize = () => fitRow(this.multBox, [this.mult.e]);
    this.handScore.onResize = () => fitRow(this.result, [this.handScore.e]);
    this.tableScore.onResize = () => fitRow(tab, [this.tableScoreEl, this.targetEl]);
    attachTip(this.chipsBox, () => ({ name: 'Jetons', body: 'Le score additif de la main. Score = Jetons × Mult.' }));
    attachTip(this.multBox, () => ({ name: 'Mult', body: 'Multiplie tes Jetons. Sur une défaite, la banque garde ton Mult.' }));
    this.result.classList.add('off');
  }

  setFigure(name: string | null, level: number | null, preview: boolean): void {
    this.preview = preview;
    this.figName.textContent = name ?? '';
    this.figLvl.textContent = level && level > 0 ? `niv. ${level}` : '';
    this.root.classList.toggle('preview', preview);
  }

  setTable(score: number, target: number, animate: boolean): Promise<void> {
    this.target = Math.max(1, target);
    const tt = `/ ${fmt(target)}`;
    if (this.targetEl.textContent !== tt) {
      this.targetEl.textContent = tt;
      this.tableScore.onResize?.();
    }
    const k = Math.min(1, score / this.target);
    if (!animate || clock.skipping) {
      this.barFill.style.width = `${(k * 100).toFixed(1)}%`;
      void this.tableScore.set(score, false);
      return Promise.resolve();
    }
    const from = parseFloat(this.barFill.style.width || '0') / 100;
    void this.tableScore.set(score, true, 380);
    return tween(380, (t) => {
      this.barFill.style.width = `${((from + (k - from) * t) * 100).toFixed(1)}%`;
    }, ease.outCubic);
  }

  clearHand(): void {
    void this.chips.set(0, false);
    void this.mult.set(0, false);
    this.result.classList.add('off');
    this.chipsBox.classList.remove('merged');
    this.multBox.classList.remove('merged', 'broken');
    this.times.classList.remove('merged');
    this.chipsBox.style.transform = '';
    this.multBox.style.transform = '';
    this.setFlames(0);
  }

  /** Centre d'un élément (pour faire jaillir les nombres). */
  anchor(which: 'chips' | 'mult' | 'result' | 'bar'): { x: number; y: number } {
    const e = which === 'chips' ? this.chipsBox : which === 'mult' ? this.multBox : which === 'result' ? this.result : this.bar;
    const r = stageRect(e);
    return { x: r.cx, y: r.cy };
  }

  /** La banque garde ton Mult : le compteur se brise et retombe à `to`. */
  async breakMult(to: number): Promise<void> {
    const a = this.anchor('mult');
    sfx.shatter();
    shards(a.x, a.y, col('braise'), 18, 70);
    shards(a.x, a.y, col('braise-sombre'), 8, 50);
    this.multBox.classList.add('broken');
    await this.mult.set(to, false);
    pop(a.x, a.y - 44, 'La banque garde ton Mult', 'bad');
    await wait(520);
  }

  async halveMult(to: number): Promise<void> {
    const a = this.anchor('mult');
    pop(a.x, a.y - 40, 'Égalité : Mult ÷2', 'dim');
    await this.mult.set(to, true, 300);
    await wait(260);
  }

  /** Jetons et Mult fusionnent en un seul nombre. */
  async merge(score: number): Promise<void> {
    this.chipsBox.classList.add('merged');
    this.multBox.classList.add('merged');
    this.times.classList.add('merged');
    await tween(150, (k) => {
      this.chipsBox.style.transform = `translateX(${(k * 52).toFixed(1)}px) scale(${(1 - k * 0.2).toFixed(3)})`;
      this.multBox.style.transform = `translateX(${(-k * 52).toFixed(1)}px) scale(${(1 - k * 0.2).toFixed(3)})`;
    }, ease.inCubic);
    this.result.classList.remove('off');
    void this.handScore.set(0, false);
    sfx.xmult(12);
    await this.handScore.set(score, true, 320);
    const big = score >= this.target * 0.5;
    if (big) {
      this.setFlames(Math.min(1, score / this.target));
      flash(col('braise'), 180, 0.18);
    }
  }

  /** Le score de la main file vers la progression. */
  async fly(tableScore: number, target: number): Promise<void> {
    const from = this.anchor('result');
    const to = this.anchor('bar');
    const ghost = el('div', 'sc-fly t-num', this.root.parentElement!, this.handScore.e.textContent ?? '');
    await tween(260, (k) => {
      const x = from.x + (to.x - from.x) * k;
      const y = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 30;
      ghost.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${(1 - k * 0.4).toFixed(3)})`;
    }, ease.inOut);
    ghost.remove();
    sfx.chip(14);
    await this.setTable(tableScore, target, true);
  }

  // flammes de pixels au-dessus du compteur (gros score)
  private flameTimer: (() => void) | null = null;
  setFlames(power: number): void {
    const cv = this.flames as unknown as HTMLCanvasElement;
    if (power <= 0 || clock.skipping) {
      cv.classList.remove('on');
      this.flameTimer?.();
      this.flameTimer = null;
      return;
    }
    cv.classList.add('on');
    cv.width = 64;
    cv.height = 24;
    const g = cv.getContext('2d')!;
    const W = 64;
    const H = 24;
    const heat = new Float32Array(W * (H + 1));
    let alive = true;
    let ttl = 2600;
    const colors = [col('bordeaux'), col('braise-sombre'), col('braise'), col('braise-clair'), col('ivoire')];
    const tick = () => {
      if (!alive) return;
      for (let x = 0; x < W; x++) heat[H * W + x] = Math.random() < 0.55 * power + 0.2 ? 1 : 0.3;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const b = heat[(y + 1) * W + x];
          const l = heat[(y + 1) * W + Math.max(0, x - 1)];
          const r = heat[(y + 1) * W + Math.min(W - 1, x + 1)];
          heat[y * W + x] = Math.max(0, (b * 2 + l + r) / 4 - Math.random() * 0.09);
        }
      }
      g.clearRect(0, 0, W, H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const h = heat[y * W + x];
          if (h < 0.22) continue;
          g.fillStyle = colors[Math.min(4, Math.floor((h - 0.22) * 6.5))];
          g.fillRect(x, y, 1, 1);
        }
      }
      ttl -= 50;
      if (ttl <= 0) {
        alive = false;
        cv.classList.remove('on');
        return;
      }
      setTimeout(tick, 50);
    };
    this.flameTimer = () => {
      alive = false;
    };
    tick();
  }
}

// ───────────── Bande mains / défausses / argent ─────────────

export class Stats {
  readonly root: HTMLElement;
  readonly hands: Counter;
  readonly discards: Counter;
  readonly money: Counter;
  private moneyEl: HTMLElement;
  constructor(parent: HTMLElement) {
    this.root = place(el('div', 'stats', parent), 978, 490, 284, 64);
    const mk = (label: string, cls: string) => {
      const b = el('div', `st-cell f-dark ${cls}`, this.root);
      const v = el('div', 'st-val t-num', b);
      el('div', 'st-lab t-num', b, label);
      return { b, v };
    };
    const h = mk('mains', 'hands');
    const d = mk('défausses', 'discards');
    const m = mk('argent', 'money');
    this.moneyEl = m.v;
    this.hands = new Counter(h.v, false);
    this.discards = new Counter(d.v, false);
    this.money = new Counter(m.v, false);
    this.moneyEl.classList.add('c-laiton');
    attachTip(h.b, () => ({ name: 'Mains', body: 'Mains qui restent pour atteindre l\'objectif de la table.' }));
    attachTip(d.b, () => ({ name: 'Défausses', body: 'Retire une carte de ta main, sans la remplacer.' }));
    attachTip(m.b, () => ({ name: 'Argent', body: 'Se dépense à la boutique. 1 $ d\'intérêt par tranche de 5 $.' }));
  }
  setMoney(v: number, animate: boolean): void {
    const prev = this.money.value;
    void this.money.set(v, animate, 260);
    this.moneyEl.textContent = `${fmt(animate ? this.money.shown : v)}`;
    if (animate && v !== prev) {
      const r = stageRect(this.moneyEl);
      pop(r.cx, r.y - 6, `${v > prev ? '+' : '−'}${Math.abs(v - prev)} $`, 'money');
    }
  }
  moneyAnchor(): { x: number; y: number } {
    const r = stageRect(this.moneyEl);
    return { x: r.cx, y: r.cy };
  }
}

/** Mini-emblème du patron pour l'écran d'intro. */
export function bossEmblem(b: BossDef): HTMLCanvasElement {
  return drawEmblem(b.art, 'patron');
}
