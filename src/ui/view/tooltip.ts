/**
 * Infobulles au survol : nom, sous-titre, texte de règle (nombres colorés par sens),
 * raison d'un refus. Trois lignes de règle au plus.
 */
import { col, type ColorName } from '../core/palette';
import { stageRect } from '../core/stage';
import { ctx2d, drawMask, makeCanvas } from '../gfx/pixel';
import { suitMask, SUIT_CHARS } from '../gfx/suits';
import type { Suit } from '../../engine/types';

export interface TipContent {
  name: string;
  sub?: string;
  body?: string;
  why?: string | null;
  /** Carte montrée en ×2 à gauche du texte (objets affichés en petit à table). */
  art?: HTMLCanvasElement;
  /** Dernière ligne discrète (ex. « clic pour vendre, 3 $ »). */
  foot?: string;
}

type Provider = () => TipContent | null;
const providers = new WeakMap<Element, Provider>();
let box: HTMLElement;
let current: Element | null = null;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Enseignes pixel dans le texte : ♠♥♦♣ n'existent pas dans les polices du jeu, on les remplace
 * par nos propres enseignes (Cerise ou Ivoire, Encre sur le papier), à la hauteur du texte.
 */
export function installSymbols(): void {
  const root = document.documentElement;
  const mk = (s: Suit, c: ColorName) => {
    const cv = makeCanvas(7, 7);
    drawMask(ctx2d(cv), suitMask(s, 'small'), 0, 0, col(c));
    return `url(${cv.toDataURL()})`;
  };
  root.style.setProperty('--sym-hearts', mk('hearts', 'cerise'));
  root.style.setProperty('--sym-diamonds', mk('diamonds', 'cerise'));
  root.style.setProperty('--sym-spades', mk('spades', 'ivoire'));
  root.style.setProperty('--sym-clubs', mk('clubs', 'ivoire'));
  root.style.setProperty('--sym-spades-ink', mk('spades', 'encre'));
  root.style.setProperty('--sym-clubs-ink', mk('clubs', 'encre'));
}

export function suitify(html: string): string {
  return html.replace(/[♠♥♦♣]/g, (ch) => `<i class="sym sym-${SUIT_CHARS[ch]}"></i>`);
}

/** Colore les nombres d'un texte de règle (Jetons Menthe, Mult Braise, argent Laiton) et dessine les enseignes. */
export function colorize(text: string): string {
  let s = esc(text);
  s = s.replace(/([×x]\s?\d+(?:[.,]\d+)?)(\s?Mult)/g, '<span class="n-xmult">$1</span><span class="n-braise">$2</span>');
  s = s.replace(/([+\-−]?\d+(?:[.,]\d+)?)(\s?Mult)/g, '<span class="n-braise">$1$2</span>');
  s = s.replace(/([+\-−]?\d+(?:[.,]\d+)?)(\s?Jetons?)/g, '<span class="n-menthe">$1$2</span>');
  s = s.replace(/([+\-−]?\$\s?\d+|[+\-−]?\d+\s?\$)/g, '<span class="n-laiton">$1</span>');
  return suitify(s);
}

export function initTooltips(tooltip: HTMLElement, root: HTMLElement): void {
  box = tooltip;
  root.addEventListener('pointerover', (e) => {
    let t = e.target as Element | null;
    while (t && t !== root && !providers.has(t)) t = t.parentElement;
    if (t && providers.has(t)) show(t);
    else hide();
  });
  root.addEventListener('pointerleave', hide);
  root.addEventListener('pointerdown', () => hide());
}

/** Développement : éléments porteurs d'une infobulle (audit de mise en page). */
export const tipTargets: Set<WeakRef<Element>> | null = import.meta.env.DEV ? new Set() : null;

export function attachTip(e: Element, p: Provider): void {
  providers.set(e, p);
  tipTargets?.add(new WeakRef(e));
}

/** Ouvre l'infobulle d'un élément comme au survol (audit). */
export function openTip(t: Element): boolean {
  show(t);
  return current === t;
}

export function refreshTip(): void {
  if (current) show(current);
}

function show(t: Element): void {
  const p = providers.get(t);
  const c = p?.();
  if (!c) {
    hide();
    return;
  }
  current = t;
  let html = `<div class="tt-name">${esc(c.name)}</div>`;
  if (c.sub) html += `<div class="tt-sub">${esc(c.sub)}</div>`;
  if (c.body) html += `<div class="tt-body">${colorize(c.body)}</div>`;
  if (c.why) html += `<div class="tt-body tt-why">${esc(c.why)}</div>`;
  if (c.foot) html += `<div class="tt-foot">${colorize(c.foot)}</div>`;
  box.innerHTML = c.art ? `<div class="tt-row"><div class="tt-art"></div><div class="tt-txt">${html}</div></div>` : html;
  if (c.art) {
    const a = c.art;
    a.style.width = '120px';
    a.style.height = '168px';
    box.querySelector('.tt-art')!.appendChild(a);
  }
  box.classList.toggle('wide', !!c.art);
  box.classList.add('on');
  const r = stageRect(t);
  const bw = box.offsetWidth;
  const bh = box.offsetHeight;
  let x = r.cx - bw / 2;
  let y = r.y - bh - 10;
  if (y < 8) y = r.y + r.h + 10;
  x = Math.max(8, Math.min(1280 - bw - 8, x));
  y = Math.max(8, Math.min(720 - bh - 8, y));
  box.style.left = `${Math.round(x / 2) * 2}px`;
  box.style.top = `${Math.round(y / 2) * 2}px`;
}

export function hide(): void {
  current = null;
  box?.classList.remove('on');
}
