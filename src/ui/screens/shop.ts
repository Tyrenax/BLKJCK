/**
 * La boutique : le comptoir monte du bas. Offres (atouts, combines, faveurs, cartes),
 * privilège du salon, relance, Déchiqueteuse. Les atouts restent à gauche pour vendre / réordonner.
 */
import type { Engine, RunState, ShopOffer } from '../../engine/types';
import { sfx } from '../audio/sfx';
import { el, place } from '../core/stage';
import { drawCardBack, drawEmblem } from '../gfx/cardArt';
import type { Game } from '../game';
import { atoutText } from '../view/items';
import { Sprite } from '../view/sprite';
import { cardName, faceOf, POS } from '../view/table';
import { attachTip, colorize } from '../view/tooltip';
import { button, Panel, refreshButtons } from './common';

const KIND_LABEL = { atout: 'Atout', combine: 'Combine', faveur: 'Faveur', privilege: 'Privilège', card: 'Carte' } as const;
const PX = 338;
/**
 * Hauteur du panneau : sous la carte, 2 lignes de nom et une zone de règle de 7 lignes, mesurée pour
 * qu'une phrase de 90 caractères tienne entière dans la colonne la plus étroite (5 colonnes, Vitrine).
 */
const PY = 78;
const PH = 630;
/** Bord du cadre (f-panel) : les cartes sont placées dans la zone intérieure du panneau. */
const BORDER = 12;
/** Colonne d'offre (coordonnées de colonne) : étiquette de prix, carte, texte, bouton. */
const COL = { h: 468, cardY: 120, buy: 424 };

interface OfferView {
  offer: ShopOffer;
  sprite: Sprite;
  col: HTMLElement;
  x: number;
  y: number;
}

function offerInfo(eng: Engine, o: ShopOffer, s: RunState): { name: string; sub: string; body: string; face: HTMLCanvasElement } {
  if (o.kind === 'card' && o.card) {
    const enh = o.card.enhancement ? eng.content.enhancements[o.card.enhancement] : null;
    return { name: cardName(o.card), sub: enh ? `Carte ${enh.name.toLowerCase()}` : 'Carte', body: enh ? enh.description : 'Rejoint ton sabot.', face: faceOf(o.card) };
  }
  if (o.kind === 'atout') {
    const d = eng.content.atouts.find((a) => a.id === o.defId);
    if (d) return { name: d.name, sub: `Atout ${d.rarity === 'legendaire' ? 'légendaire' : d.rarity.replace('-', ' ')}`, body: atoutText(d, null, s), face: drawEmblem(d.art, 'atout', d.rarity) };
  }
  if (o.kind === 'privilege') {
    const d = eng.content.privileges.find((p) => p.id === o.defId);
    if (d) return { name: d.name, sub: 'Privilège définitif', body: d.description, face: drawEmblem(d.art, 'privilege') };
  }
  const d = eng.content.consumables.find((c) => c.id === o.defId);
  if (d) return { name: d.name, sub: d.kind === 'combine' ? 'Combine à usage unique' : 'Faveur', body: d.description, face: drawEmblem(d.art, d.kind) };
  return { name: o.defId, sub: KIND_LABEL[o.kind], body: '', face: drawCardBack('player') };
}

export class ShopScreen {
  private panel: Panel;
  private root: HTMLElement;
  private offersEl: HTMLElement;
  private money: HTMLElement;
  private views: OfferView[] = [];
  private sig = '';
  private reroll: HTMLButtonElement;
  private shred: HTMLButtonElement;
  private leave: HTMLButtonElement;

  constructor(parent: HTMLElement, private game: Game) {
    this.root = place(el('div', 'shop f-panel', parent), PX, PY, 924, PH);
    this.panel = new Panel(this.root, 'bottom');
    const head = el('div', 'sh-head', this.root);
    el('div', 'sh-title t-num', head, 'Arrière-boutique');
    el('div', 'sh-tag t-body', head, 'on ne pose pas de questions');
    this.money = el('div', 'sh-money t-num c-laiton', head);
    this.offersEl = el('div', 'sh-offers', this.root);
    const foot = el('div', 'sh-foot', this.root);
    const st = () => this.game.state;
    this.reroll = button(foot, 'Relancer', { x: 0, y: 0, w: 220, why: () => (st() && !this.game.busy ? this.game.engine.whyIllegal(st()!, { type: 'reroll' }) : 'Attends.'), tip: 'Trois nouvelles offres. Le prix monte à chaque relance.' }, () => void this.game.act({ type: 'reroll' }));
    this.shred = button(foot, 'Déchiqueteuse', { x: 232, y: 0, w: 260, why: () => (st() && !this.game.busy ? this.game.engine.whyIllegal(st()!, { type: 'shredCard', cardId: st()!.deck[0]?.id ?? -1 }) : 'Attends.'), tip: 'Retire définitivement une carte de ton sabot.' }, () => this.game.screens.deck.open('shred'));
    this.leave = button(foot, 'Quitter la boutique', { tone: 'petrole', key: 'Espace', x: 560, y: 0, w: 330 }, () => this.primary());
  }

  show(s: RunState): void {
    const shop = s.shop;
    if (!shop) return;
    this.money.textContent = `${s.money} $`;
    const rc = shop.rerollCost;
    this.reroll.innerHTML = `Relancer <span class="c-laiton">${rc} $</span>`;
    this.shred.innerHTML = shop.shredsLeft > 0 ? `Déchiqueteuse <span class="c-laiton">${shop.shredCost} $</span>` : 'Déchiqueteuse';
    const sig = shop.offers.map((o) => `${o.offerId}:${o.kind}:${o.defId}:${o.card?.id ?? ''}`).join('|');
    if (sig !== this.sig) {
      const reroll = this.sig !== '' && this.panel.open;
      this.sig = sig;
      this.build(s, reroll);
    }
    for (const v of this.views) {
      const o = shop.offers.find((x) => x.offerId === v.offer.offerId) ?? v.offer;
      v.offer = o;
      v.col.classList.toggle('sold', o.sold);
      v.sprite.root.style.visibility = o.sold ? 'hidden' : '';
    }
    refreshButtons(this.root);
    void this.panel.show();
  }

  private build(s: RunState, flipIn: boolean): void {
    for (const v of this.views) v.sprite.destroy();
    this.views = [];
    this.offersEl.innerHTML = '';
    const shop = s.shop!;
    const main = shop.offers.filter((o) => o.kind !== 'privilege');
    const priv = shop.offers.filter((o) => o.kind === 'privilege');
    // 3 offres + privilège : 4 colonnes, le privilège à droite ; 4 offres (Vitrine) + privilège : 5 colonnes
    const five = main.length + priv.length > 4;
    const colW = 170;
    const step = five ? 176 : 180;
    const startX = five ? 13 : 24;
    const place1 = (o: ShopOffer, x: number) => {
      const eng = this.game.engine;
      const info = offerInfo(eng, o, s);
      const col = place(el('div', `sh-col ${o.kind === 'privilege' ? 'priv' : ''}`, this.offersEl), x, 0, colW, COL.h);
      const tag = el('div', 'sh-price t-num', col, `${o.cost} $`);
      void tag;
      const txt = el('div', 'sh-text', col);
      el('div', 'sh-name t-num', txt, info.name).dataset.wrap = 'ok'; // deux lignes prévues pour le nom
      el('div', 'sh-kind t-num', txt, info.sub);
      el('div', 'sh-rule t-body', txt).innerHTML = colorize(info.body);
      // carte survolée : sa colonne aussi (une règle trop longue s'y montre en entier)
      const hover = (on: boolean) => col.classList.toggle('hover', on);
      const sp = new Sprite({ face: info.face, back: drawCardBack('player'), faceUp: !flipIn, parent: this.root, size: 2 });
      const cx = x + colW / 2;
      const cy = 56 + COL.cardY;
      sp.jump(cx, flipIn ? cy - 30 : cy, 0);
      sp.moveTo(cx, cy, 0);
      sp.root.classList.add('clickable');
      if (flipIn) void sp.flip(true, 260);
      attachTip(sp.root, () => {
        const w = this.why(o);
        return w ? { name: info.name, why: w } : null;
      });
      sp.root.addEventListener('click', () => this.buy(o.offerId));
      sp.root.addEventListener('pointerenter', () => hover(true));
      sp.root.addEventListener('pointerleave', () => hover(false));
      button(col, 'Acheter', { small: true, x: Math.round((colW - 124) / 2), y: COL.buy, w: 124, why: () => this.why(this.views.find((v) => v.offer.offerId === o.offerId)?.offer ?? o) }, () => this.buy(o.offerId));
      this.views.push({ offer: o, sprite: sp, col, x: cx, y: cy });
    };
    main.forEach((o, i) => place1(o, startX + i * step));
    priv.forEach((o, i) => place1(o, five ? startX + (main.length + i) * step : 900 - 24 - colW - i * step - 12));
    // les colonnes du bord s'élargissent vers l'intérieur du panneau
    const byX = [...this.views].sort((a, b) => a.x - b.x);
    byX[0]?.col.classList.add('edge-l');
    byX[byX.length - 1]?.col.classList.add('edge-r');
    this.fitColumns();
    if (flipIn) sfx.card();
  }

  /**
   * Jamais de règle coupée : chaque colonne garde sa règle entière au corps normal, sinon un cran plus
   * petit (règle, puis nom) ; si même ainsi elle déborde, la colonne s'élargit au survol pour la montrer.
   */
  fitColumns(): void {
    for (const v of this.views) {
      const txt = v.col.querySelector('.sh-text') as HTMLElement;
      const rule = txt.querySelector('.sh-rule') as HTMLElement;
      const name = txt.querySelector('.sh-name') as HTMLElement;
      rule.classList.remove('small', 'smaller');
      name.classList.remove('small');
      v.col.classList.remove('crowded');
      const over = () => txt.scrollHeight > txt.clientHeight + 1;
      // un cran (règle), puis le nom, puis un second cran pour la règle seule
      if (over()) rule.classList.add('small');
      if (over()) name.classList.add('small');
      if (over()) rule.classList.replace('small', 'smaller');
      // réduite : au survol, la colonne s'élargit et montre la règle entière au corps normal
      const reduced = rule.classList.contains('small') || rule.classList.contains('smaller') || name.classList.contains('small');
      v.col.classList.toggle('crowded', reduced);
      if (reduced) txt.dataset.popup = '1';
      else delete txt.dataset.popup;
    }
  }

  private why(o: ShopOffer): string | null {
    const s = this.game.state;
    if (!s || this.game.busy) return 'Attends.';
    if (o.sold) return 'Vendu.';
    return this.game.engine.whyIllegal(s, { type: 'buy', offerId: o.offerId });
  }

  private buy(offerId: number): void {
    const v = this.views.find((x) => x.offer.offerId === offerId);
    if (!v) return;
    const w = this.why(v.offer);
    if (w) {
      sfx.nope();
      v.sprite.shakeIt(0.5);
      return;
    }
    void this.game.act({ type: 'buy', offerId });
  }

  /** L'objet acheté part de son emplacement vers sa destination. */
  onBought(offerId: number): void {
    const v = this.views.find((x) => x.offer.offerId === offerId);
    if (!v) return;
    const stageX = PX + BORDER + v.x;
    const stageY = PY + BORDER + v.y;
    if (v.offer.kind === 'card') {
      v.sprite.z = 999;
      v.sprite.moveTo(POS.playerShoe.x - PX - BORDER, POS.playerShoe.y - PY - BORDER, -6);
      sfx.card();
      setTimeout(() => (v.sprite.root.style.visibility = 'hidden'), 380);
    } else {
      this.game.view.items.spawnHint = { x: stageX, y: stageY };
      v.sprite.root.style.visibility = 'hidden';
    }
    v.col.classList.add('sold');
    sfx.coin();
  }

  primary(): void {
    if (!this.panel.open || this.game.busy) return;
    void this.game.act({ type: 'leaveShop' });
  }

  hide(): void {
    if (!this.panel.open) return;
    void this.panel.hide();
    this.sig = '';
  }
}
