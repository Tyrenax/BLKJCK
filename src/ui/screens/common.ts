/** Arrivées et départs des panneaux : ils viennent d'un bord qui a un sens, jamais d'un fondu. */
import { sfx } from '../audio/sfx';
import { ease, tween } from '../core/anim';
import { el } from '../core/stage';
import { attachTip } from '../view/tooltip';

export type Edge = 'top' | 'bottom' | 'right' | 'left';

function offset(edge: Edge, k: number): string {
  const d = 1 - k;
  switch (edge) {
    case 'top': return `translateY(${(-760 * d).toFixed(1)}px)`;
    case 'bottom': return `translateY(${(760 * d).toFixed(1)}px)`;
    case 'right': return `translateX(${(1000 * d).toFixed(1)}px)`;
    case 'left': return `translateX(${(-1000 * d).toFixed(1)}px)`;
  }
}

export class Panel {
  open = false;
  private gen = 0;
  constructor(readonly root: HTMLElement, readonly edge: Edge) {
    root.classList.add('panel-root');
    root.style.visibility = 'hidden';
  }
  async show(): Promise<void> {
    if (this.open) return;
    this.open = true;
    const g = ++this.gen;
    this.root.style.visibility = 'visible';
    sfx.whoosh();
    await tween(420, (k) => {
      if (g === this.gen) this.root.style.transform = offset(this.edge, k);
    }, ease.outBack);
  }
  async hide(): Promise<void> {
    if (!this.open) return;
    this.open = false;
    const g = ++this.gen;
    await tween(200, (k) => {
      if (g === this.gen) this.root.style.transform = offset(this.edge, 1 - k);
    }, ease.inCubic);
    if (g === this.gen) this.root.style.visibility = 'hidden';
  }
}

export function button(parent: HTMLElement, label: string, o: { tone?: string; key?: string; w?: number; x?: number; y?: number; small?: boolean; why?: () => string | null; tip?: string } = {}, run: () => void): HTMLButtonElement {
  const b = el('button', `btn ${o.tone ?? ''}${o.small ? ' small' : ''}`, parent) as HTMLButtonElement;
  b.innerHTML = `${label}${o.key ? `<span class="key">${o.key}</span>` : ''}`;
  if (o.w) b.style.width = `${o.w}px`;
  if (o.x !== undefined) b.style.left = `${o.x}px`;
  if (o.y !== undefined) b.style.top = `${o.y}px`;
  const refresh = () => b.classList.toggle('off', !!o.why?.());
  refresh();
  attachTip(b, () => {
    const w = o.why?.();
    if (w) return { name: label.replace(/<[^>]+>/g, ''), why: w };
    return o.tip ? { name: label.replace(/<[^>]+>/g, ''), body: o.tip } : null;
  });
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const w = o.why?.();
    if (w) {
      sfx.nope();
      b.classList.remove('refuse');
      void b.offsetWidth;
      b.classList.add('refuse');
      return;
    }
    sfx.press();
    run();
  });
  (b as HTMLButtonElement & { refresh?: () => void }).refresh = refresh;
  return b;
}

export function refreshButtons(root: HTMLElement): void {
  root.querySelectorAll('button').forEach((b) => (b as HTMLButtonElement & { refresh?: () => void }).refresh?.());
}
