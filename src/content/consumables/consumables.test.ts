import { describe, expect, it } from 'vitest';
import type { FigureId } from '../../engine/types';
import { balance } from '../balance';
import { FIGURE_IDS } from '../figures';
import { byId, card, cards, hookCtx, makeRules, makeState } from '../test/helpers';
import { workshopCombines } from './atelier';
import { tacticalCombines } from './combines';
import { FAVEUR_FIGURE, faveurs } from './faveurs';

const T = (id: string) => byId(tacticalCombines, id);
const W = (id: string) => byId(workshopCombines, id);

describe('combines tactiques', () => {
  it("Coup d'œil : seulement si la carte cachée l'est encore", () => {
    const d = T('coup-d-oeil');
    const hidden = makeState({ hand: { holeRevealed: false } });
    expect(d.canUse!(hidden, makeRules())).toBe(true);
    expect(d.canUse!(makeState({ hand: { holeRevealed: true } }), makeRules())).toBe(false);
    expect(d.canUse!(hidden, makeRules({ seeDealerHole: true }))).toBe(false);
    const ctx = hookCtx({ state: hidden });
    d.use(ctx, []);
    expect(ctx.api.argsOf('revealHole')).toHaveLength(1);
  });

  it('Échange : ta carte contre la carte visible du croupier', () => {
    const d = T('echange');
    const [mine, up, hole] = [card('10s'), card('4h'), card('Kd')];
    const ctx = hookCtx({ state: makeState({ hand: { playerCards: [mine], dealerCards: [up, hole] } }) });
    d.use(ctx, [mine.id]);
    expect(ctx.api.argsOf('swapWithDealer')).toEqual([[mine.id, up.id]]);
    expect(d.targeting).toMatchObject({ zone: 'playerHand', min: 1, max: 1 });
  });

  it('Carte brûlée : brûle le sommet de ton sabot', () => {
    const ctx = hookCtx({ state: makeState({ table: { drawPile: cards('9s', '2h') } }) });
    T('carte-brulee').use(ctx, []);
    expect(ctx.api.argsOf('burnTop')).toEqual([['player']]);
    expect(T('carte-brulee').canUse!(makeState({ table: { drawPile: [] } }), makeRules())).toBe(false);
  });

  it('Filet : tire si la carte ne fait pas crever, brûle sinon', () => {
    const d = T('filet');
    const safe = hookCtx({
      state: makeState({ table: { drawPile: cards('4s') }, hand: { playerCards: cards('10h', '6d') } }),
    });
    d.use(safe, []);
    expect(safe.api.argsOf('drawToPlayer')).toHaveLength(1);
    expect(safe.api.argsOf('burnTop')).toHaveLength(0);

    const risky = hookCtx({
      state: makeState({ table: { drawPile: cards('9s') }, hand: { playerCards: cards('10h', '6d') } }),
    });
    d.use(risky, []);
    expect(risky.api.argsOf('burnTop')).toEqual([['player']]);
    expect(risky.api.argsOf('drawToPlayer')).toHaveLength(0);

    // Un As ne fait jamais crever (il vaut 1).
    const ace = hookCtx({
      state: makeState({ table: { drawPile: cards('Ac') }, hand: { playerCards: cards('10h', '9d') } }),
    });
    d.use(ace, []);
    expect(ace.api.argsOf('drawToPlayer')).toHaveLength(1);

    // La limite effective compte (Rallonge, atouts).
    const longer = hookCtx({
      state: makeState({ table: { drawPile: cards('3s') }, hand: { playerCards: cards('10h', '9d') } }),
      rules: { playerLimit: 22 },
    });
    d.use(longer, []);
    expect(longer.api.argsOf('drawToPlayer')).toHaveLength(1);
  });

  it('Savonnette et Rallonge posent un modificateur de main', () => {
    const s = hookCtx();
    T('savonnette').use(s, []);
    expect(s.api.argsOf('addRuleMod')).toEqual([['hand', { key: 'dealerExtraDraws', add: 1, source: 'savonnette' }]]);
    const r = hookCtx();
    T('rallonge').use(r, []);
    expect(r.api.argsOf('addRuleMod')).toEqual([['hand', { key: 'playerLimit', add: 2, source: 'rallonge' }]]);
    expect(T('rallonge').usableIn).toContain('bustChoice');
  });

  it('Tour de manche, Escamotage : agissent sur la carte ciblée', () => {
    const c = card('9h');
    const t = hookCtx();
    T('tour-de-manche').use(t, [c.id]);
    expect(t.api.argsOf('changeRank')).toEqual([[c.id, 'A']]);
    const e = hookCtx();
    T('escamotage').use(e, [c.id]);
    expect(e.api.argsOf('discardFromHand')).toEqual([[c.id]]);
  });

  it('Voyance et Lorgnette montrent des sabots', () => {
    const v = hookCtx({ state: makeState({ table: { drawPile: cards('2s', '3s', '4s', '5s') } }) });
    T('voyance').use(v, []);
    expect(v.api.argsOf('peek')).toEqual([['player', 3]]);
    const l = hookCtx();
    T('lorgnette').use(l, []);
    expect(l.api.argsOf('peek')).toEqual([['dealer', 2]]);
  });
});

describe("combines d'atelier", () => {
  it('Teintures : une par enseigne, 3 cartes au plus', () => {
    const teintures = workshopCombines.filter((c) => c.id.startsWith('teinture-'));
    expect(teintures.map((t) => t.id).sort()).toEqual(
      ['teinture-carreau', 'teinture-coeur', 'teinture-pique', 'teinture-trefle'].sort(),
    );
    const ctx = hookCtx();
    W('teinture-coeur').use(ctx, [1, 2, 3, 4]);
    expect(ctx.api.argsOf('changeSuit')).toEqual([
      [1, 'hearts'],
      [2, 'hearts'],
      [3, 'hearts'],
    ]);
  });

  it('chaque amélioration a sa combine, plafonnée à son nombre de cibles', () => {
    const expected: Record<string, [string, number]> = {
      plomb: ['plombee', 2],
      braise: ['ardente', 2],
      cristal: ['cristal', 1],
      dorure: ['doree', 2],
      marque: ['marquee', 2],
      voile: ['fantome', 1],
      ressort: ['elastique', 2],
      losange: ['arlequin', 1],
    };
    for (const [id, [enh, max]] of Object.entries(expected)) {
      const d = W(id);
      expect(d.targeting).toMatchObject({ zone: 'deck', min: 1, max });
      const ctx = hookCtx();
      d.use(ctx, [10, 11, 12]);
      expect(ctx.api.argsOf('enhanceCard')).toEqual([10, 11].slice(0, max).map((t) => [t, enh]));
      expect(d.usableIn).not.toContain('playerTurn');
    }
  });

  it('Faussaire copie, Autodafé détruit 2 cartes au plus', () => {
    const f = hookCtx();
    W('faussaire').use(f, [7]);
    expect(f.api.argsOf('duplicateCard')).toEqual([[7]]);
    const a = hookCtx();
    W('autodafe').use(a, [1, 2, 3]);
    expect(a.api.argsOf('destroyCard')).toEqual([
      [1, 'Autodafé'],
      [2, 'Autodafé'],
    ]);
  });
});

describe('Autodafé et plancher du sabot', () => {
  it('injouable au plancher, une seule cible s’il ne reste qu’une carte de marge', () => {
    const d = W('autodafe');
    const floor = balance.minDeckSize ?? 10;
    const atFloor = makeState();
    atFloor.deck = atFloor.deck.slice(0, floor);
    expect(d.canUse!(atFloor, makeRules())).toBe(false);
    const oneAbove = makeState();
    oneAbove.deck = oneAbove.deck.slice(0, floor + 1);
    expect(d.canUse!(oneAbove, makeRules())).toBe(true);
    const ctx = hookCtx({ state: oneAbove });
    d.use(ctx, [oneAbove.deck[0]!.id, oneAbove.deck[1]!.id]);
    expect(ctx.api.argsOf('destroyCard')).toHaveLength(1);
  });
});

describe('faveurs', () => {
  it('Patte de lapin (Triple Sept) n’apparaît qu’après avoir marqué la figure', () => {
    const f = faveurs.find((x) => FAVEUR_FIGURE[x.id] === 'triple7')!;
    const s = makeState();
    expect(f.canAppear!(s)).toBe(false);
    s.stats.figureCounts = { triple7: 1 };
    expect(f.canAppear!(s)).toBe(true);
    expect(faveurs.filter((x) => x.canAppear)).toHaveLength(1);
  });

  it('une faveur par figure, qui la monte d’un niveau', () => {
    expect(faveurs).toHaveLength(FIGURE_IDS.length);
    const seen = new Set<FigureId>();
    for (const f of faveurs) {
      expect(f.kind).toBe('faveur');
      const ctx = hookCtx();
      f.use(ctx, []);
      const [[fig, levels]] = ctx.api.argsOf('levelUpFigure') as [[FigureId, number]];
      expect(levels).toBe(1);
      expect(FAVEUR_FIGURE[f.id]).toBe(fig);
      seen.add(fig);
    }
    expect([...seen].sort()).toEqual([...FIGURE_IDS].sort());
  });
});
