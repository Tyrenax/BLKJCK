/**
 * Barre d'actions sur le bourrelet, en bas : Tirer, Rester, Doubler, Défausser…
 * Les boutons refusés sont grisés et donnent la raison (engine.whyIllegal) au survol.
 */
import { sfx } from '../audio/sfx';
import { el, place } from '../core/stage';
import { attachTip } from './tooltip';

export interface ButtonSpec {
  id: string;
  label: string;
  key?: string;
  tone?: 'petrole' | 'bordeaux' | 'ivory' | '';
  width?: number;
  why?: string | null;
  tip?: string;
  run: () => void;
}

export class ActionBar {
  readonly root: HTMLElement;
  private hint: HTMLElement;
  private specs: ButtonSpec[] = [];
  private buttons = new Map<string, HTMLButtonElement>();

  constructor(parent: HTMLElement) {
    this.root = place(el('div', 'actions', parent), 330, 628, 620, 72);
    this.hint = place(el('div', 'actions-hint t-num', parent), 330, 694, 620, 24);
  }

  set(specs: ButtonSpec[], hint = ''): void {
    const sig = specs.map((s) => `${s.id}:${s.label}:${s.why ?? ''}:${s.tone ?? ''}`).join('|') + `#${hint}`;
    this.specs = specs;
    this.hint.textContent = hint;
    if (this.root.dataset.sig === sig) return;
    this.root.dataset.sig = sig;
    this.root.innerHTML = '';
    this.buttons.clear();
    const gap = 10;
    const widths = specs.map((s) => s.width ?? 148);
    const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, specs.length - 1);
    let x = Math.round((620 - total) / 2);
    specs.forEach((s, i) => {
      const b = el('button', `btn ${s.tone ?? ''}${s.why ? ' off' : ''}`, this.root) as HTMLButtonElement;
      b.innerHTML = `${s.label}${s.key ? `<span class="key">${s.key}</span>` : ''}`;
      b.style.left = `${x}px`;
      b.style.top = '0px';
      b.style.width = `${widths[i]}px`;
      x += widths[i] + gap;
      attachTip(b, () => {
        const cur = this.specs.find((p) => p.id === s.id);
        if (cur?.why) return { name: s.label, why: cur.why };
        return cur?.tip ? { name: s.label, body: cur.tip } : null;
      });
      b.addEventListener('click', () => this.trigger(s.id));
      this.buttons.set(s.id, b);
    });
  }

  /** Déclenche un bouton (clic ou clavier). Renvoie vrai s'il existe. */
  trigger(id: string): boolean {
    const s = this.specs.find((p) => p.id === id);
    if (!s) return false;
    const b = this.buttons.get(id);
    if (s.why) {
      sfx.nope();
      if (b) {
        b.classList.remove('refuse');
        void b.offsetWidth;
        b.classList.add('refuse');
      }
      return true;
    }
    sfx.press();
    if (b) {
      b.classList.add('down');
      setTimeout(() => b.classList.remove('down'), 110);
    }
    s.run();
    return true;
  }

  setHint(text: string): void {
    this.hint.textContent = text;
  }

  has(id: string): boolean {
    return this.specs.some((s) => s.id === id);
  }

  clear(hint = ''): void {
    this.set([], hint);
  }
}
