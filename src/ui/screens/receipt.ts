/**
 * Encaissement : un ticket de caisse Ivoire sort de l'imprimante, les lignes s'impriment une à une,
 * puis « Encaisser ».
 */
import type { RunState } from '../../engine/types';
import { sfx } from '../audio/sfx';
import { ease, tween, wait } from '../core/anim';
import { el, place } from '../core/stage';
import type { Game } from '../game';
import { fmt } from '../view/hud';
import { button, Panel } from './common';

const LINE_H = 36;

export class ReceiptScreen {
  private panel: Panel;
  private paper: HTMLElement;
  private body: HTMLElement;
  private gen = 0;
  constructor(parent: HTMLElement, private game: Game) {
    const root = place(el('div', 'receipt', parent), 480, 40, 320, 560);
    this.panel = new Panel(root, 'top');
    el('div', 'rc-slot', root);
    this.paper = el('div', 'rc-paper', root);
    this.body = el('div', 'rc-body', this.paper);
    el('div', 'rc-teeth', this.paper);
  }

  show(s: RunState, payout: { lines: { label: string; amount: number }[]; total: number } | null): void {
    if (this.panel.open) return;
    const g = ++this.gen;
    const b = this.body;
    b.innerHTML = '';
    el('div', 'rc-title t-num', b, 'Encaissement');
    const t = s.table;
    el('div', 'rc-sub t-num', b, `Salon ${s.salon}, table ${s.tableIndex + 1} sur 3`);
    if (t) el('div', 'rc-score t-num', b, `${fmt(t.score)} pour ${fmt(t.target)}`);
    const list = el('div', 'rc-lines', b);
    const lines = payout?.lines ?? [];
    const total = payout?.total ?? lines.reduce((a, l) => a + l.amount, 0);
    const rows = lines.map((l) => {
      const r = el('div', 'rc-line t-num', list);
      el('span', 'rc-lab', r, l.label);
      el('span', 'rc-dots', r);
      el('span', 'rc-amt', r, `${l.amount} $`);
      r.style.visibility = 'hidden';
      return r;
    });
    const tot = el('div', 'rc-total t-num', b);
    el('span', 'rc-lab', tot, 'Total');
    const totAmt = el('span', 'rc-amt', tot, '0 $');
    tot.style.visibility = 'hidden';
    const head = 128;
    const full = head + lines.length * LINE_H + 70 + 84;
    const btn = button(b, 'Encaisser', { tone: 'ivory', key: 'Espace', w: 250, x: 23, y: head + lines.length * LINE_H + 74 }, () => this.primary());
    btn.style.visibility = 'hidden';
    this.paper.style.height = `${head}px`;
    void this.panel.show().then(async () => {
      let acc = 0;
      let h = head;
      for (let i = 0; i < rows.length; i++) {
        if (g !== this.gen) return;
        await wait(140);
        sfx.print();
        const from = h;
        h += LINE_H;
        await tween(120, (k) => (this.paper.style.height = `${from + (h - from) * k}px`), ease.outCubic);
        rows[i].style.visibility = 'visible';
        acc += lines[i].amount;
        totAmt.textContent = `${acc} $`;
      }
      if (g !== this.gen) return;
      await wait(140);
      sfx.print();
      const from = h;
      await tween(200, (k) => (this.paper.style.height = `${from + (full - from) * k}px`), ease.outCubic);
      tot.style.visibility = 'visible';
      totAmt.textContent = `${total} $`;
      sfx.coin();
      btn.style.visibility = 'visible';
    });
  }

  primary(): void {
    if (!this.panel.open) return;
    void this.game.act({ type: 'cashOut' });
  }

  hide(): void {
    this.gen++;
    void this.panel.hide();
  }
}
