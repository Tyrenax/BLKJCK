/**
 * Vue du sabot : ce qu'il reste, par enseigne et par rang. Sert aussi à choisir des cartes
 * (combines d'atelier) et à nourrir la Déchiqueteuse.
 */
import type { Card, Rank, Suit } from '../../engine/types';
import { sfx } from '../audio/sfx';
import { el, place } from '../core/stage';
import { RANK_LABEL } from '../gfx/cardArt';
import { ctx2d, drawMask, makeCanvas, maskSize } from '../gfx/pixel';
import { isRed, suitMask } from '../gfx/suits';
import { col } from '../core/palette';
import type { Game } from '../game';
import { cardName, faceOf } from '../view/table';
import { attachTip } from '../view/tooltip';
import { button, Panel } from './common';

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export type DeckMode = 'view' | 'select' | 'shred';

function suitIcon(s: Suit): HTMLCanvasElement {
  const m = suitMask(s, 'small');
  const { w, h } = maskSize(m);
  const c = makeCanvas(w, h);
  drawMask(ctx2d(c), m, 0, 0, col(isRed(s) ? 'cerise' : 'ivoire'));
  c.className = 'dk-suit';
  return c;
}

export class DeckView {
  private panel: Panel;
  private root: HTMLElement;
  private grid: HTMLElement;
  private title: HTMLElement;
  private sub: HTMLElement;
  private foot: HTMLElement;
  mode: DeckMode = 'view';
  private shredPick: number | null = null;

  constructor(parent: HTMLElement, private game: Game) {
    this.root = place(el('div', 'deckview f-panel', parent), 332, 14, 932, 690);
    this.panel = new Panel(this.root, 'right');
    const head = el('div', 'dk-head', this.root);
    this.title = el('div', 'dk-title t-num', head);
    this.sub = el('div', 'dk-sub t-num', head);
    this.grid = el('div', 'dk-grid', this.root);
    this.foot = el('div', 'dk-foot', this.root);
  }

  isOpen(): boolean {
    return this.panel.open;
  }

  open(mode: DeckMode): void {
    this.mode = mode;
    this.shredPick = null;
    this.refresh();
    void this.panel.show();
  }

  hide(): void {
    if (this.mode === 'select' && this.game.mode === 'target' && this.panel.open) {
      this.mode = 'view';
      this.game.cancelMode();
      return;
    }
    void this.panel.hide();
  }

  refresh(): void {
    const s = this.game.state;
    if (!s) return;
    const t = s.table;
    const inTable = !!t && (t.drawPile.length > 0 || !!t.hand);
    const all: Card[] = s.deck;
    const remaining = new Set((inTable ? t!.drawPile : s.deck).map((c) => c.id));
    const next = this.game.engine.visibleNextCard(s);
    const sel = new Set(this.mode === 'select' ? this.game.targeting?.selected ?? [] : this.shredPick !== null ? [this.shredPick] : []);
    const clickable = this.mode !== 'view';
    this.title.textContent = this.mode === 'shred' ? 'La Déchiqueteuse' : 'Ton sabot';
    this.sub.textContent =
      this.mode === 'shred'
        ? 'Choisis la carte à retirer pour de bon.'
        : this.mode === 'select'
          ? `Choisis ${this.game.targeting ? (this.game.targeting.min === this.game.targeting.max ? this.game.targeting.min : `${this.game.targeting.min} à ${this.game.targeting.max}`) : ''} carte(s).`
          : inTable
            ? `Il reste ${remaining.size} cartes sur ${all.length}.`
            : `${all.length} cartes.`;
    this.grid.innerHTML = '';
    // en-têtes de rangs ; en pleine main, les rangs qui te feraient crever sont soulignés
    const spectrum = this.game.spectrumOf(s);
    const busting = new Set<Rank>();
    if (spectrum) {
      const limit = this.game.engine.getRules(s).playerLimit;
      for (const e of spectrum) if (e.total > limit) busting.add(e.card.rank);
    }
    RANKS.forEach((r, j) => {
      const n = all.filter((c) => c.rank === r && remaining.has(c.id)).length;
      const h = place(el('div', `dk-rank t-num${busting.has(r) ? ' bust' : ''}`, this.grid), 70 + j * 64, 372, 60, 40);
      h.innerHTML = `${RANK_LABEL[r]}<span>${n}</span>`;
    });
    if (spectrum) {
      const pct = Math.round((spectrum.filter((e) => e.total > this.game.engine.getRules(s).playerLimit).length / spectrum.length) * 100);
      const note = place(el('div', 'dk-note t-num', this.grid), 70, 420, 830, 30);
      note.innerHTML = busting.size ? `En rouge, les rangs qui te feraient crever : <span class="c-cerise">${pct} %</span> de ton sabot.` : 'Aucune carte de ton sabot ne te ferait crever.';
    }
    SUITS.forEach((suit, i) => {
      const row = place(el('div', 'dk-row', this.grid), 0, i * 92, 60, 84);
      row.appendChild(suitIcon(suit));
      const n = all.filter((c) => c.suit === suit && remaining.has(c.id)).length;
      el('div', 'dk-count t-num', row, String(n));
      RANKS.forEach((rank, j) => {
        const cards = all.filter((c) => c.suit === suit && c.rank === rank);
        cards.forEach((c, k) => {
          const f = faceOf(c);
          f.className = `dk-card${remaining.has(c.id) ? '' : ' out'}${sel.has(c.id) ? ' sel' : ''}${clickable ? ' pick' : ''}${next && next.id === c.id ? ' next' : ''}`;
          f.style.left = `${70 + j * 64 + k * 4}px`;
          f.style.top = `${i * 92 + k * 4}px`;
          f.style.zIndex = String(k + 1);
          this.grid.appendChild(f);
          attachTip(f, () => {
            const enh = c.enhancement ? this.game.engine.content.enhancements[c.enhancement] : null;
            return { name: cardName(c), sub: enh?.name ?? (remaining.has(c.id) ? 'dans le sabot' : 'déjà sortie'), body: enh?.description };
          });
          if (clickable) f.addEventListener('click', () => this.pick(c.id));
        });
      });
    });
    this.foot.innerHTML = '';
    if (this.mode === 'view') {
      button(this.foot, 'Fermer', { key: 'Espace', w: 200, x: 340, y: 0 }, () => this.hide());
    } else if (this.mode === 'select') {
      const tg = this.game.targeting;
      const n = tg?.selected.length ?? 0;
      button(this.foot, `Valider ${n}/${tg?.max ?? 0}`, { tone: 'petrole', key: 'Espace', w: 220, x: 220, y: 0, why: () => (tg && n >= tg.min ? null : 'Choisis tes cartes.') }, () => this.game.confirmTarget());
      button(this.foot, 'Annuler', { key: 'Échap', w: 200, x: 460, y: 0 }, () => this.game.cancelMode());
    } else {
      const shop = s.shop;
      const why = () => (this.shredPick === null ? 'Choisis une carte.' : this.game.engine.whyIllegal(s, { type: 'shredCard', cardId: this.shredPick }));
      button(this.foot, `Déchiqueter <span class="c-laiton">${shop?.shredCost ?? 0} $</span>`, { tone: 'bordeaux', w: 260, x: 190, y: 0, why }, () => {
        const id = this.shredPick;
        if (id === null) return;
        sfx.shred();
        void this.panel.hide();
        void this.game.act({ type: 'shredCard', cardId: id });
      });
      button(this.foot, 'Annuler', { key: 'Échap', w: 200, x: 470, y: 0 }, () => void this.panel.hide());
    }
  }

  private pick(id: number): void {
    if (this.mode === 'select') {
      this.game.toggleTarget(id);
      return;
    }
    if (this.mode === 'shred') {
      this.shredPick = this.shredPick === id ? null : id;
      sfx.tick();
      this.refresh();
    }
  }
}
