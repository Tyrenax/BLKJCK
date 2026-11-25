/**
 * Les cartes sur le tapis : mains du joueur et du croupier, sabots, défausse.
 * Une carte ne se téléporte jamais : elle sort d'un sabot et y retourne (ou part à la défausse).
 */
import type { Card, Engine, RunState } from '../../engine/types';
import { sfx } from '../audio/sfx';
import { clock, wait } from '../core/anim';
import { el, place } from '../core/stage';
import { drawCardBack, drawCardFace, RANK_LABEL } from '../gfx/cardArt';
import { cloneCanvas } from '../gfx/pixel';
import { SUIT_NAME } from '../gfx/suits';
import { Sprite } from './sprite';
import { attachTip } from './tooltip';

export const POS = {
  playerHand: { x: 640, y: 532 },
  dealerHand: { x: 640, y: 130 },
  playerShoe: { x: 262, y: 568 },
  playerDiscard: { x: 112, y: 568 },
  dealerShoe: { x: 1178, y: 122 },
};

type Owner = 'player' | 'dealer';
/** Ressort du vol d'une carte distribuée (les autres mouvements gardent 160 / 19). */
const DEAL_SPRING = { k: 90, d: 14.5 };
interface Entry {
  sprite: Sprite;
  card: Card;
  key: string;
  owner: Owner;
  faceDown: boolean;
}

const faceCache = new Map<string, HTMLCanvasElement>();
const cardKey = (c: Card) => `${c.id}|${c.rank}|${c.suit}|${c.enhancement ?? ''}`;
export function faceOf(c: Card): HTMLCanvasElement {
  const k = cardKey(c);
  let f = faceCache.get(k);
  if (!f) {
    f = drawCardFace(c);
    faceCache.set(k, f);
  }
  return cloneCanvas(f);
}
let backP: HTMLCanvasElement | null = null;
let backD: HTMLCanvasElement | null = null;
export function backOf(o: Owner): HTMLCanvasElement {
  if (o === 'player') return cloneCanvas((backP ??= drawCardBack('player')));
  return cloneCanvas((backD ??= drawCardBack('dealer')));
}

export function cardName(c: Card): string {
  const r = c.rank === 'A' ? 'As' : c.rank === 'J' ? 'Valet' : c.rank === 'Q' ? 'Dame' : c.rank === 'K' ? 'Roi' : RANK_LABEL[c.rank];
  return `${r} de ${SUIT_NAME[c.suit]}`;
}

/** Un sabot : pile de dos + compteur. Montre la carte du dessus si on a le droit de la voir. */
class Shoe {
  readonly root: HTMLElement;
  private count: HTMLElement;
  private topFace: HTMLElement;
  n = 0;
  constructor(parent: HTMLElement, readonly owner: Owner, x: number, y: number) {
    this.root = place(el('div', `shoe shoe-${owner}`, parent), x - 60, y - 84, 120, 168);
    for (let i = 3; i >= 0; i--) {
      const b = backOf(owner);
      b.className = 'shoe-card';
      b.style.transform = `translate(${-i * 2}px, ${i * 2}px)`;
      this.root.appendChild(b);
    }
    this.topFace = el('div', 'shoe-top', this.root);
    this.count = el('div', 'shoe-count t-num', this.root);
  }
  set(n: number, top: Card | null): void {
    this.n = n;
    this.count.textContent = String(n);
    this.root.classList.toggle('empty', n === 0);
    const k = top ? cardKey(top) : '';
    if (this.topFace.dataset.k !== k) {
      this.topFace.dataset.k = k;
      this.topFace.innerHTML = '';
      if (top) {
        const f = faceOf(top);
        f.style.width = '120px';
        f.style.height = '168px';
        this.topFace.appendChild(f);
      }
    }
  }
}

/** La défausse du joueur : un tas de cartes face visible, légèrement de travers. */
class DiscardPile {
  readonly root: HTMLElement;
  private count: HTMLElement;
  private stack: HTMLElement;
  constructor(parent: HTMLElement, x: number, y: number) {
    this.root = place(el('div', 'discard', parent), x - 60, y - 84, 120, 168);
    el('div', 'discard-slot', this.root);
    el('div', 'discard-lab t-num', this.root, 'défausse');
    this.stack = el('div', 'discard-stack', this.root);
    this.count = el('div', 'shoe-count t-num', this.root);
  }
  set(cards: Card[]): void {
    this.count.textContent = cards.length ? String(cards.length) : '';
    this.root.classList.toggle('has', cards.length > 0);
    const top = cards.slice(-4);
    const k = top.map(cardKey).join(',');
    if (this.stack.dataset.k === k) return;
    this.stack.dataset.k = k;
    this.stack.innerHTML = '';
    top.forEach((c) => {
      const f = faceOf(c);
      f.className = 'discard-card';
      const r = ((c.id * 7919) % 17) - 8;
      const dx = ((c.id * 104729) % 9) - 4;
      f.style.transform = `translate(${dx * 2}px, ${((c.id * 31) % 5) * 2 - 4}px) rotate(${r}deg)`;
      this.stack.appendChild(f);
    });
  }
}

export class TableView {
  readonly entries = new Map<number, Entry>();
  playerIds: number[] = [];
  dealerIds: number[] = [];
  readonly shoe: Shoe;
  readonly dealerShoe: Shoe;
  readonly discard: DiscardPile;
  /** Clic sur une carte de la table (défausse, ciblage). */
  onCardClick: ((id: number, owner: Owner) => void) | null = null;
  selectable: Owner | null = null;
  selected = new Set<number>();
  /** Cartes vues au sommet de ton sabot (Voyance…) : gardées en vue tant qu'elles y sont. */
  peeked: number[] = [];
  private peekRow: HTMLElement;
  private z = 10;

  constructor(private tableLayer: HTMLElement, private cardLayer: HTMLElement, private engine: () => Engine, private state: () => RunState | null) {
    this.discard = new DiscardPile(tableLayer, POS.playerDiscard.x, POS.playerDiscard.y);
    this.shoe = new Shoe(tableLayer, 'player', POS.playerShoe.x, POS.playerShoe.y);
    this.dealerShoe = new Shoe(tableLayer, 'dealer', POS.dealerShoe.x, POS.dealerShoe.y);
    this.peekRow = place(el('div', 'peek-row', tableLayer), POS.playerShoe.x - 60, POS.playerShoe.y - 84 - 92, 150, 88);
    attachTip(this.peekRow, () => (this.peekRow.childElementCount ? { name: 'Prochaines cartes', body: "Le sommet de ton sabot, dans l'ordre : la première à gauche." } : null));
    attachTip(this.shoe.root, () => ({ name: 'Ton sabot', body: `${this.shoe.n} cartes. Clique pour voir ce qu'il reste.` }));
    attachTip(this.discard.root, () => ({ name: 'Défausse', body: 'Les cartes sorties ne reviennent pas avant la prochaine table.' }));
    attachTip(this.dealerShoe.root, () => ({ name: 'Sabot du croupier', body: 'Un jeu de 52 cartes, remélangé à chaque table.' }));
  }

  private spawn(card: Card, owner: Owner, faceDown: boolean, from: { x: number; y: number }): Entry {
    const sp = new Sprite({ face: faceOf(card), back: backOf(owner), faceUp: false, parent: this.cardLayer, size: 2 });
    sp.jump(from.x, from.y, owner === 'player' ? -6 : 6);
    sp.z = this.z++;
    const e: Entry = { sprite: sp, card, key: cardKey(card), owner, faceDown };
    this.entries.set(card.id, e);
    sp.root.addEventListener('click', () => {
      if (this.selectable === e.owner && this.onCardClick) this.onCardClick(card.id, e.owner);
    });
    attachTip(sp.root, () => this.tipFor(e));
    if (card.enhancement === 'fantome') sp.root.classList.add('ghost');
    if (card.enhancement === 'cristal' || card.enhancement === 'doree') el('div', 'glint', sp.overlay);
    return e;
  }

  private tipFor(e: Entry): { name: string; sub?: string; body?: string } | null {
    if (e.faceDown && !e.sprite.faceUp) return e.owner === 'dealer' ? { name: 'Carte cachée', body: 'Le croupier la retourne quand tu restes.' } : { name: 'Carte face cachée', body: 'Tu la découvriras à la fin de la main.' };
    const eng = this.engine();
    const c = e.card;
    const enh = c.enhancement ? eng.content.enhancements[c.enhancement] : null;
    const s = this.state();
    const deb = s && eng.isDebuffed(s, c);
    const v = c.rank === 'A' ? '11 ou 1' : ['J', 'Q', 'K'].includes(c.rank) ? '10' : c.rank;
    return {
      name: cardName(c),
      sub: enh ? enh.name : `vaut ${v}`,
      body: deb ? 'Neutralisée par le patron : elle ne marque rien.' : enh ? enh.description : undefined,
    };
  }

  /** Recalcule les places des mains (éventail léger côté joueur). */
  layout(): void {
    const fan = (ids: number[], cx: number, cy: number, owner: Owner) => {
      const n = ids.length;
      // la main du croupier ne déborde jamais sur la plaque ; l'éventail du joueur s'aplatit au-delà
      // de 4 cartes pour que les coins des cartes extrêmes ne mordent pas sur la barre d'actions
      const spacing = n <= 1 ? 0 : Math.min(owner === 'player' ? 126 : 122, (owner === 'player' ? 520 : 470) / (n - 1));
      const flat = n <= 4 ? 1 : 3 / (n - 1);
      ids.forEach((id, i) => {
        const e = this.entries.get(id);
        if (!e) return;
        const m = i - (n - 1) / 2;
        const rot = owner === 'player' ? m * 2.6 * flat : m * 0.8;
        const dy = owner === 'player' ? m * m * 2 * flat : 0;
        e.sprite.moveTo(cx + m * spacing, cy + dy, rot);
        e.sprite.z = 10 + i;
        e.sprite.raised = this.selected.has(id);
      });
    };
    fan(this.playerIds, POS.playerHand.x, POS.playerHand.y, 'player');
    fan(this.dealerIds, POS.dealerHand.x, POS.dealerHand.y, 'dealer');
  }

  sprite(id: number): Sprite | null {
    return this.entries.get(id)?.sprite ?? null;
  }

  /** Mesure de la donne (développement) : départ et arrivée de chaque carte, en temps de jeu. */
  dealLog: { id: number; to: Owner; out: number; landed: number }[] | null = null;

  /**
   * Une carte sort du sabot et vient dans la main ; la promesse se résout quand elle est POSÉE.
   * Elle se retourne en vol (elle arrive face visible) : la suivante peut partir aussitôt.
   */
  async deal(card: Card, to: Owner, faceDown: boolean): Promise<void> {
    const from = to === 'player' ? POS.playerShoe : POS.dealerShoe;
    const e = this.spawn(card, to, faceDown, from);
    (to === 'player' ? this.playerIds : this.dealerIds).push(card.id);
    const log = this.dealLog ? { id: card.id, to, out: clock.now, landed: 0 } : null;
    if (log) this.dealLog!.push(log);
    sfx.card(to);
    this.layout();
    if (!faceDown) void wait(110).then(() => (sfx.flip(), e.sprite.flip(true, 200)));
    // vol de donne un peu plus posé que les autres mouvements : l'œil suit chaque carte jusqu'à sa place
    const sx = e.sprite.x;
    const sy = e.sprite.y;
    sx.stiffness = sy.stiffness = DEAL_SPRING.k;
    sx.damping = sy.damping = DEAL_SPRING.d;
    await e.sprite.arrive(700);
    sx.stiffness = sy.stiffness = 160;
    sx.damping = sy.damping = 19;
    if (log) log.landed = clock.now;
    sfx.land(faceDown ? 'hole' : to);
    if (!faceDown && (card.enhancement === 'cristal' || card.enhancement === 'doree')) this.glint(card.id);
  }

  glint(id: number): void {
    const g = this.entries.get(id)?.sprite.overlay.querySelector('.glint');
    if (!g || clock.skipping) return;
    g.classList.remove('go');
    void (g as HTMLElement).offsetWidth;
    g.classList.add('go');
  }

  async reveal(card: Card, owner: Owner = 'dealer'): Promise<void> {
    const e = this.entries.get(card.id);
    if (!e) return;
    this.updateCard(card);
    e.faceDown = false;
    sfx.flip();
    await e.sprite.flip(true, 260);
  }

  /** Remplace l'apparence d'une carte (amélioration, enseigne, rang). */
  updateCard(card: Card): void {
    const e = this.entries.get(card.id);
    if (!e) return;
    e.card = card;
    const k = cardKey(card);
    if (e.key !== k) {
      e.key = k;
      e.sprite.setFace(faceOf(card));
      e.sprite.root.classList.toggle('ghost', card.enhancement === 'fantome');
      if ((card.enhancement === 'cristal' || card.enhancement === 'doree') && !e.sprite.overlay.querySelector('.glint')) el('div', 'glint', e.sprite.overlay);
    }
  }

  /** Défausse : la carte part sur le tas. */
  async toDiscard(id: number, pileAfter?: Card[]): Promise<void> {
    const e = this.entries.get(id);
    this.playerIds = this.playerIds.filter((x) => x !== id);
    this.dealerIds = this.dealerIds.filter((x) => x !== id);
    this.selected.delete(id);
    this.layout();
    if (!e) return;
    const target = e.owner === 'player' ? POS.playerDiscard : POS.dealerShoe;
    e.sprite.moveTo(target.x, target.y, ((id * 7919) % 17) - 8);
    e.sprite.z = 400;
    sfx.card();
    await e.sprite.arrive(500);
    if (e.owner === 'player' && pileAfter) this.discard.set(pileAfter);
    e.sprite.destroy();
    this.entries.delete(id);
  }

  /** Fin de main : les cartes du joueur vont à la défausse, celles du croupier retournent à son sabot. */
  async sweep(): Promise<void> {
    const all = [...this.entries.values()];
    if (!all.length) return;
    this.playerIds = [];
    this.dealerIds = [];
    this.selected.clear();
    const pile: Card[] = [];
    let i = 0;
    for (const e of all) {
      const t = e.owner === 'player' ? POS.playerDiscard : POS.dealerShoe;
      void wait(i++ * 40).then(() => {
        e.sprite.moveTo(t.x, t.y, e.owner === 'player' ? ((e.card.id * 7919) % 17) - 8 : 0);
        if (e.owner === 'dealer') void e.sprite.flip(false, 160);
      });
      e.sprite.z = 300 + i;
      if (e.owner === 'player') pile.push(e.card);
    }
    sfx.card();
    await wait(i * 40 + 340);
    for (const e of all) {
      e.sprite.destroy();
      this.entries.delete(e.card.id);
    }
  }

  /** Deux cartes échangent leur place (combine « Échange »). */
  async swap(playerCard: Card, dealerCard: Card): Promise<void> {
    const p = this.entries.get(playerCard.id);
    const d = this.entries.get(dealerCard.id);
    if (!p || !d) return;
    p.owner = 'dealer';
    d.owner = 'player';
    this.playerIds = this.playerIds.map((x) => (x === playerCard.id ? dealerCard.id : x));
    this.dealerIds = this.dealerIds.map((x) => (x === dealerCard.id ? playerCard.id : x));
    p.sprite.z = 500;
    d.sprite.z = 501;
    sfx.card();
    this.layout();
    await Promise.all([p.sprite.arrive(600), d.sprite.arrive(600)]);
  }

  /** Destruction (cristal brisé, autodafé) : la carte se désagrège. */
  async destroyCard(id: number): Promise<void> {
    const e = this.entries.get(id);
    this.playerIds = this.playerIds.filter((x) => x !== id);
    this.dealerIds = this.dealerIds.filter((x) => x !== id);
    if (!e) return;
    e.sprite.root.classList.add('dying');
    e.sprite.scale.target = 0.2;
    await wait(260);
    e.sprite.destroy();
    this.entries.delete(id);
    this.layout();
  }

  setSelectable(owner: Owner | null): void {
    this.selectable = owner;
    for (const e of this.entries.values()) {
      const on = owner !== null && e.owner === owner;
      e.sprite.root.classList.toggle('selectable', on);
      e.sprite.root.classList.toggle('selected', this.selected.has(e.card.id));
    }
    this.layout();
  }

  /** Aligne la vue sur l'état (sans animation spectaculaire : les ressorts finissent le travail). */
  sync(s: RunState): void {
    const eng = this.engine();
    const t = s.table;
    const h = t?.hand ?? null;
    const pc = h?.playerCards ?? [];
    const dc = h?.dealerCards ?? [];
    const keep = new Set([...pc, ...dc].map((c) => c.id));
    for (const [id, e] of [...this.entries]) {
      if (!keep.has(id)) {
        e.sprite.destroy();
        this.entries.delete(id);
      }
    }
    const rules = t ? eng.getRules(s) : null;
    const hidden = new Set(h?.hiddenCardIds ?? []);
    pc.forEach((c) => {
      let e = this.entries.get(c.id);
      if (!e) e = this.spawn(c, 'player', hidden.has(c.id), POS.playerShoe);
      e.owner = 'player';
      this.updateCard(c);
      e.faceDown = hidden.has(c.id);
      void e.sprite.flip(!e.faceDown, 0);
    });
    dc.forEach((c, i) => {
      let e = this.entries.get(c.id);
      const down = i === 1 && !h!.holeRevealed && !rules?.seeDealerHole;
      if (!e) e = this.spawn(c, 'dealer', down, POS.dealerShoe);
      e.owner = 'dealer';
      this.updateCard(c);
      e.faceDown = down;
      void e.sprite.flip(!down, 0);
      e.sprite.root.classList.toggle('xray', i === 1 && !h!.holeRevealed && !!rules?.seeDealerHole);
    });
    for (const e of this.entries.values()) e.sprite.root.classList.toggle('debuffed', !!(e.owner === 'player' && eng.isDebuffed(s, e.card)));
    this.playerIds = pc.map((c) => c.id);
    this.dealerIds = dc.map((c) => c.id);
    for (const id of [...this.selected]) if (!keep.has(id)) this.selected.delete(id);
    this.layout();
    const live = !!t && (t.drawPile.length > 0 || !!h);
    this.shoe.set(live ? t!.drawPile.length : s.deck.length, live ? eng.visibleNextCard(s) : null);
    this.dealerShoe.set(t?.dealerDrawPile.length || 52, null);
    this.discard.set(t?.discardPile ?? []);
    this.syncPeek(live ? t!.drawPile : []);
  }

  /** Montre les cartes déjà vues tant qu'elles sont, dans l'ordre, au sommet du sabot. */
  syncPeek(pile: Card[]): void {
    const show: Card[] = [];
    for (let i = 0; i < this.peeked.length && i < pile.length; i++) {
      if (pile[i].id !== this.peeked[i]) break;
      show.push(pile[i]);
    }
    const k = show.map(cardKey).join(',');
    if (this.peekRow.dataset.k === k) return;
    this.peekRow.dataset.k = k;
    this.peekRow.innerHTML = '';
    show.slice(0, 3).forEach((c, i) => {
      const f = faceOf(c);
      f.className = 'peek-card';
      f.style.left = `${i * 44}px`;
      f.style.zIndex = String(10 - i);
      this.peekRow.appendChild(f);
    });
  }
}
