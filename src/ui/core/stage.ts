/**
 * La scène : 1280×720 unités, mise à l'échelle d'un bloc dans la fenêtre (letterbox en Nuit).
 * On positionne tout en absolu dans ces unités, comme dans un moteur de jeu.
 */
import { onFrame, shake } from './anim';

export const STAGE_W = 1280;
export const STAGE_H = 720;

export interface StageLayers {
  frame: HTMLElement;
  stage: HTMLElement;
  bg: HTMLCanvasElement;
  /** Tout ce qui secoue avec la table. */
  world: HTMLElement;
  table: HTMLElement;
  cards: HTMLElement;
  screens: HTMLElement;
  fx: HTMLElement;
  /** Au-dessus des écrans, ne secoue pas (infobulles, réglages). */
  top: HTMLElement;
  tooltip: HTMLElement;
  crt: HTMLElement;
}

let scale = 1;
let stageEl: HTMLElement | null = null;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  parent?: HTMLElement,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

export function place(e: HTMLElement, x: number, y: number, w?: number, h?: number): HTMLElement {
  e.style.left = `${x}px`;
  e.style.top = `${y}px`;
  if (w !== undefined) e.style.width = `${w}px`;
  if (h !== undefined) e.style.height = `${h}px`;
  return e;
}

export function buildStage(root: HTMLElement): StageLayers {
  root.innerHTML = '';
  const frame = el('div', 'frame', root);
  const stage = el('div', 'stage', frame);
  stageEl = stage;
  const bg = el('canvas', 'bg', stage);
  const world = el('div', 'world', stage);
  const table = el('div', 'layer layer-table', world);
  const cards = el('div', 'layer layer-cards', world);
  const screens = el('div', 'layer layer-screens', world);
  const fx = el('div', 'layer layer-fx', world);
  const top = el('div', 'layer layer-top', stage);
  const tooltip = el('div', 'tooltip', stage);
  const crt = el('div', 'crt', stage);
  el('div', 'crt-scan', crt);
  el('div', 'crt-vignette', crt);
  el('div', 'crt-fringe', crt);

  const fit = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    scale = Math.min(w / STAGE_W, h / STAGE_H);
    stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  };
  window.addEventListener('resize', fit);
  fit();

  onFrame(() => {
    const t = shake.x || shake.y ? `translate(${shake.x}px, ${shake.y}px)` : '';
    if (world.style.transform !== t) world.style.transform = t;
  });

  return { frame, stage, bg, world, table, cards, screens, fx, top, tooltip, crt };
}

/** Convertit une position écran en unités de scène. */
export function toStage(clientX: number, clientY: number): { x: number; y: number } {
  if (!stageEl) return { x: clientX, y: clientY };
  const r = stageEl.getBoundingClientRect();
  return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
}

/** Rectangle d'un élément en unités de scène. */
export function stageRect(e: Element): { x: number; y: number; w: number; h: number; cx: number; cy: number } {
  if (!stageEl) return { x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0 };
  const r = e.getBoundingClientRect();
  const s = stageEl.getBoundingClientRect();
  const x = (r.left - s.left) / scale;
  const y = (r.top - s.top) / scale;
  const w = r.width / scale;
  const h = r.height / scale;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

export function stageScale(): number {
  return scale;
}
