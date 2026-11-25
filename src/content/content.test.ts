import { describe, expect, it } from 'vitest';
import type { AtoutDef, EmblemArt, Rules } from '../engine/types';
import { ATOUT_FAMILY, content } from './index';
import { EMBLEM_COLORS, isDrawableGlyphChar } from './palette';
import { cards, instance, makeRules, makeState } from './test/helpers';
import { TEXT_BUDGET, textEntries, worstAtoutText } from './textes';

const { atouts, consumables, privileges, bosses, balance, figures, enhancements } = content;
const decks = content.startingDecks ?? [];
const skips = content.skipRewards ?? [];

const PATTERNS: EmblemArt['pattern'][] = ['rayures', 'damier', 'soleil', 'losanges', 'vagues', 'points', 'chevrons', 'uni'];

function describeAtout(d: AtoutDef, withState: boolean): string {
  if (typeof d.description === 'string') return d.description;
  const self = instance(d);
  return withState ? d.description(self, makeState({ money: 12 })) : d.description(self);
}

/** États variés pour éprouver modifyRules. */
function sampleStates() {
  return [
    makeState(),
    makeState({ table: null }),
    makeState({ money: 40, table: { handIndex: 3, kind: 'patron', bossId: 'la-maison' } }),
    makeState({ hand: { playerCards: cards('As', 'Kh') } }),
  ];
}

describe('contenu — quantités (brief)', () => {
  it('au moins 36 atouts, 14 combines, 8 faveurs, 8 privilèges, 12 patrons dont La Maison', () => {
    expect(atouts.length).toBeGreaterThanOrEqual(36);
    expect(consumables.filter((c) => c.kind === 'combine').length).toBeGreaterThanOrEqual(14);
    expect(consumables.filter((c) => c.kind === 'faveur')).toHaveLength(8);
    expect(privileges.length).toBeGreaterThanOrEqual(8);
    expect(bosses.length).toBeGreaterThanOrEqual(12);
    const finales = bosses.filter((b) => b.finale);
    expect(finales.map((b) => b.id)).toEqual(['la-maison']);
  });

  it('chaque atout a une famille de synergie', () => {
    for (const a of atouts) expect(ATOUT_FAMILY[a.id], a.id).toBeDefined();
  });

  it('chaque salon a au moins 3 patrons possibles (hors finale)', () => {
    for (let s = 1; s <= balance.salons; s++) {
      const pool = bosses.filter((b) => !b.finale && b.minSalon <= s);
      expect(pool.length, `salon ${s}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('contenu — cohérence', () => {
  const all = [...atouts, ...consumables, ...privileges, ...bosses, ...decks, ...skips];

  it('identifiants uniques et en kebab-case ascii', () => {
    const ids = all.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('noms uniques', () => {
    const names = [...atouts, ...consumables, ...privileges, ...bosses, ...decks, ...skips].map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('prix entiers positifs, raretés valides', () => {
    for (const d of [...atouts, ...consumables, ...privileges]) {
      expect(Number.isInteger(d.cost) && d.cost > 0, d.id).toBe(true);
    }
    for (const a of atouts) expect(['commun', 'peu-commun', 'rare', 'legendaire']).toContain(a.rarity);
  });

  it('descriptions : une phrase lisible, sans trou ni anglais', () => {
    const texts = [
      ...atouts.flatMap((a) => [describeAtout(a, false), describeAtout(a, true)]),
      ...consumables.map((c) => c.description),
      ...privileges.map((p) => p.description),
      ...bosses.map((b) => b.description),
      ...decks.map((d) => d.description),
      ...skips.map((s) => s.description),
      ...Object.values(figures).map((f) => f.description),
      ...Object.values(enhancements).map((e) => e.description),
    ];
    for (const t of texts) {
      expect(t.length, t).toBeGreaterThan(5);
      expect(t.length, t).toBeLessThanOrEqual(140);
      expect(t, t).not.toMatch(/undefined|NaN|null|\[object/);
      expect(t, t).not.toMatch(/\b(joker|deck|chips|bust|blind|hand|tarot|planet)\b/i);
      expect(t, t).not.toMatch(/\d\.\d/); // décimales à la française : 1,5
      expect(t, t).toMatch(/[.!]$/);
    }
  });

  it('les nombres collent à leur unité pour que l’UI les colore', () => {
    for (const a of atouts) {
      const t = describeAtout(a, true);
      // « 4 Mult » mais jamais « 4  Mult » ni « Mult 4 ».
      expect(t, a.id).not.toMatch(/\d\s{2,}(Mult|Jetons|\$)/);
      expect(t, a.id).not.toMatch(/(Mult|Jetons)\s+\+?\d/);
    }
  });

  it('état des atouts : uniquement des nombres', () => {
    for (const a of atouts) {
      const s = a.initialState?.() ?? {};
      for (const v of Object.values(s)) expect(typeof v === 'number' && Number.isFinite(v), a.id).toBe(true);
    }
  });
});

describe('contenu — emblèmes', () => {
  const arts = [...atouts, ...consumables, ...privileges, ...bosses, ...decks, ...skips].map((d) => ({
    id: d.id,
    art: d.art,
  }));

  it('glyphe de 1 à 3 caractères dessinables, motif connu, couleurs de la palette', () => {
    for (const { id, art } of arts) {
      const chars = [...art.glyph];
      expect(chars.length, id).toBeGreaterThanOrEqual(1);
      expect(chars.length, id).toBeLessThanOrEqual(3);
      for (const ch of chars) expect(isDrawableGlyphChar(ch), `${id} : « ${ch} »`).toBe(true);
      expect(PATTERNS).toContain(art.pattern);
      for (const c of art.colors) expect(EMBLEM_COLORS, `${id} : ${c}`).toContain(c);
      expect(art.colors[0], id).not.toBe(art.colors[1]);
    }
  });

  it('pas de couleur de sens (menthe, braise, laiton) dans un emblème', () => {
    for (const { id, art } of arts) {
      for (const c of art.colors) expect(c, id).not.toMatch(/menthe|braise|laiton/);
    }
  });

  it('chaque objet est reconnaissable : (glyphe, motif, couleurs) unique', () => {
    const keys = arts.map(({ art }) => `${art.glyph}|${art.pattern}|${art.colors.join('/')}`);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dupes).toEqual([]);
  });

  it('parmi les atouts, (glyphe, motif) suffit à les distinguer', () => {
    const keys = atouts.map((a) => `${a.art.glyph}|${a.art.pattern}`);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dupes).toEqual([]);
  });
});

describe('contenu — modifyRules pur et idempotent', () => {
  const withRules = [...atouts, ...bosses].filter((d) => d.hooks.modifyRules);

  it.each(withRules.map((d) => [d.id, d] as const))('%s', (_id, d) => {
    for (const state of sampleStates()) {
      const before = JSON.stringify(state);
      const self = 'rarity' in d ? instance(d as AtoutDef) : null;
      const selfBefore = JSON.stringify(self);
      const a: Rules = makeRules();
      const b: Rules = makeRules();
      d.hooks.modifyRules!(a, self, state);
      d.hooks.modifyRules!(b, self, state);
      expect(a).toEqual(b);
      expect(JSON.stringify(state)).toBe(before);
      expect(JSON.stringify(self)).toBe(selfBefore);
    }
  });
});

describe('contenu — balance', () => {
  it('objectifs : un par salon, croissance entre ×1,4 et ×2,2', () => {
    const t = balance.salonBaseTargets;
    expect(t).toHaveLength(balance.salons);
    for (let i = 1; i < t.length; i++) {
      const ratio = t[i]! / t[i - 1]!;
      expect(ratio, `salon ${i + 1}`).toBeGreaterThanOrEqual(1.4);
      expect(ratio, `salon ${i + 1}`).toBeLessThanOrEqual(2.2);
    }
  });

  it('baseRules donne une valeur à chaque règle', () => {
    const r = makeRules();
    const keys: (keyof Rules)[] = [
      'playerLimit', 'dealerLimit', 'dealerStandOn', 'handsPerTable', 'discardsPerTable', 'charlieSize',
      'doubleXMult', 'lossMultKeep', 'pushMultKeep', 'pushCountsAsWin', 'dealerWinsPush', 'seeNextCard',
      'seeDealerHole', 'canDouble', 'canDiscard', 'atoutSlots', 'consumableSlots', 'shopOffers', 'interestCap',
      'targetFactor', 'hidePlayerFirstCard', 'dealerExtraDraws', 'freeRerollsPerShop', 'rerollDiscount', 'shredsPerShop',
    ];
    for (const k of keys) expect(r[k], k).toBeDefined();
  });

  it('figures : priorités uniques, dans l’ordre du contrat', () => {
    const order = ['blackjack', 'triple7', 'charlie', 'pile', 'couleur', 'paire', 'haute', 'petite'];
    const sorted = Object.values(figures).sort((a, b) => b.priority - a.priority).map((f) => f.id);
    expect(sorted).toEqual(order);
  });
});

describe('contenu — aucune source d’aléa hors Rng', () => {
  // Sources brutes de src/content via Vite (pas besoin de node:fs).
  const sources = import.meta.glob(['./**/*.ts', '!./**/*.test.ts'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  it('pas de Math.random ni Date.now dans src/content', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    for (const [file, src] of Object.entries(sources)) {
      expect(src, file).not.toMatch(/Math\.random|Date\.now|new Date\(/);
    }
  });
});

describe('contenu — longueur des textes affichés', () => {
  const entries = textEntries(content);

  it(`aucun nom au-delà de ${TEXT_BUDGET.name} caractères`, () => {
    const over = entries.filter((e) => [...e.name].length > TEXT_BUDGET.name);
    expect(over.map((e) => `${e.category} ${e.name} (${[...e.name].length})`)).toEqual([]);
  });

  it(`aucune règle au-delà de ${TEXT_BUDGET.text} caractères, descriptions dynamiques dans leur pire état`, () => {
    const over = entries.filter((e) => [...e.text].length > TEXT_BUDGET.text);
    expect(over.map((e) => `${e.category} ${e.name} (${[...e.text].length}) : ${e.text}`)).toEqual([]);
  });

  it('le pire état d’un atout dynamique est bien évalué', () => {
    const parachute = atouts.find((a) => a.id === 'parachute')!;
    expect(worstAtoutText(parachute)).toContain('Déjà ouvert');
    const rouge = atouts.find((a) => a.id === 'rouge-ou-noir')!;
    expect(worstAtoutText(rouge)).toContain('Cette main');
  });
});
