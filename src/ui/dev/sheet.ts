/** Planche de contrôle visuel : toutes les cartes, dos, améliorations et emblèmes. (?screen=sheet) */
import type { Card, EmblemArt, EnhancementId, Rank, Suit } from '../../engine/types';
import { el, place, type StageLayers } from '../core/stage';
import { drawCardBack, drawCardFace, drawEmblem } from '../gfx/cardArt';
import { Sprite } from '../view/sprite';

export function showSheet(L: StageLayers): void {
  const ranks: Rank[] = ['A', '2', '5', '7', '9', '10', 'J', 'Q', 'K'];
  const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
  let id = 1;
  ranks.forEach((r, i) => {
    const s = suits[i % 4];
    const card: Card = { id: id++, rank: r, suit: s };
    const sp = new Sprite({ face: drawCardFace(card), parent: L.cards, size: 2 });
    sp.jump(80 + i * 128, 100);
  });
  const enh: EnhancementId[] = ['plombee', 'ardente', 'cristal', 'doree', 'marquee', 'fantome', 'elastique', 'arlequin'];
  enh.forEach((e, i) => {
    const card: Card = { id: id++, rank: (['7', 'K', 'A', '10', '4', '9', 'Q', '3'] as Rank[])[i], suit: suits[(i + 1) % 4], enhancement: e };
    const sp = new Sprite({ face: drawCardFace(card), parent: L.cards, size: 2 });
    sp.jump(80 + i * 128, 290);
    if (e === 'fantome') sp.root.classList.add('ghost');
    el('div', 'abs t-num c-cendre', L.fx, e).setAttribute('style', `left:${40 + i * 128}px;top:378px;font-size:20px`);
  });
  const backP = new Sprite({ face: drawCardBack('player'), parent: L.cards, size: 2 });
  backP.jump(80 + 8 * 128, 290);
  const arts: [EmblemArt, 'atout' | 'combine' | 'faveur' | 'privilege' | 'patron', any][] = [
    [{ glyph: '22', pattern: 'rayures', colors: ['prune', 'bordeaux'] }, 'atout', 'commun'],
    [{ glyph: '♥', pattern: 'soleil', colors: ['bordeaux', 'cerise'] }, 'atout', 'peu-commun'],
    [{ glyph: '×3', pattern: 'damier', colors: ['petrole', 'petrole-clair'] }, 'atout', 'rare'],
    [{ glyph: 'XV', pattern: 'losanges', colors: ['prune', 'prune-clair'] }, 'atout', 'legendaire'],
    [{ glyph: '♠♣', pattern: 'vagues', colors: ['encre', 'prune'] }, 'combine', undefined],
    [{ glyph: '?', pattern: 'points', colors: ['petrole-sombre', 'petrole'] }, 'faveur', undefined],
    [{ glyph: '+1', pattern: 'chevrons', colors: ['prune-sombre', 'prune'] }, 'privilege', undefined],
    [{ glyph: '20', pattern: 'uni', colors: ['bordeaux-sombre', 'bordeaux'] }, 'patron', undefined],
  ];
  arts.forEach(([a, k, r], i) => {
    const sp = new Sprite({ face: drawEmblem(a, k, r), parent: L.cards, size: 2 });
    sp.jump(80 + i * 128, 520);
  });
  const backD = new Sprite({ face: drawCardBack('dealer'), parent: L.cards, size: 2 });
  backD.jump(80 + 8 * 128, 520);
  place(el('div', 'abs', L.fx), 0, 0);
}
