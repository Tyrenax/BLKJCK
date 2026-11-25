/**
 * Présentation de la table : objectif, récompense, patron du salon et sa règle, pot-de-vin.
 * Tout s'empile dans le panneau et les boutons viennent après le contenu, jamais dessus ;
 * la hauteur suit le contenu et le panneau remonte s'il le faut pour tenir dans la scène.
 */
import type { RunState } from '../../engine/types';
import { el, place, STAGE_H } from '../core/stage';
import { drawEmblem } from '../gfx/cardArt';
import type { Game } from '../game';
import { fitText, fmt } from '../view/hud';
import { attachTip, colorize } from '../view/tooltip';
import { button, Panel } from './common';

const KIND = { petite: 'Petite table', grande: 'Grande table', patron: 'Table du patron' } as const;
const TOP = 96;
const MARGIN = 8;

export class IntroScreen {
  private panel: Panel;
  private body: HTMLElement;
  constructor(parent: HTMLElement, private game: Game) {
    const root = place(el('div', 'intro f-brass', parent), 372, TOP, 536);
    this.panel = new Panel(root, 'top');
    this.body = el('div', 'intro-body', root);
  }

  show(s: RunState): void {
    const g = this.game;
    const eng = g.engine;
    const t = s.table;
    const kind = t?.kind ?? (['petite', 'grande', 'patron'] as const)[s.tableIndex];
    const boss = eng.content.bosses.find((b) => b.id === s.bossId) ?? null;
    const r = eng.getRules(s);
    const b = this.body;
    b.innerHTML = '';
    // le salon et l'échelle des trois tables sur une ligne, le nom de la table en dessous, pleine largeur
    const head = el('div', 'in-head', b);
    el('div', 'in-salon t-num', head, `Salon ${s.salon} sur ${eng.content.balance.salons}`);
    const ladder = el('div', 'in-ladder', head);
    (['petite', 'grande', 'patron'] as const).forEach((k, i) => {
      const step = el('div', `in-step ${i < s.tableIndex ? 'done' : i === s.tableIndex ? 'now' : ''}`, ladder);
      el('div', 'in-dot', step);
      el('div', 'in-steplab t-num', step, k === 'patron' ? (boss?.name ?? 'patron') : KIND[k].split(' ')[0].toLowerCase());
    });
    el('div', 'in-kind t-num', b, KIND[kind]);
    const row = el('div', 'in-row', b);
    const obj = el('div', 'in-obj', row);
    el('div', 'in-lab t-num', obj, 'objectif');
    const target = el('div', 'in-target t-num', obj, t ? fmt(t.target) : '?');
    el('div', 'in-sub t-num', obj, `${r.handsPerTable} mains, ${r.discardsPerTable} défausses`);
    const rew = el('div', 'in-rew', row);
    el('div', 'in-lab t-num', rew, 'récompense');
    el('div', 'in-money t-num', rew, `${eng.content.balance.tableRewards[kind]} $`);
    if (boss) {
      const bx = el('div', `in-boss ${kind === 'patron' ? 'live' : ''}`, b);
      const cv = drawEmblem(boss.art, 'patron');
      cv.className = 'in-boss-art';
      bx.appendChild(cv);
      const txt = el('div', 'in-boss-txt', bx);
      el('div', 'in-boss-lab t-num', txt, kind === 'patron' ? 'ce soir, le patron' : 'patron du salon');
      el('div', 'in-boss-name t-gothic', txt, boss.name);
      el('div', 'in-boss-rule t-body', txt).innerHTML = colorize(boss.description);
      attachTip(cv, () => ({ name: boss.name, sub: 'Patron', body: boss.description }));
    }
    // pot-de-vin : sauter une petite ou une grande table contre une récompense affichée
    const rewardId = kind !== 'patron' ? s.salonSkipRewards?.[s.tableIndex] ?? null : null;
    const reward = rewardId ? eng.content.skipRewards?.find((x) => x.id === rewardId) : undefined;
    if (reward) {
      const px = el('div', 'in-boss in-bribe', b);
      const art = drawEmblem(reward.art, 'pot');
      art.className = 'in-boss-art';
      px.appendChild(art);
      const txt = el('div', 'in-boss-txt', px);
      el('div', 'in-boss-lab t-num', txt, 'ou glisse un billet et saute la table');
      el('div', 'in-bribe-name t-num', txt, reward.name);
      el('div', 'in-boss-rule t-body', txt).innerHTML = colorize(reward.description);
      attachTip(art, () => ({ name: reward.name, sub: 'Pot-de-vin', body: reward.description }));
    }
    const foot = el('div', 'in-foot', b);
    button(foot, 'S\'asseoir', { tone: 'petrole', key: 'Espace', w: 236 }, () => this.primary());
    if (reward) {
      const why = () => (this.game.busy ? 'Attends.' : eng.whyIllegal(this.game.state ?? s, { type: 'skipTable' }));
      button(foot, 'Soudoyer', { w: 200, why, tip: 'Ni gain ni boutique pour cette table, mais la récompense ci-dessus.' }, () => void this.game.act({ type: 'skipTable' }));
    }
    fitText(target);
    // la hauteur suit le contenu ; le panneau remonte pour tenir dans la scène
    const root = this.panel.root;
    const h = root.offsetHeight;
    root.style.top = `${Math.max(MARGIN, Math.min(TOP, STAGE_H - MARGIN - h))}px`;
    void this.panel.show();
  }

  primary(): void {
    if (!this.panel.open) return;
    void this.game.act({ type: 'startTable' });
  }

  hide(): void {
    void this.panel.hide();
  }
}
