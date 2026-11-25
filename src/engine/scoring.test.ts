import { describe, expect, it } from 'vitest';
import {
  atBossTable,
  dealRigged,
  makeEngine,
  ofType,
  startedRun,
  types,
  withAtouts,
  withEnhancement,
} from './testing/helpers';
import type { GameEvent, RunState } from './types';

const e = makeEngine();
const base = (): RunState => startedRun(e, 'SCORE');

/** Distribue la main truquée, reste, et renvoie les événements du « Rester ». */
function standWith(s: RunState, player: string[], dealer: string[]): { state: RunState; events: GameEvent[] } {
  const dealt = dealRigged(e, s, player, dealer).state;
  return e.dispatch(dealt, { type: 'stand' });
}

describe('marquage', () => {
  it('suit l’ordre figure -> cartes -> verdict et émet chaque étape', () => {
    const { state, events } = standWith(base(), ['10H', '9S'], ['10C', '7D']);
    expect(types(events)).toEqual([
      'holeRevealed',
      'dealerStands',
      'outcome',
      'scoreStart',
      'scoreStep',
      'scoreStep',
      'scoreEnd',
    ]);
    const start = ofType(events, 'scoreStart')[0];
    expect(start).toMatchObject({ figure: 'haute', level: 1, chips: 20, mult: 2 });
    const steps = ofType(events, 'scoreStep');
    expect(steps.map((x) => [x.chipsAfter, x.multAfter])).toEqual([
      [30, 2],
      [39, 2],
    ]);
    expect(ofType(events, 'scoreEnd')[0]).toMatchObject({ outcome: 'win', chips: 39, mult: 2, handScore: 78 });
    expect(state.table!.score).toBe(78);
    expect(state.table!.hand!.result).toMatchObject({ outcome: 'win', figure: 'haute', score: 78, playerTotal: 19 });
    expect(state.phase).toBe('handResult');
  });

  it('les atouts réagissent à chaque carte, juste après elle', () => {
    const { events } = standWith(withAtouts(base(), 't-coeur'), ['10H', '9S'], ['10C', '7D']);
    const steps = ofType(events, 'scoreStep');
    expect(steps.map((x) => x.source.kind)).toEqual(['card', 'atout', 'card']);
    expect(steps[1]).toMatchObject({ mult: 4, text: '+4 Mult', chipsAfter: 30, multAfter: 6 });
    expect(ofType(events, 'scoreEnd')[0].handScore).toBe(39 * 6);
  });

  it('défaite : la banque garde le Mult, il ne reste que les Jetons', () => {
    const { events } = standWith(withAtouts(base(), 't-coeur'), ['10H', '7S'], ['10C', '9D']);
    const last = ofType(events, 'scoreStep').at(-1)!;
    expect(last.source).toEqual({ kind: 'rule', label: 'Défaite' });
    expect(last.multAfter).toBe(1);
    expect(ofType(events, 'scoreEnd')[0]).toMatchObject({ outcome: 'loss', chips: 37, mult: 1, handScore: 37 });
  });

  it('égalité : la moitié du Mult', () => {
    const { events } = standWith(withAtouts(base(), 't-coeur'), ['10H', '8S'], ['10C', '8D']);
    expect(ofType(events, 'scoreEnd')[0]).toMatchObject({ outcome: 'push', chips: 38, mult: 3, handScore: 114 });
  });

  it('doubler : une carte, ×2 Mult, puis le croupier joue tout seul', () => {
    const dealt = dealRigged(e, base(), ['5H', '6S', '9C'], ['10C', '7D']).state;
    const { state, events } = e.dispatch(dealt, { type: 'double' });
    expect(types(events).slice(0, 3)).toEqual(['cardDealt', 'holeRevealed', 'dealerStands']);
    const dbl = ofType(events, 'scoreStep').find((x) => x.source.kind === 'rule')!;
    expect(dbl).toMatchObject({ source: { kind: 'rule', label: 'Doublé' }, xMult: 2, multAfter: 4 });
    expect(state.table!.hand!.result).toMatchObject({ outcome: 'win', chips: 40, mult: 4, score: 160 });
    expect(state.table!.hand!.hits).toBe(1);
  });

  it('améliorations : plombée, ardente, cristal, dorée', () => {
    let s = withEnhancement(base(), '10H', 'plombee');
    s = withEnhancement(s, '9S', 'ardente');
    const r1 = standWith(s, ['10H', '9S'], ['10C', '7D']);
    expect(r1.state.table!.hand!.result).toMatchObject({ chips: 69, mult: 6, score: 414 });
    const enh = ofType(r1.events, 'scoreStep').filter((x) => x.source.kind === 'enhancement');
    expect(enh.map((x) => x.text)).toEqual(['+30 Jetons', '+4 Mult']);

    const r2 = standWith(withEnhancement(base(), '10H', 'cristal'), ['10H', '9S'], ['10C', '7D']);
    expect(r2.state.table!.hand!.result).toMatchObject({ chips: 39, mult: 4, score: 156 });

    const gold = withEnhancement(base(), '10H', 'doree');
    const win = standWith(gold, ['10H', '9S'], ['10C', '7D']);
    expect(win.state.money - gold.money).toBe(2);
    expect(ofType(win.events, 'scoreStep').find((x) => x.source.kind === 'enhancement')!.money).toBe(2);
    const loss = standWith(gold, ['10H', '7S'], ['10C', '9D']);
    expect(loss.state.money).toBe(gold.money);
  });

  it('la carte cristal finit par se briser (1 chance sur 4)', () => {
    let broken = 0;
    for (let i = 0; i < 60; i++) {
      const s = withEnhancement(startedRun(e, `CRISTAL${i}`), '10H', 'cristal');
      const { state, events } = standWith(s, ['10H', '9S'], ['10C', '7D']);
      const destroyed = ofType(events, 'cardDestroyed');
      if (destroyed.length) {
        broken++;
        expect(state.deck.some((c) => c.id === destroyed[0].card.id)).toBe(false);
        expect(state.table!.hand!.playerCards).toHaveLength(1);
      }
    }
    expect(broken).toBeGreaterThan(3);
    expect(broken).toBeLessThan(35);
  });

  it('re-déclenchement : la carte marque une deuxième fois après « Encore ! »', () => {
    const { events, state } = standWith(withAtouts(base(), 't-echo'), ['10H', '9S'], ['10C', '7D']);
    const steps = ofType(events, 'scoreStep');
    expect(steps.map((x) => x.text)).toEqual(['+10', 'Encore !', '+10', '+9']);
    expect(steps[1].source).toMatchObject({ kind: 'atout' });
    expect(state.table!.hand!.result!.chips).toBe(49);
  });

  it('carte neutralisée par le patron : ne marque rien, compte dans le total', () => {
    const s = atBossTable(withAtouts(base(), 't-coeur'), 't-dix');
    const { events, state } = standWith(s, ['KH', '9S'], ['10C', '7D']);
    const steps = ofType(events, 'scoreStep');
    expect(steps[0]).toMatchObject({ source: { kind: 'card' }, text: 'Neutralisée', chipsAfter: 20 });
    // Le Cœur ne se déclenche pas sur le R♥ neutralisé.
    expect(steps.filter((x) => x.source.kind === 'atout')).toHaveLength(0);
    expect(state.table!.hand!.result).toMatchObject({ playerTotal: 19, chips: 29, mult: 2 });
    expect(e.isDebuffed(state, { id: 0, rank: 'Q', suit: 'spades' })).toBe(true);
  });

  it('l’ordre des atouts change le résultat (gauche à droite)', () => {
    const prep = (order: string[]): RunState => {
      const s = withAtouts(base(), ...order);
      for (const a of s.atouts) if (a.defId === 't-boule') a.state.mult = 2;
      return s;
    };
    const run = (order: string[]) =>
      standWith(prep(order), ['10H', '9S'], ['10C', '6D', 'KD']).state.table!.hand!.result!;
    expect(run(['t-boule', 't-casse'])).toMatchObject({ outcome: 'win', dealerBust: true, mult: 12, score: 39 * 12 });
    expect(run(['t-casse', 't-boule'])).toMatchObject({ mult: 8, score: 39 * 8 });
  });

  it('les compteurs d’atout changent et sont signalés (atoutChanged)', () => {
    const { state, events } = standWith(withAtouts(base(), 't-boule'), ['10H', '9S'], ['10C', '7D']);
    expect(state.atouts[0].state.mult).toBe(1);
    expect(ofType(events, 'atoutChanged')).toEqual([{ type: 'atoutChanged', uid: state.atouts[0].uid }]);
  });

  it('niveau de figure : Jetons et Mult de base montent', () => {
    const s = structuredClone(base());
    s.figureLevels.haute = 3;
    const { events } = standWith(s, ['10H', '9S'], ['10C', '7D']);
    expect(ofType(events, 'scoreStart')[0]).toMatchObject({ figure: 'haute', level: 3, chips: 40, mult: 4 });
  });

  it('previewFigure donne la figure si le joueur restait maintenant', () => {
    const dealt = dealRigged(e, base(), ['8H', '8S'], ['10C', '7D']).state;
    expect(e.previewFigure(dealt)).toMatchObject({ figure: 'paire', figures: ['paire'], level: 1, chips: 25, mult: 3 });
  });
});

describe('verdicts', () => {
  const result = (player: string[], dealer: string[], s: RunState = base()) =>
    standWith(s, player, dealer).state.table!.hand!.result!;

  it('victoire, défaite, égalité, croupier crevé', () => {
    expect(result(['10H', '9S'], ['10C', '7D']).outcome).toBe('win');
    expect(result(['10H', '7S'], ['10C', '9D']).outcome).toBe('loss');
    expect(result(['10H', '8S'], ['10C', '8D']).outcome).toBe('push');
    expect(result(['10H', '2S'], ['10C', '6D', 'KD'])).toMatchObject({ outcome: 'win', dealerBust: true, dealerTotal: 26 });
  });

  it('le croupier tire sous 17 et reste sur 17 souple', () => {
    expect(result(['10H', '9S'], ['AC', '6D']).dealerTotal).toBe(17);
    expect(result(['10H', '9S'], ['5C', '6D', '4H', '3S']).dealerTotal).toBe(18);
  });

  it('Blackjack naturel : bat un 21 en 3 cartes, égalité contre un naturel', () => {
    expect(result(['AS', 'KH'], ['10C', '5D', '6H'])).toMatchObject({ outcome: 'win', figure: 'blackjack' });
    expect(result(['AS', 'KH'], ['AC', 'QD'])).toMatchObject({ outcome: 'push', figure: 'blackjack' });
  });

  it('le total le plus haut gagne, même contre un naturel', () => {
    // Joueur à 22 (limite relevée) contre un naturel du croupier : victoire.
    const up = structuredClone(base());
    up.runMods.push({ key: 'playerLimit', add: 1, source: 'test' });
    const dealt = dealRigged(e, up, ['10H', '6S', '6C'], ['AC', 'KD']).state;
    const hit = e.dispatch(dealt, { type: 'hit' }).state;
    expect(e.dispatch(hit, { type: 'stand' }).state.table!.hand!.result).toMatchObject({
      outcome: 'win',
      playerTotal: 22,
      dealerTotal: 21,
    });
    // Blackjack contre le 22 d'un croupier à limite relevée (Le Sobre : reste à 19, crève au-delà de 22).
    const sobre = structuredClone(base());
    sobre.runMods.push({ key: 'dealerLimit', set: 22, source: 'test' }, { key: 'dealerStandOn', set: 19, source: 'test' });
    expect(result(['AS', 'KH'], ['10C', '8D', '4H'], sobre)).toMatchObject({
      outcome: 'loss',
      figure: 'blackjack',
      dealerTotal: 22,
    });
  });

  it('naturel du croupier : bat un 21 du joueur qui n’est pas un naturel', () => {
    const dealt = dealRigged(e, base(), ['10H', '5S', '6C'], ['AC', 'KD']).state;
    const hit = e.dispatch(dealt, { type: 'hit' }).state;
    const r = e.dispatch(hit, { type: 'stand' }).state.table!.hand!.result!;
    expect(r).toMatchObject({ outcome: 'loss', playerTotal: 21, dealerTotal: 21 });
  });

  it('Miroir : égalité = victoire ; La Maison : égalité = défaite (prioritaire)', () => {
    expect(result(['10H', '8S'], ['10C', '8D'], withAtouts(base(), 't-miroir')).outcome).toBe('win');
    expect(result(['10H', '8S'], ['10C', '8D'], atBossTable(base(), 't-maison')).outcome).toBe('loss');
    expect(result(['10H', '8S'], ['10C', '8D'], atBossTable(withAtouts(base(), 't-miroir'), 't-maison')).outcome).toBe('loss');
  });

  it('croupier nerveux (tire jusqu’à 18) et Savonnette (une carte de plus)', () => {
    expect(result(['10H', '9S'], ['10C', '7D', '4H'], withAtouts(base(), 't-nerveux')).dealerTotal).toBe(21);
    const dealt = dealRigged(e, withConsumablesSafe(base(), 't-savonnette'), ['10H', '9S'], ['10C', '7D', '2H']).state;
    const used = e.dispatch(dealt, { type: 'useConsumable', uid: dealt.consumables[0].uid }).state;
    expect(e.getRules(used).dealerExtraDraws).toBe(1);
    const r = e.dispatch(used, { type: 'stand' }).state.table!.hand!.result!;
    expect(r.dealerTotal).toBe(19);
  });
});

function withConsumablesSafe(s: RunState, defId: string): RunState {
  const c = structuredClone(s);
  c.consumables.push({ uid: c.nextUid++, defId });
  return c;
}
