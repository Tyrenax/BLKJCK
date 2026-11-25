/**
 * Rendu procédural des cartes : faces, dos, améliorations, et gabarit des emblèmes
 * (atouts, combines, faveurs, privilèges, patrons). Format logique 60×84, affiché ×2.
 */
import type { Card, EmblemArt, Rank, Rarity } from '../../engine/types';
import { col, resolveColor, type ColorName } from '../core/palette';
import { ctx2d, drawMask, hash2, hconcat, makeCanvas, maskSize, outlineMask, rect, textMask, type Mask } from './pixel';
import { isRed, suitMask, SUIT_CHARS } from './suits';

export const CARD_W = 60;
export const CARD_H = 84;

export const RANK_LABEL: Record<Rank, string> = {
  A: 'A', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', '10': '10',
  J: 'V', Q: 'D', K: 'R',
};

export const FONT_RANK = '20px "Jersey 20"';
export const FONT_MONO = '48px "Jacquard 24"';

/** Silhouette de carte : coins cassés de 2 px. Renvoie [x0, x1] inclus pour la ligne y. */
function rowSpan(y: number, w: number, h: number, wobble = 0): [number, number] {
  let inset = 0;
  if (y === 0 || y === h - 1) inset = 2;
  else if (y === 1 || y === h - 2) inset = 1;
  return [inset + wobble, w - 1 - inset + wobble];
}

function wavy(y: number): number {
  return Math.round(Math.sin(y / 5) * 1.2);
}

/** Remplit la silhouette en Nuit puis l'intérieur (inset 2) avec `inner`. */
function silhouette(g: CanvasRenderingContext2D, w: number, h: number, inner: string, opts: { wave?: boolean } = {}): void {
  for (let y = 0; y < h; y++) {
    const wb = opts.wave ? wavy(y) : 0;
    const [a, b] = rowSpan(y, w, h);
    const left = a + (opts.wave ? Math.max(0, wb) : 0);
    const right = b + (opts.wave ? Math.min(0, wb) : 0);
    rect(g, left, y, right - left + 1, 1, col('nuit'));
    if (y >= 2 && y <= h - 3) rect(g, left + 2, y, right - left - 3, 1, inner);
  }
  // coins intérieurs cassés
  for (const [x, y] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]] as const) {
    const wb = opts.wave ? wavy(y) : 0;
    const dx = x < w / 2 ? Math.max(0, wb) : Math.min(0, wb);
    rect(g, x + dx, y, 1, 1, col('nuit'));
  }
}

/** Contour intérieur (cadre coloré de 2 px juste dans le contour Nuit). */
function innerFrame(g: CanvasRenderingContext2D, w: number, h: number, color: string, thick = 2): void {
  rect(g, 3, 2, w - 6, thick, color);
  rect(g, 3, h - 2 - thick, w - 6, thick, color);
  rect(g, 2, 3, thick, h - 6, color);
  rect(g, w - 2 - thick, 3, thick, h - 6, color);
}

function suitColors(card: Card): { ink: ColorName; pale: ColorName } {
  return isRed(card.suit) ? { ink: 'cerise', pale: 'cerise-pale' } : { ink: 'encre', pale: 'encre-pale' };
}

function drawIndex(g: CanvasRenderingContext2D, card: Card, x: number, y: number, flip: boolean): void {
  const { ink } = suitColors(card);
  const rm = card.rank === 'J' ? (vIndex ??= indexV()) : textMask(RANK_LABEL[card.rank], FONT_RANK);
  const sm = suitMask(card.suit, 'small');
  const rs = maskSize(rm);
  const ss = maskSize(sm);
  const colW = Math.max(rs.w, ss.w);
  if (!flip) {
    drawMask(g, rm, x + Math.floor((colW - rs.w) / 2), y, col(ink));
    drawMask(g, sm, x + Math.floor((colW - ss.w) / 2), y + rs.h + 2, col(ink));
  } else {
    // coin bas-droit, retourné : (x, y) = coin bas-droit
    const top = y - (rs.h + 2 + ss.h);
    drawMask(g, sm, x - colW + Math.floor((colW - ss.w) / 2), top, col(ink), true);
    drawMask(g, rm, x - colW + Math.floor((colW - rs.w) / 2), top + ss.h + 2, col(ink), true);
  }
}

function centerMask(g: CanvasRenderingContext2D, m: Mask, cx: number, cy: number, color: string): void {
  const { w, h } = maskSize(m);
  drawMask(g, m, Math.round(cx - w / 2), Math.round(cy - h / 2), color);
}

/**
 * Le V gothique du Valet, tracé à la main : celui de Jacquard 24 se lit U ou Y à cette taille.
 * Fût gauche épais, fût droit en délié, losanges en tête des deux fûts, pointe en bas : même
 * hauteur et même graisse que le D et le R de la police.
 */
function gothicV(): Mask {
  const ref = textMask('D', FONT_MONO, 120);
  const H = ref.length;
  const W = Math.round(H * 0.86);
  const seg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };
  const lozenge = (px: number, py: number, cx: number, cy: number, r: number) => Math.abs(px - cx) + Math.abs(py - cy) * 0.8 <= r;
  const m: Mask = [];
  for (let y = 0; y < H; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < W; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const thick = seg(px, py, W * 0.2, H * 0.12, W * 0.52, H * 0.96) <= W * 0.14; // fût plein
      const thin = seg(px, py, W * 0.86, H * 0.12, W * 0.56, H * 0.96) <= W * 0.065; // délié
      const spur = seg(px, py, W * 0.36, H * 0.5, W * 0.5, H * 0.42) <= W * 0.04; // éperon
      const headL = lozenge(px, py, W * 0.2, H * 0.1, W * 0.17); // tête du fût gauche
      const headR = lozenge(px, py, W * 0.86, H * 0.1, W * 0.1); // tête du délié
      const flag = seg(px, py, W * 0.02, H * 0.2, W * 0.2, H * 0.1) <= W * 0.035; // petit drapeau
      row.push(thick || thin || headL || headR || flag || spur);
    }
    m.push(row);
  }
  return m;
}
let vMask: Mask | null = null;

/** V en pixels (celui de Jersey 20 ressemble à un U) : hauteur H, largeur W, traits de `st` px. */
function pixelV(H: number, W: number, st: number): Mask {
  const m: Mask = [];
  const half = (W - st) / 2;
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const l = Math.min(Math.floor(half), Math.round(t * half * 0.92));
    const r = W - 1 - l;
    const row: boolean[] = [];
    for (let x = 0; x < W; x++) row.push(l + st - 1 >= r - st + 1 ? x >= l && x <= r : (x >= l && x < l + st) || (x <= r && x > r - st));
    m.push(row);
  }
  return m;
}

/** V de l'index en coin : même hauteur que les chiffres, traits de 2 px. */
function indexV(): Mask {
  return pixelV(textMask('7', FONT_RANK).length, 9, 2);
}
let vIndex: Mask | null = null;

/** Motif tissé derrière les monogrammes des figures. */
function weave(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a: string, b: string): void {
  rect(g, x, y, w, h, a);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const cell = ((Math.floor(i / 3) + Math.floor(j / 3)) & 1) === 0;
      const on = cell ? j % 3 === 1 : i % 3 === 1;
      if (on) rect(g, x + i, y + j, 1, 1, b);
    }
  }
}

function paperWear(g: CanvasRenderingContext2D, seed: number): void {
  for (let y = 4; y < CARD_H - 4; y++) {
    for (let x = 4; x < CARD_W - 4; x++) {
      if (hash2(x, y, seed) > 0.985) rect(g, x, y, 1, 1, col('ivoire-sombre'));
    }
  }
}

export interface FaceOptions {
  /** Ignore l'amélioration (aperçu brut). */
  plain?: boolean;
}

/** Face d'une carte à jouer (60×84). */
export function drawCardFace(card: Card, opts: FaceOptions = {}): HTMLCanvasElement {
  const c = makeCanvas(CARD_W, CARD_H);
  const g = ctx2d(c);
  const enh = opts.plain ? undefined : card.enhancement;
  const { ink, pale } = suitColors(card);

  silhouette(g, CARD_W, CARD_H, col('ivoire'), { wave: enh === 'elastique' });
  paperWear(g, card.id * 7 + 3);

  // fonds d'amélioration
  if (enh === 'arlequin') {
    const tints: ColorName[] = ['cerise-pale', 'encre-pale', 'petrole-glace', 'ivoire-sombre'];
    for (let y = 4; y < CARD_H - 4; y++) {
      for (let x = 4; x < CARD_W - 4; x++) {
        const u = x - CARD_W / 2;
        const v = y - CARD_H / 2;
        const a = Math.floor((u + v * 0.72 + 200) / 10);
        const b = Math.floor((u - v * 0.72 + 200) / 10);
        rect(g, x, y, 1, 1, col(tints[((a & 1) * 2 + (b & 1)) % 4]));
      }
    }
  }
  if (enh === 'cristal') {
    for (let y = 3; y < CARD_H - 3; y++) {
      for (let x = 3; x < CARD_W - 3; x++) {
        const d = (x + y * 0.6) % 17;
        if (d < 1) rect(g, x, y, 1, 1, col('petrole-glace'));
        const e = (x * 0.8 - y + 300) % 23;
        if (e < 1) rect(g, x, y, 1, 1, col('petrole-glace'));
      }
    }
  }
  if (enh === 'doree') innerFrame(g, CARD_W, CARD_H, col('laiton'));

  // centre
  const cx = CARD_W / 2;
  const cy = CARD_H / 2;
  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') {
    const pw = 34;
    const ph = 46;
    const px0 = Math.round(cx - pw / 2);
    const py0 = Math.round(cy - ph / 2);
    rect(g, px0 - 1, py0 - 1, pw + 2, ph + 2, col(ink));
    weave(g, px0, py0, pw, ph, col('ivoire'), col(pale));
    const mono = card.rank === 'J' ? (vMask ??= gothicV()) : textMask(RANK_LABEL[card.rank], FONT_MONO, 120);
    const out = outlineMask(mono, true);
    const { w, h } = maskSize(out);
    drawMask(g, out, Math.round(cx - w / 2), Math.round(cy - h / 2), col('ivoire'));
    centerMask(g, mono, cx, cy, col(ink));
    // petite enseigne en pied du panneau
    const sm = suitMask(card.suit, 'tiny');
    const ss = maskSize(sm);
    rect(g, Math.round(cx - ss.w / 2) - 2, py0 + ph - ss.h - 3, ss.w + 4, ss.h + 4, col('ivoire'));
    drawMask(g, sm, Math.round(cx - ss.w / 2), py0 + ph - ss.h - 1, col(ink));
  } else {
    const size = card.rank === 'A' ? 34 : 26;
    const m = suitMask(card.suit, size);
    if (card.rank === 'A') {
      const ring = outlineMask(outlineMask(m));
      const rs = maskSize(ring);
      drawMask(g, ring, Math.round(cx - rs.w / 2), Math.round(cy - rs.h / 2), col(pale));
    }
    centerMask(g, m, cx, cy, col(ink));
  }

  // index
  drawIndex(g, card, 5, 5, false);
  const bottom = enh === 'plombee' ? CARD_H - 13 : CARD_H - 5;
  drawIndex(g, card, CARD_W - 5, bottom, true);

  // améliorations en surcouche
  if (enh === 'plombee') {
    rect(g, 2, CARD_H - 11, CARD_W - 4, 9, col('nuit'));
    rect(g, 3, CARD_H - 10, CARD_W - 6, 7, col('plomb'));
    rect(g, 3, CARD_H - 10, CARD_W - 6, 1, col('plomb-clair'));
    for (let x = 7; x < CARD_W - 5; x += 9) rect(g, x, CARD_H - 7, 2, 2, col('nuit'));
  }
  if (enh === 'ardente') {
    const embers: [number, number, ColorName][] = [
      [9, 70, 'braise'], [14, 64, 'braise-clair'], [44, 72, 'braise'], [50, 62, 'braise'], [21, 76, 'braise-sombre'],
      [38, 66, 'braise-clair'], [27, 70, 'braise'], [47, 52, 'braise-sombre'], [11, 56, 'braise-sombre'], [33, 75, 'braise'],
    ];
    for (const [x, y, k] of embers) rect(g, x, y, 2, 2, col(k));
    for (let x = 3; x < CARD_W - 3; x++) {
      const hgt = 2 + Math.round(hash2(x, 1, 9) * 3);
      rect(g, x, CARD_H - 2 - hgt, 1, hgt, col(hash2(x, 2, 9) > 0.5 ? 'braise' : 'braise-sombre'));
    }
  }
  if (enh === 'marquee') {
    // coin corné en haut à droite : le coin est replié, on voit le dos (Prune)
    const s = 12;
    for (let y = 0; y <= s; y++) {
      for (let x = CARD_W - 1 - s; x < CARD_W; x++) {
        const xp = CARD_W - 1 - x; // distance au bord droit
        if (xp + y < s) g.clearRect(x, y, 1, 1);
        else if (xp + y === s) rect(g, x, y, 1, 1, col('nuit'));
        else if (xp === s || y === s) rect(g, x, y, 1, 1, col('nuit'));
        else if (xp < s && y < s) rect(g, x, y, 1, 1, col('prune'));
      }
    }
    // la marque du tricheur : un point Cerise dans le repli
    rect(g, CARD_W - 5, s - 4, 2, 2, col('cerise'));
  }
  if (enh === 'fantome') {
    const img = g.getImageData(0, 0, CARD_W, CARD_H);
    const d = img.data;
    for (let y = 0; y < CARD_H; y++) {
      for (let x = 0; x < CARD_W; x++) {
        const k = (y * CARD_W + x) * 4;
        if (d[k + 3] === 0) continue;
        const edge = x < 2 || y < 2 || x > CARD_W - 3 || y > CARD_H - 3;
        if (edge) {
          // contour en pointillés
          if (((x + y) >> 1) % 2 === 0) d[k + 3] = 255;
          else d[k + 3] = 0;
        } else {
          d[k + 3] = 165;
        }
      }
    }
    g.putImageData(img, 0, 0);
  }
  return c;
}

/** Dos de carte : guillochis Prune/Laiton (joueur) ou Pétrole/Ivoire (croupier). */
export function drawCardBack(owner: 'player' | 'dealer'): HTMLCanvasElement {
  const c = makeCanvas(CARD_W, CARD_H);
  const g = ctx2d(c);
  const field = owner === 'player' ? col('prune') : col('petrole');
  const line = owner === 'player' ? col('laiton') : col('ivoire');
  const dim = owner === 'player' ? col('laiton-nuit') : col('petrole-pale');
  silhouette(g, CARD_W, CARD_H, field);
  innerFrame(g, CARD_W, CARD_H, line, 1);
  const x0 = 6;
  const y0 = 6;
  const w = CARD_W - 12;
  const h = CARD_H - 12;
  const cx = CARD_W / 2 - 0.5;
  const cy = CARD_H / 2 - 0.5;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const dx = x - cx;
      const dy = (y - cy) * 0.78;
      const r = Math.sqrt(dx * dx + dy * dy);
      const a = Math.atan2(dy, dx);
      const v = Math.sin(r * 0.95 + 2.2 * Math.sin(a * 6));
      const v2 = Math.sin(r * 0.95 - 2.2 * Math.sin(a * 6 + 0.5));
      if (Math.abs(v) < 0.22) rect(g, x, y, 1, 1, line);
      else if (Math.abs(v2) < 0.18) rect(g, x, y, 1, 1, dim);
    }
  }
  // cartouche central
  const mw = 14;
  for (let j = -mw; j <= mw; j++) {
    const span = mw - Math.abs(j);
    rect(g, cx - span + 0.5, cy + j * 1.2 + 0.5, span * 2 + 1, 2, field);
  }
  for (let j = -mw; j <= mw; j++) {
    const span = mw - Math.abs(j);
    rect(g, cx - span + 0.5, cy + j * 1.2 + 0.5, 1, 2, line);
    rect(g, cx + span + 0.5, cy + j * 1.2 + 0.5, 1, 2, line);
  }
  const mark = owner === 'player' ? suitMask('hearts', 'small') : suitMask('spades', 'small');
  centerMask(g, mark, cx + 0.5, cy + 0.5, line);
  return c;
}

// ───────────── Emblèmes ─────────────

export type EmblemKind = 'atout' | 'combine' | 'faveur' | 'privilege' | 'patron' | 'sabot' | 'pot';

const RARITY_FRAME: Record<Rarity, ColorName> = {
  commun: 'cendre',
  'peu-commun': 'menthe-sombre',
  rare: 'cerise',
  legendaire: 'laiton',
};

const KIND_FRAME: Record<Exclude<EmblemKind, 'atout'>, ColorName> = {
  combine: 'petrole-pale',
  faveur: 'ivoire-sombre',
  privilege: 'laiton',
  patron: 'bordeaux-clair',
  sabot: 'ivoire-sombre',
  pot: 'cendre-clair',
};

function patternOn(p: EmblemArt['pattern'], x: number, y: number, w: number, h: number): boolean {
  const cx = w / 2;
  const cy = h / 2;
  switch (p) {
    case 'rayures':
      return ((x + y) % 8) < 3;
    case 'damier':
      return ((Math.floor(x / 6) + Math.floor(y / 6)) & 1) === 0;
    case 'soleil': {
      const a = Math.atan2(y - cy, x - cx);
      return Math.floor(((a + Math.PI) / (Math.PI * 2)) * 24) % 2 === 0;
    }
    case 'losanges': {
      const u = Math.abs(((x + 400) % 12) - 6);
      const v = Math.abs(((y + 400) % 16) - 8) * 0.75;
      return u + v < 4;
    }
    case 'vagues':
      return ((y + Math.round(Math.sin(x / 3) * 2) + 400) % 7) < 2;
    case 'points':
      return (x % 6 === 2 || x % 6 === 3) && (((y + (Math.floor(x / 6) % 2) * 3) % 6 === 2) || ((y + (Math.floor(x / 6) % 2) * 3) % 6 === 3));
    case 'chevrons':
      return ((y + Math.abs((x % 12) - 6) + 400) % 8) < 3;
    case 'uni':
    default:
      return false;
  }
}

function glyphMask(glyph: string): Mask {
  const chars = [...glyph];
  if (chars.length > 0 && chars.every((ch) => ch in SUIT_CHARS)) {
    const size = chars.length === 1 ? 32 : chars.length === 2 ? 22 : 15;
    const parts = chars.map((ch) => suitMask(SUIT_CHARS[ch], size));
    const out: Mask = Array.from({ length: size }, () => []);
    parts.forEach((m, k) => {
      for (let y = 0; y < size; y++) {
        out[y].push(...m[y]);
        if (k < parts.length - 1) out[y].push(false, false);
      }
    });
    return out;
  }
  // texte : Jersey 20 à 40 px, ou 20 px si trop large ; les V sont redessinés (Jersey les arrondit en U)
  const build = (font: string, st: number): Mask => {
    if (!/[Vv]/.test(glyph)) return textMask(glyph, font);
    const cap = textMask('X', font).length;
    const parts = [...glyph].map((ch) => (ch === 'V' || ch === 'v' ? pixelV(cap, Math.round(cap * 0.78), st) : textMask(ch, font)));
    return hconcat(parts, st === 4 ? 2 : 1);
  };
  let m = build('40px "Jersey 20"', 4);
  if (maskSize(m).w > 46) m = build('20px "Jersey 20"', 2);
  return m;
}

/** Carte-emblème (60×84) pour atouts, combines, faveurs, privilèges et patrons. */
export function drawEmblem(art: EmblemArt, kind: EmblemKind, rarity?: Rarity): HTMLCanvasElement {
  const c = makeCanvas(CARD_W, CARD_H);
  const g = ctx2d(c);
  const bg = resolveColor(art.colors[0]);
  const fg = resolveColor(art.colors[1]);
  const frame = col(kind === 'atout' ? RARITY_FRAME[rarity ?? 'commun'] : KIND_FRAME[kind]);
  silhouette(g, CARD_W, CARD_H, bg);
  const ix = 4;
  const iy = 4;
  const iw = CARD_W - 8;
  const ih = CARD_H - 8;
  for (let y = 0; y < ih; y++) {
    for (let x = 0; x < iw; x++) {
      if (patternOn(art.pattern, x, y, iw, ih)) rect(g, ix + x, iy + y, 1, 1, fg);
    }
  }
  innerFrame(g, CARD_W, CARD_H, frame, 2);
  rect(g, 4, 4, CARD_W - 8, 1, col('nuit'));
  rect(g, 4, CARD_H - 5, CARD_W - 8, 1, col('nuit'));
  rect(g, 4, 4, 1, CARD_H - 8, col('nuit'));
  rect(g, CARD_W - 5, 4, 1, CARD_H - 8, col('nuit'));

  // glyphe géant : cerné de Nuit, ombre dure
  const m = glyphMask(art.glyph);
  const o1 = outlineMask(m, true);
  const o2 = outlineMask(o1, false);
  const { w, h } = maskSize(o2);
  const gx = Math.round(CARD_W / 2 - w / 2);
  const gy = Math.round(CARD_H / 2 - h / 2) - 1;
  drawMask(g, o2, gx + 1, gy + 2, col('nuit'));
  drawMask(g, o1, gx + 1, gy + 1, col('nuit'));
  drawMask(g, m, gx + 2, gy + 2, col('ivoire'));
  return c;
}

/** Emplacement vide (atout / consommable). */
export function drawEmptySlot(): HTMLCanvasElement {
  const c = makeCanvas(CARD_W, CARD_H);
  const g = ctx2d(c);
  for (let y = 0; y < CARD_H; y++) {
    const [a, b] = rowSpan(y, CARD_W, CARD_H);
    for (let x = a; x <= b; x++) {
      const edge = x <= a + 1 || x >= b - 1 || y <= 1 || y >= CARD_H - 2;
      if (edge && ((x + y) >> 1) % 2 === 0) rect(g, x, y, 1, 1, col('prune-clair'));
    }
  }
  return c;
}
