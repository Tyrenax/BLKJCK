import { describe, expect, it } from 'vitest';
import { ATOUT_FAMILY, content } from '../../src/content/index';
import { makeBot, setFamilyMap, type BotName } from './bots';
import { simEngine } from './engine';
import { playRun } from './runner';
import { bestDiscard, basicDecision, proactiveDiscard, type HandView } from './strategy';
import { makeRules, cards } from '../../src/content/test/helpers';

setFamilyMap(ATOUT_FAMILY);
const engine = simEngine(content);

describe('simulateur', () => {
  it.each(['naive', 'basic'] as BotName[])('le robot %s joue des parties entières sans action refusée', (bot) => {
    for (let i = 0; i < 8; i++) {
      const r = playRun(engine, makeBot(bot), `test-${bot}-${i}`);
      expect(r.botErrors, r.errorSamples.join(' | ')).toBe(0);
      expect(r.tables.length).toBeGreaterThan(0);
      expect(r.won || r.death !== null).toBe(true);
    }
  });

  it('le robot malin achète sans action refusée', () => {
    const r = playRun(engine, makeBot('smart', { rollouts: 2 }), 'test-smart-0', { maxSalon: 2 });
    expect(r.botErrors, r.errorSamples.join(' | ')).toBe(0);
  });

  it('même graine, même partie', () => {
    const a = playRun(engine, makeBot('basic'), 'det-1');
    const b = playRun(engine, makeBot('basic'), 'det-1');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('stratégie', () => {
  const view = (specs: string[], up: string, over: Partial<HandView> = {}): HandView => {
    const cs = cards(...specs);
    const v = engine.handValue(cs, 21);
    return {
      cards: cs,
      total: v.total,
      soft: v.soft,
      dealerUp: cards(up)[0],
      dealerHole: null,
      nextCard: null,
      rules: makeRules(),
      canDouble: true,
      discardsLeft: 0,
      bustSafe: false,
      ...over,
    };
  };

  it('sans défausse : stratégie de base classique', () => {
    expect(basicDecision(view(['10s', '6h'], '5d'))).toBe('stand');
    expect(basicDecision(view(['10s', '6h'], '10d'))).toBe('hit');
    expect(basicDecision(view(['6s', '5h'], '6d'))).toBe('double');
  });

  it('crevé rattrapable (Harnais, Parachute) : tire jusqu’à 17', () => {
    const safe = { discardsLeft: 1, bustSafe: true };
    expect(basicDecision(view(['10s', '6h'], '5d', safe))).toBe('hit');
    expect(basicDecision(view(['10s', '7h'], '10d', safe))).toBe('hit');
    expect(basicDecision(view(['10s', '8h'], '10d', safe))).toBe('stand');
  });

  it('défausse préventive : jette le 6 d’un 10+6 contre un 10, revient à 2 cartes pour doubler', () => {
    const v = view(['10s', '6h'], '10d', { discardsLeft: 1 });
    expect(proactiveDiscard(engine, v, 'p3')?.rank).toBe('6');
    expect(proactiveDiscard(engine, view(['10s', '6h'], '5d', { discardsLeft: 1 }), 'p3')).toBeNull();
    expect(proactiveDiscard(engine, view(['10s', '6h'], '10d', { discardsLeft: 0 }), 'p3')).toBeNull();
    const three = view(['6s', '4h', '9d'], '6c', { discardsLeft: 1 });
    expect(proactiveDiscard(engine, three, 'p3')?.rank).toBe('9'); // 6+4 = 10, prêt à doubler
  });

  it('défausse de sauvetage : le meilleur total sans crever', () => {
    const hand = cards('10s', '6h', '9d');
    expect(bestDiscard(engine, hand, 21)?.id).toBe(hand[1]!.id); // garde 10 + 9 = 19
  });
});
