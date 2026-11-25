/**
 * Audit de mise en page (développement seulement) : on MESURE au lieu de regarder.
 * Pour un écran affiché, on parcourt les éléments porteurs de texte et les contrôles, et on signale :
 *   chevauchement  deux textes, un texte et un contrôle, ou deux contrôles qui se recouvrent sans être parent et enfant
 *   collés         deux textes de blocs différents sur la même ligne, à moins de 4 px l'un de l'autre
 *   recouvert      un texte ou un contrôle recouvert par une image (carte, emblème) qui n'est pas son fond
 *   débordement    un texte ou un contrôle qui sort du cadre qui le contient (ou de sa propre boîte)
 *   rogné          un conteneur dont le contenu dépasse la boîte (scrollHeight / scrollWidth)
 *   hors-scène     un élément hors de la scène 1280×720
 *   points         un texte coupé par des points de suspension (ellipsis, line-clamp, « … »), ou qui pourrait
 *                  l'être : tout style ellipsis ou line-clamp est signalé, sans aucune exception
 *   coupure        un nombre ou une étiquette courte (deux mots au plus) cassés sur deux lignes
 *   fantôme        une image encore peinte alors qu'un de ses parents est caché (visibility: visible forcée)
 * Les cas (vrai contenu, pires cas de chaque écran) sont construits par buildCases ; un pilote CDP
 * les joue un par un (window.__audit.run(i)) et capture l'écran de chaque cas signalé.
 *   ?audit=1   installe window.__audit
 */
import { textEntries, worstAtoutText } from '../../content/textes';
import type { Card, FigureId, HandResult, Rank, RunState, ShopOffer, Suit } from '../../engine/types';
import { clock, finishAll } from '../core/anim';
import { el, stageScale } from '../core/stage';
import type { Game } from '../game';
import { GAUGE_X, GAUGE_Y } from '../view/gauge';
import { attachTip, colorize, hide as hideTip, openTip, tipTargets, type TipContent } from '../view/tooltip';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Kind = 'chevauchement' | 'collés' | 'recouvert' | 'débordement' | 'rogné' | 'hors-scène' | 'points' | 'coupure' | 'fantôme';
export interface Finding {
  kind: Kind;
  a: string;
  b?: string;
  detail: string;
  boxes: Box[];
}
export interface CaseResult {
  index: number;
  group: string;
  name: string;
  state: string;
  findings: Finding[];
  error?: string;
}

/** Hauteur d'encre d'une ligne, en fraction du corps (les boîtes de ligne débordent du dessin des lettres). */
const INK = 0.78;
/** Recouvrement toléré (unités de scène). */
const TOL = 2;
const W = 1280;
const H = 720;

let stageEl: HTMLElement;
let cache = new Map<Element, CSSStyleDeclaration>();
const cs = (e: Element): CSSStyleDeclaration => {
  let c = cache.get(e);
  if (!c) {
    c = getComputedStyle(e);
    cache.set(e, c);
  }
  return c;
};

function toBox(r: DOMRect): Box {
  const s = stageEl.getBoundingClientRect();
  const k = stageScale();
  return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k };
}
const r1 = (n: number) => Math.round(n);
const fmtBox = (b: Box) => `${r1(b.x)},${r1(b.y)} ${r1(b.w)}×${r1(b.h)}`;

function union(bs: Box[]): Box {
  const x0 = Math.min(...bs.map((b) => b.x));
  const y0 = Math.min(...bs.map((b) => b.y));
  const x1 = Math.max(...bs.map((b) => b.x + b.w));
  const y1 = Math.max(...bs.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function overlap(a: Box, b: Box): Box | null {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > TOL && h > TOL ? { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), w, h } : null;
}

function inside(inner: Box, outer: Box, tol = 1): boolean {
  return inner.x >= outer.x - tol && inner.y >= outer.y - tol && inner.x + inner.w <= outer.x + outer.w + tol && inner.y + inner.h <= outer.y + outer.h + tol;
}

/** Le canvas a-t-il des pixels visibles dans cette zone (scène) ? */
function opaque(e: Element, o: Box): boolean {
  if (!(e instanceof HTMLCanvasElement) || !e.width || !e.height) return true;
  const b = toBox(e.getBoundingClientRect());
  if (b.w < 1 || b.h < 1) return false;
  const sx = e.width / b.w;
  const sy = e.height / b.h;
  const x0 = Math.max(0, Math.floor((o.x - b.x) * sx));
  const y0 = Math.max(0, Math.floor((o.y - b.y) * sy));
  const x1 = Math.min(e.width, Math.ceil((o.x + o.w - b.x) * sx));
  const y1 = Math.min(e.height, Math.ceil((o.y + o.h - b.y) * sy));
  if (x1 <= x0 || y1 <= y0) return false;
  try {
    const ctx = e.getContext('2d');
    if (!ctx) return true;
    const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 24) return true;
    return false;
  } catch {
    return true;
  }
}

/** Bloc de mise en page d'un texte (deux morceaux d'une même phrase partagent le leur). */
function blockOf(e: Element): Element {
  let b: Element = e;
  while (b.parentElement && cs(b).display === 'inline') b = b.parentElement;
  return b;
}

/** Colonne de boutique élargie au survol (panneau opaque posé sur ses voisines), ou null. */
function popupOf(e: Element): Element | null {
  const p = e.closest('[data-popup]');
  return p && p.parentElement?.matches('.hover, :hover') ? p : null;
}

function shown(e: Element): boolean {
  const c = cs(e);
  if (c.display === 'none' || c.visibility !== 'visible') return false;
  let o = 1;
  for (let p: Element | null = e; p && p !== document.documentElement; p = p.parentElement) {
    const pc = cs(p);
    if (pc.display === 'none') return false;
    o *= Number(pc.opacity);
    if (o < 0.05) return false;
  }
  return true;
}

function ownText(e: Element): Text[] {
  return [...e.childNodes].filter((n): n is Text => n.nodeType === 3 && /\S/.test(n.textContent ?? ''));
}

/** Boîtes des lignes de texte propres à l'élément, resserrées sur l'encre. */
/** Zone visible d'un élément : intersection des ancêtres qui rognent (overflow hidden, line-clamp…). */
function clipOf(e: Element): Box | null {
  let clip: Box | null = null;
  for (let p = e.parentElement; p && p !== stageEl; p = p.parentElement) {
    const c = cs(p);
    if (c.overflowX === 'visible' && c.overflowY === 'visible') continue;
    const b = toBox(p.getBoundingClientRect());
    if (!clip) clip = b;
    else {
      const x0 = Math.max(clip.x, b.x);
      const y0 = Math.max(clip.y, b.y);
      clip = { x: x0, y: y0, w: Math.max(0, Math.min(clip.x + clip.w, b.x + b.w) - x0), h: Math.max(0, Math.min(clip.y + clip.h, b.y + b.h) - y0) };
    }
  }
  return clip;
}

function textBoxes(e: Element): Box[] {
  const fs = parseFloat(cs(e).fontSize) || 16;
  const out: Box[] = [];
  const range = document.createRange();
  const self = cs(e);
  const clip = self.overflowX !== 'visible' || self.overflowY !== 'visible' ? toBox(e.getBoundingClientRect()) : null;
  const outer = clipOf(e);
  for (const n of ownText(e)) {
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      let b = toBox(r);
      if (b.w < 1 || b.h < 1) continue;
      const ink = Math.min(b.h, fs * INK);
      b = { x: b.x, y: b.y + (b.h - ink) / 2, w: b.w, h: ink };
      // une ligne rognée (4e ligne sous un line-clamp…) n'est pas visible : elle ne chevauche rien
      for (const c of [clip, outer]) {
        if (!c) continue;
        const x0 = Math.max(b.x, c.x);
        const y0 = Math.max(b.y, c.y);
        b = { x: x0, y: y0, w: Math.min(b.x + b.w, c.x + c.w) - x0, h: Math.min(b.y + b.h, c.y + c.h) - y0 };
      }
      if (b.w >= 1 && b.h >= 1) out.push(b);
    }
  }
  return out;
}

export function describe(e: Element): string {
  const cls = (e.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
  const t = (e.textContent ?? '').replace(/\s+/g, ' ').trim();
  return `${e.tagName.toLowerCase()}${cls ? `.${cls}` : ''}${t ? ` « ${t.length > 46 ? `${t.slice(0, 45)}~` : t} »` : ''}`;
}

const CONTROL = 'button, input, select, textarea, .btn, .set-choice, [role="button"]';

interface Item {
  e: Element;
  type: 'text' | 'control' | 'image';
  rects: Box[];
  bound: Box;
  comp: Element;
}

/** Composant : l'ancêtre posé directement sur un calque (ou sur une racine de l'audit). */
function compOf(e: Element, roots: Element[]): Element {
  let c: Element = e;
  while (c.parentElement && !roots.includes(c.parentElement) && !c.parentElement.classList.contains('layer') && c.parentElement !== stageEl) c = c.parentElement;
  return c;
}

function boxed(e: Element): boolean {
  const c = cs(e);
  if (c.borderImageSource && c.borderImageSource !== 'none') return true;
  const m = /rgba?\(([^)]+)\)/.exec(c.backgroundColor);
  if (m) {
    const parts = m[1].split(',').map((x) => parseFloat(x));
    if (parts.length < 4 || parts[3] > 0.05) return true;
  }
  if (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) return true;
  return false;
}

function innerBox(e: Element): Box {
  const b = toBox(e.getBoundingClientRect());
  const c = cs(e);
  // cadre pixel (border-image) : le trait visible fait 2 à 6 px (contour + liseré), le reste de la
  // bordure est du remplissage ; en bas s'ajoute la tranche (relief). On mesure contre le trait.
  const frame = c.borderImageSource && c.borderImageSource !== 'none';
  const bt = Math.min(frame ? 6 : 99, parseFloat(c.borderTopWidth) || 0);
  const br = Math.min(frame ? 6 : 99, parseFloat(c.borderRightWidth) || 0);
  const bb = Math.min(frame ? 10 : 99, parseFloat(c.borderBottomWidth) || 0);
  const bl = Math.min(frame ? 6 : 99, parseFloat(c.borderLeftWidth) || 0);
  return { x: b.x + bl, y: b.y + bt, w: b.w - bl - br, h: b.h - bt - bb };
}

/** Le détecteur. `roots` : les éléments de l'écran affiché (panneau, calques de la table, infobulle). */
export function auditRoots(roots: Element[]): Finding[] {
  cache = new Map();
  const items: Item[] = [];
  const out: Finding[] = [];
  const seen = new Set<string>();
  const push = (f: Finding) => {
    const k = `${f.kind}|${f.a}|${f.b ?? ''}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(f);
  };
  const all: Element[] = [];
  for (const root of roots) {
    if (!root.isConnected) continue;
    all.push(root, ...root.querySelectorAll('*'));
  }
  for (const e of all) {
    if (e.closest('.audit-ov')) continue;
    if (!shown(e)) continue;
    const comp = compOf(e, roots);
    if (e.matches(CONTROL)) {
      const b = toBox(e.getBoundingClientRect());
      if (b.w >= 2 && b.h >= 2) items.push({ e, type: 'control', rects: [b], bound: b, comp });
    } else if (e.tagName === 'CANVAS' || e.tagName === 'IMG') {
      for (let p = e.parentElement; p && p !== stageEl; p = p.parentElement) {
        if (cs(p).visibility === 'hidden') {
          push({ kind: 'fantôme', a: describe(e), b: describe(p), detail: 'image visible dans un parent caché', boxes: [toBox(e.getBoundingClientRect())] });
          break;
        }
      }
      const b = toBox(e.getBoundingClientRect());
      if (b.w >= 8 && b.h >= 8) items.push({ e, type: 'image', rects: [b], bound: b, comp: e.closest('.sprite') ?? comp });
    }
    if (ownText(e).length) {
      const r = textBoxes(e);
      if (r.length) items.push({ e, type: 'text', rects: r, bound: union(r), comp });
      const txt = ownText(e).map((n) => n.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim();
      const lines = new Set(r.map((b) => Math.round(b.y / 4))).size;
      const numeric = /^[\d\s.,×x$+\-−%/]+$/.test(txt);
      const short = txt.split(' ').length <= 2 && e.children.length === 0 && !e.closest('[data-wrap]');
      if (lines > 1 && (numeric || short)) push({ kind: 'coupure', a: describe(e), detail: `« ${txt} » sur ${lines} lignes`, boxes: [union(r)] });
    }
    // rogné : contenu plus grand que sa boîte (barres de défilement comprises : la molette est coupée en jeu)
    const c = cs(e);
    if (c.display !== 'inline' && e.tagName !== 'CANVAS') {
      const clip = c.overflowX !== 'visible' || c.overflowY !== 'visible';
      const he = e as HTMLElement;
      const overH = he.scrollHeight > he.clientHeight + 1;
      const overW = he.scrollWidth > he.clientWidth + 1;
      const clamp = c.getPropertyValue('-webkit-line-clamp');
      // aucune exception : un style qui PEUT couper un texte (ellipsis, line-clamp) est signalé même s'il ne
      // coupe rien aujourd'hui ; un autre contenu le ferait couper
      if (c.textOverflow === 'ellipsis' || (clamp && clamp !== 'none')) {
        push({ kind: 'points', a: describe(e), detail: `texte coupé (${c.textOverflow === 'ellipsis' ? 'ellipsis' : `line-clamp ${clamp}`}) : ${he.scrollWidth}×${he.scrollHeight} pour ${he.clientWidth}×${he.clientHeight} ; texte entier : « ${(e.textContent ?? "").trim()} »`, boxes: [toBox(e.getBoundingClientRect())] });
      } else if (clip && (overH || overW) && he.clientHeight > 0) {
        push({ kind: 'rogné', a: describe(e), detail: `contenu ${he.scrollWidth}×${he.scrollHeight} dans ${he.clientWidth}×${he.clientHeight} (overflow ${c.overflowX}/${c.overflowY})`, boxes: [toBox(e.getBoundingClientRect())] });
      } else if (!clip && overW && ownText(e).length && c.display !== 'inline' && he.clientWidth > 0 && c.whiteSpace !== 'normal') {
        push({ kind: 'débordement', a: describe(e), detail: `texte de ${he.scrollWidth} px dans une boîte de ${he.clientWidth} px`, boxes: [toBox(e.getBoundingClientRect())] });
      }
    }
    for (const n of ownText(e)) {
      if (/…|\.\.\./.test(n.textContent ?? '')) push({ kind: 'points', a: describe(e), detail: 'points de suspension dans le texte', boxes: textBoxes(e) });
    }
  }

  // chevauchements
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.e === b.e || a.e.contains(b.e) || b.e.contains(a.e)) continue;
      if (a.type === 'image' && b.type === 'image') continue;
      // un menu surgissant (Vendre / Jouer) passe au-dessus des cartes et des emplacements comme une
      // infobulle ; il ne doit en revanche couvrir aucun texte (l'étiquette de sa rangée s'efface)
      if (!!a.e.closest('.item-menu') !== !!b.e.closest('.item-menu') && (a.type === 'image' || b.type === 'image')) continue;
      // une colonne de boutique élargie au survol est un panneau opaque au-dessus de ses voisines
      if (popupOf(a.e) !== popupOf(b.e)) continue;
      // collés : deux textes de blocs différents sur la même ligne, sans au moins 4 px entre eux
      if (a.type === 'text' && b.type === 'text' && blockOf(a.e) !== blockOf(b.e) && !blockOf(a.e).contains(b.e) && !blockOf(b.e).contains(a.e)) {
        let glued: Box | null = null;
        for (const ra of a.rects) {
          for (const rb of b.rects) {
            const vo = Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y);
            const gap = Math.max(ra.x, rb.x) - Math.min(ra.x + ra.w, rb.x + rb.w);
            if (vo > 0.5 * Math.min(ra.h, rb.h) && gap < 4 && gap > -TOL) glued = { x: Math.min(ra.x, rb.x), y: Math.max(ra.y, rb.y), w: Math.max(ra.x + ra.w, rb.x + rb.w) - Math.min(ra.x, rb.x), h: vo };
          }
        }
        if (glued) {
          push({ kind: 'collés', a: describe(a.e), b: describe(b.e), detail: `deux textes sur la même ligne à moins de 4 px (en ${r1(glued.x)},${r1(glued.y)})`, boxes: [a.bound, b.bound] });
          continue;
        }
      }
      if (!overlap(a.bound, b.bound)) continue;
      let o: Box | null = null;
      for (const ra of a.rects) {
        for (const rb of b.rects) {
          o = overlap(ra, rb);
          if (o) break;
        }
        if (o) break;
      }
      if (!o) continue;
      if (a.type === 'image' || b.type === 'image') {
        const img = a.type === 'image' ? a : b;
        const other = a.type === 'image' ? b : a;
        // une étiquette gravée sur le dessin de son propre composant (limite et « crève » sur la règle) est voulue
        if (other.e.closest('[data-on-art]') && img.comp.contains(other.e)) continue;
        // simple contact (ombre portée, bord d'une carte) : 4 px au plus
        if (o.w <= 4 || o.h <= 4) continue;
        // une annonce (moins d'une seconde) passe par-dessus le jeu par nature : seuls ses
        // chevauchements avec du texte ou un bouton comptent
        if (other.e.closest('.announce')) continue;
        // seuls les pixels visibles du canvas comptent (le spectre vide, le haut transparent de la règle…)
        let vis: Box | null = null;
        for (const r of other.rects) {
          const ov = overlap(r, img.bound);
          if (ov && ov.w > 4 && ov.h > 4 && opaque(img.e, ov)) {
            vis = ov;
            break;
          }
        }
        if (!vis) continue;
        o = vis;
        push({ kind: 'recouvert', a: describe(other.e), b: describe(img.e), detail: `recouvrement ${r1(o.w)}×${r1(o.h)} en ${r1(o.x)},${r1(o.y)}`, boxes: [other.bound, img.bound] });
        continue;
      }
      push({ kind: 'chevauchement', a: describe(a.e), b: describe(b.e), detail: `${a.type} / ${b.type}, recouvrement ${r1(o.w)}×${r1(o.h)} en ${r1(o.x)},${r1(o.y)}`, boxes: [a.bound, b.bound] });
    }
  }

  // débordement du cadre, hors scène
  for (const it of items) {
    if (it.type === 'image') continue;
    const b = it.bound;
    if (b.x < -0.5 || b.y < -0.5 || b.x + b.w > W + 0.5 || b.y + b.h > H + 0.5) {
      push({ kind: 'hors-scène', a: describe(it.e), detail: `boîte ${fmtBox(b)} hors de 1280×720`, boxes: [b] });
    }
    for (let p = it.e.parentElement; p; p = p.parentElement) {
      if (p.classList.contains('layer') || p === stageEl) break;
      if (boxed(p) && shown(p)) {
        const ib = innerBox(p);
        if (!inside(b, ib)) {
          push({ kind: 'débordement', a: describe(it.e), b: describe(p), detail: `${fmtBox(b)} sort du cadre ${fmtBox(ib)}`, boxes: [b, ib] });
          break;
        }
      }
      if (roots.includes(p)) break;
    }
  }
  return out;
}

// ───────────── Surimpression (captures) ─────────────

export function drawOverlay(fs: Finding[]): void {
  clearOverlay();
  const ov = el('div', 'audit-ov', stageEl);
  ov.style.cssText = 'position:absolute;left:0;top:0;width:1280px;height:720px;z-index:1000;pointer-events:none';
  fs.slice(0, 16).forEach((f, i) => {
    f.boxes.forEach((b, j) => {
      const d = el('div', '', ov);
      d.style.cssText = `position:absolute;left:${b.x - 2}px;top:${b.y - 2}px;width:${b.w + 4}px;height:${b.h + 4}px;outline:2px ${j ? 'dashed var(--laiton)' : 'solid var(--cerise)'}`;
      if (!j) {
        const n = el('div', '', ov, String(i + 1));
        n.style.cssText = `position:absolute;left:${Math.max(0, b.x - 2)}px;top:${Math.max(0, b.y - 22)}px;font:18px "Jersey 15";line-height:18px;color:var(--ivoire);background:var(--cerise-sombre);padding:0 4px`;
      }
    });
  });
}

export function clearOverlay(): void {
  stageEl?.querySelectorAll('.audit-ov').forEach((e) => e.remove());
}

// ───────────── Cas ─────────────

interface Case {
  group: string;
  name: string;
  state: string;
  run(): Promise<Element[]>;
}

const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

export function installAudit(game: Game): void {
  const g = game;
  const L = g.L;
  stageEl = L.stage;
  g.hints.enabled = false;
  const eng = g.engine;
  const C = eng.content;
  const clone = <T>(x: T): T => structuredClone(x);
  /** Privilèges possédés, avec leurs effets sur les règles (comme à l'achat). */
  const givePrivs = (s: RunState, ids: string[]) => {
    s.privileges = [...ids];
    for (const id of ids) for (const m of C.privileges.find((p) => p.id === id)?.mods ?? []) s.runMods.push({ ...m });
  };
  // accès aux champs privés des écrans (outil de développement)
  const P = (o: unknown, k: string): unknown => (o as Record<string, unknown>)[k];
  const panelRoot = (scr: unknown): HTMLElement => P(P(scr, 'panel'), 'root') as HTMLElement;

  const base = clone(eng.newRun('audit').state);
  const playing = clone(eng.dispatch(clone(base), { type: 'startTable' }).state);
  let nextId = 900000;
  const card = (rank: Rank, suit: Suit, enhancement?: Card['enhancement']): Card => ({ id: nextId++, rank, suit, ...(enhancement ? { enhancement } : {}) });
  const enhIds = Object.keys(C.enhancements) as NonNullable<Card['enhancement']>[];
  const fullDeck = (n: number): Card[] => {
    const out: Card[] = [];
    for (let i = 0; i < n; i++) out.push(card(RANKS[i % 13], SUITS[Math.floor(i / 13) % 4], i >= 52 || i % 7 === 3 ? enhIds[i % enhIds.length] : undefined));
    return out;
  };

  const frames = (n: number) =>
    new Promise<void>((res) => {
      let k = 0;
      const tick = () => (++k >= n ? res() : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
      setTimeout(res, 120 * n);
    });
  const settle = async () => {
    finishAll();
    await frames(2);
    finishAll();
    await frames(2);
  };

  const resetUI = () => {
    clock.skipping = true;
    hideTip();
    g.hints.dismiss();
    g.cancelMode();
    for (const k of ['intro', 'receipt', 'shop'] as const) g.screens[k].hide();
    g.screens.end.hide();
    g.screens.deck.hide();
    g.screens.carnet.hide();
    g.screens.settings.close();
    g.screens.title.hide();
    g.screens.launch?.hide();
    g.screens.collection?.hide();
    g.view.verdict.hide();
    g.view.items.select(null);
    L.fx.querySelectorAll('.announce, .pop, .audit-tmp').forEach((e) => e.remove());
    clearOverlay();
    finishAll();
  };

  const tableRoots = () => [L.table, L.cards, L.fx];
  const KINDS = ['petite', 'grande', 'patron'] as const;
  const cases: Case[] = [];
  const add = (group: string, name: string, state: string, run: () => Promise<Element[]>) => cases.push({ group, name, state, run });

  // ── Présentation de table : chaque patron × chaque pot-de-vin, sans pot-de-vin, table du patron ──
  const skips = C.skipRewards ?? [];
  const longestSkip = [...skips].sort((a, b) => b.description.length - a.description.length)[0]?.id ?? null;
  const intro = (bossId: string, ti: number, reward: string | null, target: number) => async () => {
    const s = clone(base);
    s.salon = C.balance.salons;
    s.bossId = bossId;
    s.tableIndex = ti;
    s.salonSkipRewards = [reward, reward];
    if (s.table) {
      s.table.kind = KINDS[ti];
      s.table.bossId = ti === 2 ? bossId : null;
      s.table.target = target;
    }
    g.load(s);
    await settle();
    return [panelRoot(g.screens.intro)];
  };
  for (const b of C.bosses) {
    for (const r of [null, ...skips.map((x) => x.id)]) add('présentation', `${b.id} / petite / ${r ?? 'sans pot-de-vin'}`, 'tableIntro salon 8, objectif 9 999 999', intro(b.id, 0, r, 9999999));
    add('présentation', `${b.id} / grande / ${longestSkip}`, 'tableIntro salon 8, objectif 9 999 999', intro(b.id, 1, longestSkip, 9999999));
    add('présentation', `${b.id} / table du patron`, 'tableIntro salon 8, objectif 9 999 999', intro(b.id, 2, null, 9999999));
  }

  // ── Table de jeu ──
  const withHand = (p: Card[], d: Card[], f?: (s: RunState) => void) => {
    const s = clone(playing);
    const h = s.table!.hand!;
    h.playerCards = p;
    h.dealerCards = d;
    h.holeRevealed = d.length > 2;
    f?.(s);
    return s;
  };
  const small = (n: number, suit: Suit = 'clubs'): Card[] => Array.from({ length: n }, (_, i) => card((['2', '3', '2', 'A', '2', '3', 'A'] as Rank[])[i % 7], SUITS[(i + SUITS.indexOf(suit)) % 4]));
  for (let p = 2; p <= 7; p++) {
    for (const d of [2, 5, 7]) {
      add('table', `mains ${p} cartes / croupier ${d} cartes`, 'playerTurn', async () => {
        g.load(withHand(small(p, 'hearts'), small(d, 'spades')));
        await settle();
        return tableRoots();
      });
    }
  }
  for (let lim = 18; lim <= 23; lim++) {
    for (const [pt, dt] of [
      [lim, lim],
      [lim - 1, lim],
      [lim, lim - 1],
      [12, 12],
      [2, 3],
    ] as const) {
      add('table', `limite ${lim}, toi ${pt} / croupier ${dt}`, 'playerTurn, spectre plein, butées', async () => {
        const s = withHand(small(3), small(2, 'spades'), (x) => {
          x.table!.drawPile = fullDeck(60);
        });
        g.load(s);
        const gv = g.view.gauge;
        gv.setRules(lim, Math.min(lim - 4, 17), lim === 21 ? 22 : lim, true);
        gv.setPlayer(pt, false, true);
        gv.setDealer(dt, true);
        gv.setSpectrum(
          Array.from({ length: 60 }, (_, i) => ({ card: card(RANKS[i % 13], SUITS[i % 4]), total: Math.min(lim + 6, pt + 1 + (i % 11)) })),
          null,
        );
        await settle();
        return tableRoots();
      });
    }
  }
  // tampon de verdict : chaque verdict, croupier à gauche ou à droite de la Jauge
  const verdicts: [string, Partial<HandResult>][] = [
    ['victoire', { outcome: 'win', dealerBust: false }],
    ['la banque saute', { outcome: 'win', dealerBust: true }],
    ['égalité', { outcome: 'push', dealerBust: false }],
    ['défaite', { outcome: 'loss', dealerBust: false }],
    ['crevé', { outcome: 'bust', dealerBust: false }],
  ];
  for (const [label, res] of verdicts) {
    for (const [dealerTotal, dealerRanks] of [[4, ['2', '2']], [12, ['10', '2']], [17, ['10', '7']], [20, ['10', 'K']], [25, ['10', '6', '9']]] as const) {
      add('table', `verdict ${label}, croupier à ${dealerTotal}`, 'handResult, score 9 999 999, Mult 12,5', async () => {
        // le croupier a vraiment ce total : le tampon se place d'après ses cartes, comme en jeu
        const s = withHand(small(3), dealerRanks.map((r, i) => card(r as Rank, SUITS[i % 4])), (x) => {
          x.phase = 'handResult';
          const t = x.table!;
          t.score = 9999999;
          t.target = 9999999;
          t.hand!.holeRevealed = true;
          t.hand!.result = { outcome: 'win', dealerBust: false, playerTotal: 21, dealerTotal, figure: 'triple7' as FigureId, chips: 999999, mult: 12.5, score: 9999999, ...res } as HandResult;
        });
        g.load(s);
        await settle();
        return tableRoots();
      });
    }
  }
  // annonces de figure (l'image tenue au milieu de l'annonce), avec et sans tampon
  for (const [id, f] of Object.entries(C.figures)) {
    add('table', `annonce « ${f.name} »`, 'scoreStart pendant le tampon', async () => {
      const s = withHand(small(3), small(3, 'spades'), (x) => {
        x.phase = 'handResult';
        x.table!.hand!.result = { outcome: 'win', dealerBust: false, playerTotal: 21, dealerTotal: 18, figure: id as FigureId, chips: 120, mult: 8, score: 960 };
      });
      g.load(s);
      const big = id === 'blackjack' || id === 'triple7';
      const a = el('div', 'announce t-gothic tone-ivoire audit-tmp', L.fx, f.name);
      a.style.top = '130px';
      a.style.fontSize = `${big ? 96 : 72}px`;
      a.style.transform = 'translate(-50%, -50%) scale(1) rotate(-2deg)';
      await settle();
      return tableRoots();
    });
  }
  // « Il crève » (le croupier, étiquette visible) et « Crevé » (toi, avant le choix de te sauver)
  for (const [label, text, y, f] of [
    ['il crève', 'Il crève', 130, (x: RunState) => {
      x.phase = 'handResult';
      x.table!.hand!.result = { outcome: 'win', dealerBust: true, playerTotal: 18, dealerTotal: 25, figure: 'haute' as FigureId, chips: 40, mult: 4, score: 160 };
    }],
    ['crevé', 'Crevé', 330, (x: RunState) => {
      x.phase = 'bustChoice';
    }],
  ] as const) {
    add('table', `annonce « ${text} »`, label, async () => {
      g.load(withHand(small(5), small(4, 'spades'), f));
      const a = el('div', `announce t-gothic tone-${text === 'Crevé' ? 'cerise' : 'ivoire'} audit-tmp`, L.fx, text);
      a.style.top = `${y}px`;
      a.style.transform = 'translate(-50%, -50%) scale(1) rotate(-2deg)';
      await settle();
      return tableRoots();
    });
  }
  // indices
  const hintCases: [string, () => void][] = [
    ['gauge', () => g.hints.show('gauge', { x: GAUGE_X + 420, y: GAUGE_Y + 116 }, { x: 990, y: 566 }, 262)],
    ['discard', () => g.hints.show('discard', { x: 880, y: 640 }, { x: 990, y: 570 }, 262)],
    ['score', () => {
      const ca = g.view.score.anchor('chips');
      g.hints.show('score', { x: ca.x - 58, y: ca.y + 20 }, { x: 990, y: 570 }, 262);
    }],
    ['loss', () => {
      const ma = g.view.score.anchor('mult');
      g.hints.show('loss', { x: ma.x + 58, y: ma.y + 20 }, { x: 990, y: 570 }, 262);
    }],
  ];
  for (const [id, show] of hintCases) {
    add('table', `indice ${id}`, 'playerTurn', async () => {
      g.load(withHand(small(4), small(2, 'spades')));
      await settle();
      clock.skipping = false;
      g.hints.enabled = true;
      g.hints.reset();
      show();
      g.hints.enabled = false;
      clock.skipping = true;
      await settle();
      return tableRoots();
    });
  }
  // indice de la boutique (ordre des atouts), colonne pleine
  add('table', 'indice order (boutique)', 'shop, 6 atouts', async () => {
    const s = clone(base);
    s.phase = 'shop';
    s.table = null;
    s.shop = { offers: [], rerollCost: 5, shredCost: 3, shredsLeft: 1 };
    givePrivs(s, ['manche-longue', 'double-fond']);
    s.atouts = C.atouts.slice(0, 6).map((a, i) => ({ uid: 610000 + i, defId: a.id, state: a.initialState?.() ?? {} }));
    s.consumables = C.consumables.slice(0, 3).map((c, i) => ({ uid: 710000 + i, defId: c.id }));
    g.load(s);
    await settle();
    clock.skipping = false;
    g.hints.enabled = true;
    g.hints.reset();
    g.hints.show('order', { x: 176, y: 290 }, { x: 24, y: 434 }, 300);
    g.hints.enabled = false;
    clock.skipping = true;
    await settle();
    return tableRoots();
  });
  // plaque du patron : chaque patron à sa table ; panneau de score à 7 chiffres
  for (const b of C.bosses) {
    add('table', `plaque, table du patron ${b.id}`, 'playerTurn, table du patron', async () => {
      const s = withHand(small(2), small(2, 'spades'), (x) => {
        x.bossId = b.id;
        x.tableIndex = 2;
        x.table!.kind = 'patron';
        x.table!.bossId = b.id;
        x.table!.target = 9999999;
        x.table!.score = 9999999;
      });
      g.load(s);
      g.view.score.setFigure('Triple Sept', 99, true);
      void g.view.score.chips.set(999999, false);
      void g.view.score.mult.set(12.5, false);
      await settle();
      return tableRoots();
    });
  }
  // ciblage d'une combine sur la main : la barre d'actions porte le nom et la consigne
  for (const d of C.consumables.filter((x) => x.targeting && x.targeting.zone !== 'deck')) {
    add('table', `ciblage ${d.id}`, 'playerTurn, mode ciblage', async () => {
      const s = withHand(small(4), small(2, 'spades'), (x) => {
        x.consumables = [{ uid: 777001, defId: d.id }];
      });
      g.load(s);
      g.useConsumable(777001);
      await settle();
      return tableRoots();
    });
  }

  // ── Boutique : chaque offre, 3 ou 4 de front, prix à deux chiffres ──
  let offerId = 50000;
  const shopCase = (name: string, offers: Omit<ShopOffer, 'offerId' | 'sold'>[], privs: string[]) =>
    add('boutique', name, `shop, ${offers.length} offres, argent 999 $`, async () => {
      const s = clone(base);
      s.phase = 'shop';
      s.table = null;
      s.money = 999;
      givePrivs(s, privs);
      s.shop = { offers: offers.map((o) => ({ ...o, offerId: offerId++, sold: false })), rerollCost: 15, shredCost: 13, shredsLeft: 1, freeRerollsLeft: 0, rerollsPaid: 9 };
      g.load(s);
      await settle();
      return [P(g.screens.shop, 'root') as HTMLElement];
    });
  const privIds = C.privileges.map((p) => p.id);
  type Offer = Omit<ShopOffer, 'offerId' | 'sold'>;
  const mainOffers: Offer[] = [
    ...C.atouts.map((a): Offer => ({ kind: 'atout', defId: a.id, cost: 99 })),
    ...C.consumables.map((c): Offer => ({ kind: c.kind, defId: c.id, cost: 12 })),
    ...enhIds.map((e, i): Offer => ({ kind: 'card', defId: '', card: card(RANKS[(i * 5) % 13], SUITS[i % 4], e), cost: 10 })),
    { kind: 'card', defId: '', card: card('10', 'hearts'), cost: 10 },
  ];
  for (const per of [4, 3]) {
    for (let i = 0, k = 0; i < mainOffers.length; i += per, k++) {
      const chunk = mainOffers.slice(i, i + per);
      const priv = privIds[k % privIds.length];
      shopCase(`${per} de front + privilège ${priv} : ${chunk.map((o) => o.defId || o.card?.enhancement || 'carte').join(', ')}`, [...chunk, { kind: 'privilege', defId: priv, cost: 25 }], per === 4 ? ['vitrine'] : []);
    }
  }

  // carte survolée (elle se lève et grossit) ; offres achetées (colonne vide, carte partie au sabot)
  const shopState = (offers: Omit<ShopOffer, 'offerId' | 'sold'>[], sold: number[]) => {
    const s = clone(base);
    s.phase = 'shop';
    s.table = null;
    s.money = 999;
    givePrivs(s, ['vitrine']);
    s.shop = { offers: offers.map((o, i) => ({ ...o, offerId: offerId++, sold: sold.includes(i) })), rerollCost: 15, shredCost: 13, shredsLeft: 1, freeRerollsLeft: 0, rerollsPaid: 9 };
    return s;
  };
  type OfferViewLike = { sprite: { hovered: boolean; root: HTMLElement }; offer: ShopOffer };
  for (let i = 0; i < 5; i++) {
    add('boutique', `carte survolée, colonne ${i + 1}/5`, 'shop, Vitrine', async () => {
      g.load(shopState([...mainOffers.slice(0, 4), { kind: 'privilege', defId: privIds[0], cost: 25 }], []));
      await settle();
      const v = (P(g.screens.shop, 'views') as OfferViewLike[])[i];
      v.sprite.hovered = true;
      await frames(3);
      finishAll();
      await settle();
      return [P(g.screens.shop, 'root') as HTMLElement];
    });
  }
  add('boutique', 'offres achetées (atout, carte)', 'shop, après deux achats', async () => {
    const offers = [mainOffers[0], mainOffers[1], mainOffers.find((o) => o.kind === 'card')!, { kind: 'privilege' as const, defId: privIds[1], cost: 25 }];
    g.load(shopState(offers, []));
    await settle();
    // les achats passent par le même chemin qu'en jeu : animation de départ, puis état vendu
    g.screens.shop.onBought((P(g.screens.shop, 'views') as OfferViewLike[])[0].offer.offerId);
    g.screens.shop.onBought((P(g.screens.shop, 'views') as OfferViewLike[])[2].offer.offerId);
    await new Promise((r) => setTimeout(r, 450));
    const s = clone(g.state!);
    s.shop!.offers[0].sold = true;
    s.shop!.offers[2].sold = true;
    g.load(s);
    await settle();
    return [P(g.screens.shop, 'root') as HTMLElement, g.view.table.shoe.root];
  });

  // résistance : 5 colonnes (Vitrine), chaque colonne porte une des phrases les plus longues du contenu,
  // (a) ramenée à 90 caractères (la cible de bjck-6a), (b) entière telle qu'aujourd'hui, avec les noms les plus longs
  const shopTexts = textEntries(C).filter((e) => ['atouts', 'combines', 'faveurs', 'privileges', 'ameliorations'].includes(e.category));
  const cut90 = (t: string) => {
    if (t.length <= 90) return t;
    const i = t.lastIndexOf(' ', 88);
    return `${t.slice(0, i).replace(/[\s,;:(]+$/, '')}.`;
  };
  const longNames = [...shopTexts].sort((a, b) => b.name.length - a.name.length).map((e) => e.name);
  for (const [label, texts] of [
    ['90 car.', [...new Set(shopTexts.map((e) => cut90(e.text)))].sort((a, b) => b.length - a.length).slice(0, 25)],
    ['entières', [...new Set(shopTexts.map((e) => e.text))].sort((a, b) => b.length - a.length).slice(0, 25)],
  ] as const) {
    for (let k = 0; k < texts.length; k += 5) {
      const chunk = texts.slice(k, k + 5);
      add('boutique', `résistance, phrases ${label} ${k + 1} à ${k + chunk.length} (${chunk.map((t) => t.length).join(', ')} car.)`, 'shop, 5 colonnes', async () => {
        g.load(shopState([...mainOffers.slice(0, 4), { kind: 'privilege', defId: privIds[0], cost: 25 }], []));
        await settle();
        const cols = [...(P(g.screens.shop, 'root') as HTMLElement).querySelectorAll('.sh-col')];
        cols.forEach((col, i) => {
          const t = chunk[i % chunk.length];
          (col.querySelector('.sh-rule') as HTMLElement).innerHTML = colorize(t);
          (col.querySelector('.sh-name') as HTMLElement).textContent = longNames[(k + i) % 8];
        });
        g.screens.shop.fitColumns();
        await settle();
        return [P(g.screens.shop, 'root') as HTMLElement];
      });
    }
  }

  // au-delà du contenu : des règles de 120 à 180 caractères (deux phrases bout à bout) exercent le repli,
  // corps réduit sans survol, colonne élargie au corps normal au survol
  const pool = [...shopTexts].sort((a, b) => b.text.length - a.text.length).map((e) => e.text);
  const beyond = Array.from({ length: 5 }, (_, i) => `${pool[i]} ${pool[(i * 3 + 7) % pool.length]}`);
  for (const hoverCol of [-1, 0, 1, 2, 3, 4]) {
    add('boutique', `résistance au-delà de 90 car. (${beyond.map((t) => t.length).join(', ')}), ${hoverCol < 0 ? 'sans survol' : `survol de la colonne ${hoverCol + 1}`}`, 'shop, 5 colonnes', async () => {
      g.load(shopState([...mainOffers.slice(0, 4), { kind: 'privilege', defId: privIds[0], cost: 25 }], []));
      await settle();
      const cols = [...(P(g.screens.shop, 'root') as HTMLElement).querySelectorAll('.sh-col')];
      cols.forEach((col, i) => ((col.querySelector('.sh-rule') as HTMLElement).innerHTML = colorize(beyond[i])));
      g.screens.shop.fitColumns();
      if (hoverCol >= 0) cols[hoverCol].classList.add('hover');
      await settle();
      return [P(g.screens.shop, 'root') as HTMLElement];
    });
  }

  // ── Infobulles : chaque objet, premier et dernier emplacement, 6 atouts, 3 poches, ligne de vente ──
  const atoutState = (id: string) => C.atouts.find((a) => a.id === id)?.initialState?.() ?? {};
  const itemTip = (kind: 'atout' | 'consumable', defId: string, slot: number, inShop: boolean) => async () => {
    const s = clone(inShop ? base : playing);
    if (inShop) {
      s.phase = 'shop';
      s.table = null;
      s.shop = { offers: [], rerollCost: 5, shredCost: 3, shredsLeft: 1 };
    }
    givePrivs(s, ['manche-longue', 'double-fond']);
    const filler = C.atouts.filter((a) => a.id !== defId).slice(0, 6);
    s.atouts = filler.map((a, i) => ({ uid: 600000 + i, defId: a.id, state: atoutState(a.id) }));
    const cf = C.consumables.filter((c) => c.id !== defId).slice(0, 3);
    s.consumables = cf.map((c, i) => ({ uid: 700000 + i, defId: c.id }));
    const uid = kind === 'atout' ? 600000 + slot : 700000 + slot;
    if (kind === 'atout') s.atouts[slot] = { uid, defId, state: atoutState(defId) };
    else s.consumables[slot] = { uid, defId };
    g.load(s);
    await settle();
    const entry = (kind === 'atout' ? g.view.items.atouts : g.view.items.cons).get(uid);
    if (!entry) throw new Error(`objet ${defId} absent de la colonne`);
    // le texte dans son pire état (compteurs à trois chiffres, « Déjà ouvert à cette table. »…)
    const real = (P(g.view.items, 'tip') as (e: unknown) => TipContent | null).call(g.view.items, entry);
    if (real && kind === 'atout') {
      const d = C.atouts.find((a) => a.id === defId)!;
      const worst = worstAtoutText(d);
      attachTip(entry.sprite.root, () => ({ ...real, body: worst }));
    }
    openTip(entry.sprite.root);
    await settle();
    return [L.tooltip];
  };
  for (const a of C.atouts) for (const slot of [0, 5]) add('infobulles', `atout ${a.id}, emplacement ${slot + 1}/6`, 'boutique (ligne de vente)', itemTip('atout', a.id, slot, true));
  for (const c of C.consumables) for (const slot of [0, 2]) add('infobulles', `${c.kind} ${c.id}, poche ${slot + 1}/3`, 'table', itemTip('consumable', c.id, slot, false));
  // menu Vendre / Jouer d'un objet sélectionné
  for (const [kind, slot] of [['atout', 0], ['atout', 5], ['consumable', 0], ['consumable', 2]] as const) {
    add('infobulles', `menu de l'objet ${kind} ${slot + 1}`, 'boutique', async () => {
      await itemTip(kind, kind === 'atout' ? C.atouts[0].id : C.consumables[0].id, slot, true)();
      hideTip();
      g.view.items.select(kind === 'atout' ? 600000 + slot : 700000 + slot);
      await settle();
      return [L.table, L.cards];
    });
  }
  // balayage : toutes les infobulles visibles d'un écran (bords de scène, boutons, plaque, sabot)
  const sweep = (name: string, state: string, setup: () => Promise<void>) =>
    add('infobulles', `balayage ${name}`, state, async () => {
      await setup();
      await settle();
      return [L.tooltip];
    });
  const sweepTargets = (): Element[] => {
    const out: Element[] = [];
    for (const w of tipTargets ?? []) {
      const e = w.deref();
      if (!e || !e.isConnected) {
        tipTargets?.delete(w);
        continue;
      }
      cache = new Map();
      if (shown(e)) out.push(e);
    }
    return out;
  };
  sweep('table', 'playerTurn, patron La Maison', async () => {
    g.load(withHand(small(4), small(2, 'spades'), (x) => {
      x.bossId = 'la-maison';
      x.consumables = [{ uid: 710001, defId: C.consumables[0].id }];
    }));
  });

  // ── Carnet : le maximum de règles modifiées, toutes les figures à haut niveau ──
  const stakesAll = C.stakes ?? [];
  const ruleKey = (s: RunState) => JSON.stringify(eng.getRules(s));
  // atouts qui changent les règles, triés par nombre de règles touchées (les plus bavards d'abord)
  const baseRulesObj = eng.getRules(clone(playing)) as unknown as Record<string, unknown>;
  const ruleAtouts = C.atouts
    .map((a) => {
      const s = clone(playing);
      s.atouts = [{ uid: 1, defId: a.id, state: atoutState(a.id) }];
      const r = eng.getRules(s) as unknown as Record<string, unknown>;
      return { a, n: Object.keys(r).filter((k) => r[k] !== baseRulesObj[k]).length };
    })
    .filter((x) => x.n > 0)
    .sort((x, y) => y.n - x.n)
    .map((x) => x.a);
  void ruleKey;
  const lastStake = stakesAll[stakesAll.length - 1];
  for (const [label, n] of [['maximum réel : 6 atouts, tous les privilèges, la dernière mise', 6], ['au-delà du jeu', 99]] as const) {
    add('carnet', `Carnet, ${label} (${Math.min(n, ruleAtouts.length)} atouts qui changent les règles)`, 'table du patron La Maison, figures niveau 99', async () => {
      const s = withHand(small(3), small(2, 'spades'), (x) => {
        x.atouts = ruleAtouts.slice(0, n).map((a, i) => ({ uid: 800000 + i, defId: a.id, state: atoutState(a.id) }));
        givePrivs(x, privIds);
        if (lastStake) {
          x.stakeId = lastStake.id;
          x.stakeLevel = stakesAll.length - 1;
        }
        x.bossId = 'la-maison';
        x.tableIndex = 2;
        x.table!.kind = 'patron';
        x.table!.bossId = 'la-maison';
        for (const f of Object.keys(x.figureLevels)) x.figureLevels[f as FigureId] = 99;
      });
      g.load(s);
      g.screens.carnet.open();
      await settle();
      return [panelRoot(g.screens.carnet)];
    });
  }

  // ── Ticket d'encaissement : toutes les lignes possibles ──
  add('encaissement', 'ticket, table du patron, toutes les lignes', 'tableWon, score 9 999 999', async () => {
    const s = clone(playing);
    s.phase = 'tableWon';
    s.tableIndex = 2;
    const t = s.table!;
    t.kind = 'patron';
    t.score = 9999999;
    t.target = 9999999;
    t.hand = null;
    const lines = [
      { label: 'Table du patron battue', amount: 5 },
      { label: '12 mains non jouées', amount: 12 },
      { label: 'Intérêts', amount: 25 },
    ];
    t.payout = lines;
    g.lastPayout = { lines, total: 42 };
    g.load(s);
    await settle();
    await frames(4);
    finishAll();
    await settle();
    return [panelRoot(g.screens.receipt)];
  });

  // ── Vue du sabot : 60 et 10 cartes, ciblage, Déchiqueteuse ──
  for (const n of [60, 10]) {
    add('sabot', `vue du sabot, ${n} cartes`, 'playerTurn', async () => {
      const s = clone(playing);
      s.deck = fullDeck(n);
      s.table!.drawPile = s.deck.slice(0, Math.max(0, n - 6));
      s.table!.discardPile = s.deck.slice(n - 6);
      g.load(s);
      g.openDeck();
      await settle();
      return [P(g.screens.deck, 'root') as HTMLElement];
    });
  }
  for (const d of C.consumables.filter((x) => x.targeting?.zone === 'deck')) {
    add('sabot', `ciblage dans le sabot : ${d.id}`, 'playerTurn, mode ciblage', async () => {
      const s = clone(playing);
      s.deck = fullDeck(60);
      s.table!.drawPile = s.deck.slice(0, 54);
      s.consumables = [{ uid: 777002, defId: d.id }];
      g.load(s);
      g.useConsumable(777002);
      await settle();
      return [P(g.screens.deck, 'root') as HTMLElement];
    });
  }
  add('sabot', 'Déchiqueteuse, 60 cartes', 'shop', async () => {
    const s = clone(base);
    s.phase = 'shop';
    s.table = null;
    s.deck = fullDeck(60);
    s.shop = { offers: [], rerollCost: 5, shredCost: 13, shredsLeft: 1 };
    g.load(s);
    g.screens.deck.open('shred');
    await settle();
    return [P(g.screens.deck, 'root') as HTMLElement];
  });

  // ── Réglages, titre ──
  add('réglages', 'réglages depuis le titre', 'titre', async () => {
    g.toTitle();
    g.screens.settings.open();
    await settle();
    return [panelRoot(g.screens.settings)];
  });
  add('réglages', 'réglages en partie', 'playerTurn', async () => {
    g.load(clone(playing));
    g.screens.settings.open();
    await settle();
    return [panelRoot(g.screens.settings)];
  });
  for (const withSave of [true, false]) {
    add('titre', withSave ? 'titre avec « Reprendre »' : 'titre sans sauvegarde', 'titre', async () => {
      const prev = localStorage.getItem('sabot.run');
      if (withSave) localStorage.setItem('sabot.run', eng.serialize(playing));
      else localStorage.removeItem('sabot.run');
      g.toTitle();
      await settle();
      if (prev === null) localStorage.removeItem('sabot.run');
      else localStorage.setItem('sabot.run', prev);
      return [panelRoot(g.screens.title)];
    });
  }

  // ── Écrans de bjck-5a : lancement (chaque sabot × chaque mise), collection, fin ──
  const ext = async () => {
    const store = await import('../ext/profileStore');
    const demo = await import('../ext/demo');
    return { store, demo };
  };
  const demoCache: { profile?: unknown; lost?: RunState; won?: RunState } = {};
  const fullProfile = async () => {
    const { store, demo } = await ext();
    if (!demoCache.profile) {
      const p = demo.demoProfile(eng);
      for (const d of C.startingDecks ?? []) p.byDeck[d.id] = { played: 9, won: 9, bestStakeWon: (C.stakes?.length ?? 8) - 1 };
      p.seen.atouts = C.atouts.map((a) => a.id);
      p.seen.consumables = C.consumables.map((a) => a.id);
      p.seen.privileges = C.privileges.map((a) => a.id);
      p.seen.bosses = C.bosses.map((a) => a.id);
      p.seen.decks = (C.startingDecks ?? []).map((a) => a.id);
      p.seen.stakes = (C.stakes ?? []).map((a) => a.id);
      demoCache.profile = p;
    }
    store.setDemoProfile(demoCache.profile as Parameters<typeof store.setDemoProfile>[0]);
  };
  const decks = C.startingDecks ?? [];
  const stakes = C.stakes ?? [];
  if (g.screens.launch) {
    for (let di = 0; di < Math.max(1, decks.length); di++) {
      for (let si = 0; si < Math.max(1, stakes.length); si++) {
        add('lancement', `sabot ${decks[di]?.id ?? '?'} / mise ${stakes[si]?.id ?? '?'}`, 'titre, profil complet', async () => {
          await fullProfile();
          g.toTitle();
          const ls = g.screens.launch!;
          ls.open();
          (ls as unknown as Record<string, unknown>).deckId = decks[di]?.id ?? '';
          (ls as unknown as Record<string, unknown>).stakeIdx = si;
          (P(ls, 'render') as () => void).call(ls);
          await settle();
          return [panelRoot(ls)];
        });
      }
    }
    add('lancement', 'profil vide', 'titre, profil neuf', async () => {
      const { store } = await ext();
      store.setDemoProfile(store.emptyProfile());
      g.toTitle();
      g.screens.launch!.open();
      await settle();
      return [panelRoot(g.screens.launch!)];
    });
  }
  if (g.screens.collection) {
    for (const tab of ['atouts', 'combines', 'faveurs', 'patrons', 'privileges', 'sabots', 'records']) {
      for (const full of [true, false]) {
        add('collection', `onglet ${tab}, profil ${full ? 'complet' : 'vide'}`, 'titre', async () => {
          const { store } = await ext();
          if (full) await fullProfile();
          else store.setDemoProfile(store.emptyProfile());
          g.toTitle();
          const cs2 = g.screens.collection!;
          cs2.open();
          (P(cs2, 'showTab') as (id: string) => void).call(cs2, tab);
          await settle();
          return [panelRoot(cs2)];
        });
      }
    }
  }
  for (const won of [false, true]) {
    add('fin', won ? 'victoire' : 'défaite', won ? 'victory' : 'gameOver', async () => {
      const { demo } = await ext();
      await fullProfile();
      const s = won ? (demoCache.won ??= demo.demoEnd(eng, true)) : (demoCache.lost ??= demo.demoEnd(eng, false));
      g.state = clone(s);
      g.showTable(true);
      g.syncAll(g.state, true);
      g.screens.end.show(g.state, won);
      await settle();
      return [panelRoot(g.screens.end)];
    });
  }

  // ── Capacité des conteneurs (question de bjck-6a) ──
  const corpus = textEntries(C).map((e) => e.text).join(' ').split(/\s+/);
  const names = textEntries(C).map((e) => e.name).join(' ').split(/\s+/);
  const heightOf = (e: HTMLElement) => e.getBoundingClientRect().height / stageScale();
  /** Nombre de caractères qui tiennent sur `lines` lignes (pire départ du corpus). */
  /**
   * Caractères qui tiennent sur `lines` lignes, mesurés en remplissant le vrai conteneur avec les vraies
   * phrases du contenu, mot après mot, depuis de nombreux points de départ : « sûr » = le pire départ,
   * « courant » = la médiane. Le rognage (line-clamp, max-height) est levé le temps de la mesure.
   */
  const capacity = (target: HTMLElement, words: string[], lines: number): { sûr: number; courant: number } => {
    const keep = target.innerHTML;
    const keepCss = target.style.cssText;
    target.style.cssText += ';display:block;-webkit-line-clamp:unset;max-height:none;overflow:visible;height:auto';
    target.innerHTML = 'A';
    const one = heightOf(target);
    const got: number[] = [];
    for (let start = 0; start < Math.min(words.length - 40, 900); start += 7) {
      let txt = '';
      for (let i = start; i < words.length; i++) {
        const next = txt ? `${txt} ${words[i]}` : words[i];
        target.innerHTML = colorize(next);
        if (heightOf(target) > one * lines + one * 0.3) break;
        txt = next;
      }
      got.push(txt.length);
    }
    target.innerHTML = keep;
    target.style.cssText = keepCss;
    got.sort((a, b) => a - b);
    return { sûr: got[0] ?? 0, courant: got[Math.floor(got.length / 2)] ?? 0 };
  };
  const probeIn = async (label: string, open: () => Promise<Element[]>, ruleSel: string, nameSel: string) => {
    resetUI();
    const roots = await open();
    const root = roots[0];
    const rule = root.querySelector(ruleSel) as HTMLElement | null;
    const name = root.querySelector(nameSel) as HTMLElement | null;
    const width = rule ? Math.round(rule.getBoundingClientRect().width / stageScale()) : 0;
    return {
      label,
      width,
      rule3: rule ? capacity(rule, corpus, 3) : null,
      name1: name ? capacity(name, names, 1) : null,
    };
  };

  (window as unknown as { __audit: unknown }).__audit = {
    list: () => cases.map((c, i) => ({ index: i, group: c.group, name: c.name })),
    async run(i: number, overlay = true): Promise<CaseResult> {
      const c = cases[i];
      const res: CaseResult = { index: i, group: c.group, name: c.name, state: c.state, findings: [] };
      try {
        resetUI();
        const roots = await c.run();
        if (c.name.startsWith('balayage')) {
          // chaque infobulle de l'écran, l'une après l'autre ; on garde affichée la première fautive
          let firstBad: Element | null = null;
          for (const t of sweepTargets()) {
            if (!openTip(t)) continue;
            const f = auditRoots([L.tooltip]).map((x) => ({ ...x, a: `[infobulle de ${describe(t)}] ${x.a}` }));
            if (f.length && !firstBad) firstBad = t;
            res.findings.push(...f);
          }
          if (firstBad) openTip(firstBad);
          else hideTip();
        } else {
          res.findings = auditRoots(roots);
        }
        if (overlay && res.findings.length) drawOverlay(res.findings);
      } catch (err) {
        res.error = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
      }
      return res;
    },
    async probe() {
      const out = [];
      out.push(await probeIn('(a) offre de boutique, 5 colonnes (Vitrine)', async () => (await (cases.find((c) => c.group === 'boutique' && c.name.startsWith('4 de front'))!).run()), '.sh-col:not(.priv) .sh-rule', '.sh-col:not(.priv) .sh-name'));
      out.push(await probeIn('(a) offre de boutique, 4 colonnes', async () => (await (cases.find((c) => c.group === 'boutique' && c.name.startsWith('3 de front'))!).run()), '.sh-col:not(.priv) .sh-rule', '.sh-col:not(.priv) .sh-name'));
      out.push(await probeIn('(a) privilège en boutique, 5 colonnes', async () => (await (cases.find((c) => c.group === 'boutique' && c.name.startsWith('4 de front'))!).run()), '.sh-col.priv .sh-rule', '.sh-col.priv .sh-name'));
      out.push(await probeIn('(b) infobulle avec image (objet de la colonne)', async () => (await itemTip('atout', C.atouts[0].id, 0, true)()), '.tt-body', '.tt-name'));
      out.push(await probeIn('(b) infobulle sans image (patron, bouton)', async () => {
        g.load(clone(playing));
        await settle();
        const chip = L.table.querySelector('.pl-bosschip');
        if (chip) openTip(chip);
        await settle();
        return [L.tooltip];
      }, '.tt-body', '.tt-name'));
      out.push(await probeIn('(c) bloc de pot-de-vin', intro(C.bosses[0].id, 0, longestSkip, 9999999), '.in-bribe .in-boss-rule', '.in-bribe .in-bribe-name'));
      out.push(await probeIn('(d) bloc du patron (présentation)', intro(C.bosses[0].id, 0, null, 9999999), '.in-boss .in-boss-rule', '.in-boss .in-boss-name'));
      out.push(await probeIn('(e) plaque de la table du patron', async () => {
        const s = withHand(small(2), small(2, 'spades'), (x) => {
          x.tableIndex = 2;
          x.table!.kind = 'patron';
          x.table!.bossId = x.bossId;
        });
        g.load(s);
        await settle();
        return [L.table];
      }, '.pl-rule', '.pl-boss'));
      resetUI();
      return out;
    },
    reset: resetUI,
    clear: clearOverlay,
  };
}
