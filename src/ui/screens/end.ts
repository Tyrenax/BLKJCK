/** Fin de partie et victoire : le registre des comptes, puis « Nouvelle partie ». */
import type { RunState } from '../../engine/types';
import { el, place } from '../core/stage';
import type { Game } from '../game';
import { fmt } from '../view/hud';
import { button, Panel } from './common';

export class EndScreen {
  private panel: Panel;
  private body: HTMLElement;
  private veil: HTMLElement;
  constructor(parent: HTMLElement, private game: Game) {
    this.veil = el('div', 'end-veil', parent);
    this.veil.style.visibility = 'hidden';
    const root = place(el('div', 'end f-brass-dark', parent), 340, 90, 600, 520);
    this.panel = new Panel(root, 'top');
    this.body = el('div', 'end-body', root);
  }

  show(s: RunState, won: boolean): void {
    if (this.panel.open) return;
    this.veil.style.visibility = 'visible';
    const b = this.body;
    b.innerHTML = '';
    el('div', `end-title t-gothic ${won ? 'won' : 'lost'}`, b, won ? 'Tu as fait sauter la banque' : 'La maison gagne');
    const t = s.table;
    el('div', 'end-sub t-body', b, won ? 'Huit salons, huit patrons. On ne te reverra plus ici.' : t ? `Salon ${s.salon}, il te manquait ${fmt(Math.max(0, t.target - t.score))} points.` : `Salon ${s.salon}.`);
    const st = s.stats;
    const rows: [string, string][] = [
      ['Salon atteint', `${s.salon}`],
      ['Tables battues', `${st.tablesWon}`],
      ['Mains jouées', `${st.handsPlayed}`],
      ['Mains gagnées', `${st.handsWon}`],
      ['Blackjacks', `${st.blackjacks}`],
      ['Crevé', `${st.busts} fois`],
      ['Croupier crevé', `${st.dealerBusts} fois`],
      ['Meilleure main', fmt(st.bestHandScore)],
    ];
    const ledger = el('div', 'end-ledger', b);
    for (const [k, v] of rows) {
      const r = el('div', 'end-row t-num', ledger);
      el('span', 'end-k', r, k);
      el('span', 'end-dots', r);
      el('span', 'end-v', r, v);
    }
    el('div', 'end-seed t-num', b, `graine ${s.seed}`);
    button(b, 'Nouvelle partie', { tone: 'petrole', key: 'Espace', w: 290, x: 36, y: 412 }, () => this.primary());
    button(b, 'Écran titre', { w: 200, x: 340, y: 412 }, () => this.game.toTitle());
    void this.panel.show();
  }

  isOpen(): boolean {
    return this.panel.open;
  }

  primary(): void {
    if (!this.panel.open) return;
    this.hide();
    void this.game.newRun();
  }

  hide(): void {
    this.veil.style.visibility = 'hidden';
    void this.panel.hide();
  }
}
