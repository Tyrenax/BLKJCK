/** Interactions délicates entre objets du vrai contenu (liste de bjck-41). */
import { describe, expect, it } from 'vitest';
import { cardInvariantErrors, ofType, withEnhancement } from '../testing/helpers';
import {
  atBossTableReal as atBoss,
  base,
  consUid,
  content,
  engine,
  F,
  give,
  giveCons,
  hand,
  HIT,
  run,
  setAtoutState,
  STAND,
  toShop,
  use,
} from './helpers';

const H = () => F('haute');
const CAP = content.balance.maxPlayerLimit ?? Infinity;

describe('interactions', () => {
  it('plafond maxPlayerLimit : quatre atouts de limite ne dépassent pas le plafond', () => {
    let s = give(base(), 'marge-de-manoeuvre', 'vingt-trois', 'plafond-de-verre', 'ascenseur');
    s = setAtoutState(s, 'ascenseur', { bonus: 3 });
    expect(engine.getRules(s).playerLimit).toBe(Math.min(21 + 1 + 2 + 3 + 3, CAP));
    expect(engine.getRules(s).playerLimit).toBe(CAP);
  });

  it('La Pince + Marge de manœuvre : 21', () => {
    expect(engine.getRules(atBoss(give(base(), 'marge-de-manoeuvre'), 'la-pince')).playerLimit).toBe(21);
  });

  it('patron d’enseigne + Arlequin : l’arlequin échappe au patron mais compte comme ♥ pour Sang chaud', () => {
    // 9♠ arlequin sous Cœur de pierre : compte comme ♥ (Sang chaud), n'est pas neutralisé.
    const s = withEnhancement(atBoss(give(base(), 'sang-chaud'), 'coeur-de-pierre'), '9S', 'arlequin');
    const p = hand(s, ['10H', '9S'], ['10C', '7D']);
    expect(p.steps[0].text).toBe('Neutralisée'); // 10♥ ordinaire
    expect(p.result!.mult).toBe(H().mult + 5); // seul le 9♠ arlequin déclenche Sang chaud
  });

  it('re-déclenchements cumulés : Ambidextre + Écho, et As dans la manche à chaque passage', () => {
    const p = hand(give(base(), 'l-ambidextre', 'echo', 'as-dans-la-manche'), ['AS', '8H'], ['10C', '7D']);
    // As : Ambidextre = 2 passages ; 8♥ (dernière carte) : Ambidextre + Écho = 3 passages.
    expect(p.steps.filter((x) => x.text === 'Encore !')).toHaveLength(3);
    expect(p.result!.chips).toBe(H().chips + 2 * 11 + 3 * 8);
    // As dans la manche se redéclenche avec l'As : +8 Mult à chacun de ses 2 passages.
    expect(p.result!.mult).toBe(H().mult + 2 * 8);
  });

  it('Ascenseur et le cache de règles : la limite gagnée en fin de main vaut dès la main suivante', () => {
    const s = give(base(), 'ascenseur');
    const p1 = hand(s, ['10H', '9S'], ['10C', '7D'], [STAND]);
    const changed = ofType(p1.events, 'rulesChanged').find((e) => e.reason === 'Ascenseur')!;
    // L'événement émis à la main par le contenu reçoit les règles à jour (cache invalidé par l'API).
    expect(changed.rules!.playerLimit).toBe(22);
    expect(engine.getRules(p1.state).playerLimit).toBe(22);
    // Dans la même table, une carte qui ferait 22 ne fait plus crever.
    const rigged = structuredClone(p1.state);
    const p2 = run(rigged, [{ type: 'nextHand' }]);
    expect(engine.getRules(p2.state).playerLimit).toBe(22);
  });

  it('Le Borgne + combines qui ciblent la main (Échange, Tour de manche, Escamotage)', () => {
    for (const id of ['echange', 'tour-de-manche', 'escamotage']) {
      const s = giveCons(atBoss(base(), 'le-borgne'), id);
      const dealt = hand(s, ['10H', '6S'], ['5C', 'KD'], []).state;
      const hidden = dealt.table!.hand!.hiddenCardIds![0];
      const r = run(dealt, [{ type: 'useConsumable', uid: consUid(dealt, id), targets: [hidden] }]);
      expect(r.state.phase).toBe('playerTurn');
      expect(cardInvariantErrors(r.state)).toEqual([]);
      const end = run(r.state, [STAND, { type: 'nextHand' }]);
      expect(cardInvariantErrors(end.state)).toEqual([]);
      // Échangée, transformée ou retirée : la carte n'est plus un secret.
      expect(r.state.table!.hand!.hiddenCardIds ?? []).toEqual([]);
      if (id === 'tour-de-manche') {
        expect(ofType(r.events, 'playerCardRevealed')[0]).toMatchObject({ card: { id: hidden, rank: 'A' } });
      }
    }
  });

  it('Échange puis Tour de manche sur la carte du croupier : modifiée, puis rendue au croupier', () => {
    const s = giveCons(base(), 'echange', 'tour-de-manche');
    const dealt = hand(s, ['10H', '6S'], ['5C', 'KD'], [use('echange', '6S'), use('tour-de-manche', '5C')]);
    expect(dealt.state.table!.hand!.playerCards.map((c) => c.rank)).toEqual(['10', 'A']);
    const end = run(dealt.state, [STAND, { type: 'nextHand' }]);
    expect(cardInvariantErrors(end.state)).toEqual([]);
  });

  it('Déchiqueteuse au plancher du sabot', () => {
    const shop = toShop(base(), 100);
    const thin = structuredClone(shop);
    thin.deck = thin.deck.slice(0, content.balance.minDeckSize ?? 10);
    expect(engine.whyIllegal(thin, { type: 'shredCard', cardId: thin.deck[0].id })).toBe(
      `Ton sabot ne peut pas descendre sous ${content.balance.minDeckSize} cartes.`,
    );
    // L'Autodafé respecte aussi le plancher : refusé au plancher, une seule carte détruite à plancher + 1.
    const s = giveCons(thin, 'autodafe');
    expect(engine.whyIllegal(s, { type: 'useConsumable', uid: consUid(s, 'autodafe'), targets: [s.deck[0].id] })).not.toBeNull();
    const plus1 = giveCons(structuredClone(shop), 'autodafe');
    plus1.deck = plus1.deck.slice(0, (content.balance.minDeckSize ?? 10) + 1);
    const r = run(plus1, [
      { type: 'useConsumable', uid: consUid(plus1, 'autodafe'), targets: [plus1.deck[0].id, plus1.deck[1].id] },
    ]);
    expect(r.state.deck.length).toBe(content.balance.minDeckSize ?? 10);
  });

  it('Tapis à gauche d’un atout à Jetons : la défaite marque 0 ; à droite : pareil', () => {
    for (const order of [['tapis', 'vampire', 'mille-pattes'], ['mille-pattes', 'tapis']]) {
      const p = hand(give(base(), ...order), ['10H', '7S'], ['10C', '9D']);
      expect(p.result).toMatchObject({ outcome: 'loss', score: 0, chips: 0 });
    }
  });

  it('Parachute puis Harnais : le second crevé de la table se rattrape par la défausse', () => {
    const s = give(base(), 'parachute', 'harnais');
    const p1 = hand(s, ['10H', '6S', 'KC', 'QC'], ['10C', '7D'], [HIT]);
    expect(p1.state.phase).toBe('playerTurn');
    const p2 = run(p1.state, [HIT]);
    expect(p2.state.phase).toBe('bustChoice');
    const saved = run(p2.state, [(st) => ({ type: 'discard', cardId: st.table!.hand!.playerCards.at(-1)!.id })]);
    expect(saved.state.phase).toBe('playerTurn');
  });

  it('Cigare qui part en fumée pendant que Boule de neige et Martingale comptent', () => {
    let s = give(base(), 'cigare', 'boule-de-neige', 'martingale');
    s = setAtoutState(s, 'cigare', { mult: 2 });
    const p = hand(s, ['10H', '9S'], ['10C', '7D']);
    expect(p.state.atouts.map((a) => a.defId)).toEqual(['boule-de-neige', 'martingale']);
    expect(p.state.atouts[0].state.mult).toBe(1);
    expect(p.state.atouts[1].state.streak).toBe(0);
  });

  it('La Maison : chaque main gagnée serre la limite, même avec Ascenseur qui la desserre', () => {
    const s = atBoss(give(base(), 'ascenseur'), 'la-maison');
    const p = hand(s, ['10H', '9S'], ['10C', '7D']);
    expect(engine.getRules(p.state).playerLimit).toBe(21);
  });
});
