/**
 * Fin de partie et victoire, version complète : où l'on est tombé (table, patron, points manquants),
 * la meilleure main redistribuée en cartes, la frise des tables (objectif contre score), les comptes,
 * la graine. Sur la victoire : « Continuer en sans fin ».
 */
import type { RunState, TableRecord } from '../../engine/types';
import { sfx } from '../audio/sfx';
import { el, place } from '../core/stage';
import { drawCardBack, drawEmblem } from '../gfx/cardArt';
import type { EndScreenLike, Game } from '../game';
import { button, Panel } from '../screens/common';
import { fmt } from '../view/hud';
import { attachTip } from '../view/tooltip';
import { recordRun } from './profileStore';
import { dealRow, figureName, lab, runLabel, scoreLine, tableKindName } from './widgets';

const MAX_COLS = 24;
const BAR_H = 96;
const TICK_Y = 60; // hauteur du cran « objectif » depuis le bas de la barre

export class RunEndScreen implements EndScreenLike {
  private panel: Panel;
  private body: HTMLElement;
  private veil: HTMLElement;
  private won = false;

  constructor(parent: HTMLElement, private game: Game) {
    this.veil = el('div', 'end-veil', parent);
    this.veil.style.visibility = 'hidden';
    const root = place(el('div', 'x-root f-brass-dark', parent), 120, 28, 1040, 664);
    this.panel = new Panel(root, 'top');
    this.body = el('div', 'xe-body', root);
  }

  isOpen(): boolean {
    return this.panel.open;
  }

  show(s: RunState, won: boolean): void {
    if (this.panel.open) return;
    this.won = won;
    const { unlockedLevel } = recordRun(s);
    this.veil.style.visibility = 'visible';
    const g = this.game;
    const c = g.engine.content;
    const b = this.body;
    b.innerHTML = '';

    // ── Titre et phrase ──
    const endless = !!s.endless;
    el('div', `xe-title t-gothic ${won ? 'won' : 'lost'}`, b, won ? 'Tu as fait sauter la banque' : 'La maison gagne');
    const d = s.death;
    const sub = won
      ? `${c.balance.salons} salons, ${c.balance.salons} patrons. On ne te reverra plus ici.`
      : d
        ? `Il te manquait ${fmt(d.missing)} points${endless ? `, en mode sans fin, au salon ${d.salon}` : ''}.`
        : `Salon ${s.salon}.`;
    el('div', 'xe-sub t-body', b, sub);

    // ── Où l'on est tombé / le dernier patron ──
    const where = d ?? this.lastRecord(s);
    const boss = where?.bossId ? c.bosses.find((x) => x.id === where.bossId) : undefined;
    const fate = el('div', `xe-fate${boss ? ' live' : ''}`, b);
    const art = boss ? drawEmblem(boss.art, 'patron') : drawCardBack('dealer');
    art.className = 'xe-fate-art';
    fate.appendChild(art);
    if (boss) attachTip(art, () => ({ name: boss.name, sub: 'Patron', body: boss.description }));
    const ft = el('div', 'xe-fate-txt', fate);
    if (where) {
      lab(ft, won ? `le dernier patron, salon ${where.salon}` : `tombé au salon ${where.salon}`);
      if (boss) el('div', 'xe-boss t-gothic', ft, boss.name);
      else el('div', 'xe-kind t-num', ft, tableKindName(where.kind));
      if (won) {
        el('div', 'xe-miss t-num', ft, fmt(where.score));
        el('div', 'xe-small t-num', ft, `points pour un objectif de ${fmt(where.target)}`);
      } else {
        el('div', 'xe-miss t-num', ft, fmt(d?.missing ?? 0));
        el('div', 'xe-small t-num', ft, `points manquants, ${fmt(where.score)} sur ${fmt(where.target)}`);
      }
    }

    // ── La meilleure main ──
    const best = el('div', 'xe-best', b);
    const bh = s.bestHand;
    lab(best, bh ? `ta meilleure main, salon ${bh.salon}` : 'ta meilleure main');
    const row = el('div', 'xe-best-cards', best);
    if (bh) {
      el('div', 'xe-fig t-gothic', best, figureName(g, bh.figure));
      el('div', 'xe-score t-num', best).innerHTML = scoreLine(bh.chips, bh.mult, bh.score);
    } else {
      el('div', 'xe-none t-body', best, "Aucune main n'a marqué.");
    }

    // ── La frise des tables ──
    this.frise(b, s);

    // ── Les comptes ──
    const st = s.stats;
    const stats = el('div', 'xe-stats', b);
    const stat = (v: string, k: string) => {
      const e = el('div', 'xe-stat', stats);
      el('div', 'xe-stat-v t-num', e, v);
      el('div', 'xe-stat-k t-num', e, k);
    };
    stat(`${st.tablesWon}`, st.tablesWon > 1 ? 'tables battues' : 'table battue');
    stat(`${st.handsWon} sur ${st.handsPlayed}`, 'mains gagnées');
    stat(`${st.blackjacks}`, st.blackjacks > 1 ? 'blackjacks' : 'blackjack');
    stat(`${st.busts}`, 'fois crevé');
    stat(`${st.dealerBusts}`, 'croupier crevé');
    if (st.tablesSkipped) stat(`${st.tablesSkipped}`, 'pots-de-vin');

    if (unlockedLevel !== null) {
      const stake = c.stakes?.[unlockedLevel];
      if (stake) el('div', 'xe-unlock t-num', b, `Avec ce sabot, tu peux maintenant jouer la ${stake.name}.`);
    }

    // ── Pied : graine et boutons ──
    const foot = el('div', 'xe-foot', b);
    const seed = el('div', 'xe-seed t-num', foot, `graine ${s.seed}`);
    attachTip(seed, () => ({ name: 'Graine', body: 'Clique pour la copier : même graine, même sabot, même nuit.' }));
    seed.addEventListener('click', () => {
      sfx.tick();
      void navigator.clipboard?.writeText(s.seed).catch(() => undefined);
    });
    el('div', 'xe-run t-num', foot, runLabel(g, s));
    if (won && !endless) {
      const why = () => (g.busy ? 'Attends.' : g.engine.whyIllegal(g.state ?? s, { type: 'continueEndless' }));
      button(foot, 'Continuer en sans fin', { tone: 'petrole', key: 'Espace', w: 340, x: 286, y: 0, why, tip: 'Encaisse la table, passe à la boutique et continue : les objectifs ne cessent plus de monter.' }, () => this.primary());
      button(foot, 'Nouvelle partie', { w: 230, x: 638, y: 0 }, () => this.newRun());
      button(foot, 'Titre', { w: 120, x: 880, y: 0 }, () => g.toTitle());
    } else {
      button(foot, 'Nouvelle partie', { tone: 'petrole', key: 'Espace', w: 300, x: 568, y: 0 }, () => this.primary());
      button(foot, 'Titre', { w: 120, x: 880, y: 0 }, () => g.toTitle());
    }

    void this.panel.show().then(() => {
      if (bh && this.panel.open) void dealRow(row, bh.cards, { width: 300, gap: 10, scale: 2 });
    });
  }

  /** Espace : continuer en sans fin sur la victoire, nouvelle partie sinon. */
  primary(): void {
    if (!this.panel.open) return;
    const s = this.game.state;
    if (this.won && s && !s.endless) {
      this.hide();
      void this.game.act({ type: 'continueEndless' });
      return;
    }
    this.newRun();
  }

  hide(): void {
    this.veil.style.visibility = 'hidden';
    void this.panel.hide();
  }

  private newRun(): void {
    this.hide();
    const launch = this.game.screens.launch;
    if (launch) {
      this.game.toTitle();
      launch.open();
    } else void this.game.newRun();
  }

  private lastRecord(s: RunState): TableRecord | undefined {
    return s.history?.at(-1);
  }

  /** Une colonne par table : la barre du score, le cran de l'objectif ; groupées par salon. */
  private frise(parent: HTMLElement, s: RunState): void {
    const box = el('div', 'xe-frise', parent);
    const all = s.history ?? [];
    // au-delà de MAX_COLS tables, on montre les dernières et on le dit (pas de « … »)
    const cut = all.length > MAX_COLS;
    lab(box, cut ? `la nuit, ses ${MAX_COLS} dernières tables sur ${all.length}` : 'la nuit, table par table', 'xe-frise-lab');
    const cols = el('div', 'xe-cols', box);
    const recs = all.slice(-MAX_COLS);
    const colW = 30;
    const gap = 8;
    const salonGap = 14;
    let x = 0;
    // largeur totale pour centrer la frise
    let total = x;
    recs.forEach((r, i) => {
      total += colW + (i > 0 ? (recs[i - 1].salon !== r.salon ? salonGap : gap) : 0);
    });
    x += Math.max(0, Math.round((1000 - total) / 2));
    let groupStart = x;
    recs.forEach((r, i) => {
      if (i > 0) {
        const newSalon = recs[i - 1].salon !== r.salon;
        if (newSalon) this.salonLabel(cols, recs[i - 1].salon, groupStart, x);
        x += newSalon ? salonGap : gap;
        if (newSalon) groupStart = x;
      }
      const col = place(el('div', 'xe-col', cols), x, 0);
      const ratio = r.target > 0 ? r.score / r.target : 0;
      const h = r.result === 'skipped' ? TICK_Y : Math.max(4, Math.min(BAR_H, Math.round(ratio * TICK_Y)));
      const bar = el('div', `xe-bar ${r.result}`, col);
      bar.style.height = `${h}px`;
      const tick = el('div', 'xe-tick', col);
      tick.style.bottom = `${TICK_Y}px`;
      if (r.kind === 'patron') el('div', 'xe-boss-pip', col);
      const boss = r.bossId ? this.game.engine.content.bosses.find((b) => b.id === r.bossId) : undefined;
      const reward = r.skipRewardId ? this.game.engine.content.skipRewards?.find((x) => x.id === r.skipRewardId) : undefined;
      attachTip(col, () => ({
        name: `Salon ${r.salon}, ${tableKindName(r.kind).toLowerCase()}`,
        sub: boss ? boss.name : r.result === 'skipped' ? 'Sautée contre un pot-de-vin' : undefined,
        body:
          r.result === 'skipped'
            ? `${reward?.name ?? 'Pot-de-vin'} : ${reward?.description ?? ''}`
            : `${fmt(r.score)} sur ${fmt(r.target)} en ${r.handsPlayed} mains, ${r.handsWon} gagnées${r.payout ? `, +${r.payout} $` : ''}.`,
      }));
      x += colW;
      if (i === recs.length - 1) this.salonLabel(cols, r.salon, groupStart, x);
    });
  }

  private salonLabel(parent: HTMLElement, salon: number, x0: number, x1: number): void {
    const e = place(el('div', 'xe-salon t-num', parent, `salon ${salon}`), x0 - 20, 110, x1 - x0 + 40);
    e.style.textAlign = 'center';
  }
}
