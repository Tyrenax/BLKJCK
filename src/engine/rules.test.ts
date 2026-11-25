import { describe, expect, it } from 'vitest';
import { createRng, hashSeed } from './rng';
import { makeTestContent, testBalance } from './testing/content';
import { atBossTable, makeEngine, startedRun, withAtouts } from './testing/helpers';
import type { AtoutDef, BossDef, EmblemArt, RunState } from './types';

const art: EmblemArt = { glyph: '?', pattern: 'uni', colors: ['#000', '#fff'] };

describe('règles effectives', () => {
  it('fournit les clés étendues par défaut', () => {
    const e = makeEngine();
    const r = e.getRules(e.newRun('R').state);
    expect(r.hidePlayerFirstCard).toBe(false);
    expect(r.dealerExtraDraws).toBe(0);
    expect(r.freeRerollsPerShop).toBe(0);
    expect(r.rerollDiscount).toBe(0);
    expect(r.shredsPerShop).toBe(testBalance.shredsPerShop);
  });

  it('empile base -> runMods -> table -> main -> patron -> atouts (gauche à droite)', () => {
    // Chaque étage écrit sa trace dans playerLimit : on vérifie l'ordre en composant set/add/×.
    const boss: BossDef = {
      id: 'b-x2',
      name: 'Double',
      description: '',
      minSalon: 1,
      art,
      hooks: { modifyRules: (r) => void (r.playerLimit *= 2) },
    };
    const plus3: AtoutDef = {
      id: 'a-plus3',
      name: '+3',
      description: '',
      rarity: 'commun',
      cost: 1,
      art,
      hooks: { modifyRules: (r) => void (r.playerLimit += 3) },
    };
    const x10: AtoutDef = { ...plus3, id: 'a-x10', hooks: { modifyRules: (r) => void (r.playerLimit *= 10) } };
    const e = makeEngine(makeTestContent({ bosses: [boss], atouts: [plus3, x10] }));
    let s: RunState = startedRun(e);
    s = structuredClone(s);
    s.runMods.push({ key: 'playerLimit', set: 1, source: 'run' });
    s.table!.mods.push({ key: 'playerLimit', add: 1, source: 'table' });
    s.table!.hand!.mods.push({ key: 'playerLimit', add: 1, source: 'main' });
    s = withAtouts(s);
    s.atouts.push({ uid: 900, defId: 'a-plus3', state: {} }, { uid: 901, defId: 'a-x10', state: {} });
    // Petite table : pas de patron. ((1 + 1 + 1) + 3) × 10 = 60
    expect(e.getRules(s).playerLimit).toBe(60);
    // Table du patron : ((1 + 1 + 1) × 2 + 3) × 10 = 90
    expect(e.getRules(atBossTable(s, 'b-x2')).playerLimit).toBe(90);
    // L'ordre des atouts compte : 3 × 10 puis + 3 = 33
    const swapped = structuredClone(s);
    swapped.atouts.reverse();
    expect(e.getRules(swapped).playerLimit).toBe(33);
  });

  it('le patron ne s’applique qu’à sa table', () => {
    const e = makeEngine();
    const s = startedRun(e);
    expect(e.getRules(s).playerLimit).toBe(21);
    expect(e.getRules(atBossTable(s, 't-pince')).playerLimit).toBe(20);
  });

  it('borne les valeurs absurdes', () => {
    const e = makeEngine();
    const s = structuredClone(startedRun(e));
    s.runMods.push({ key: 'handsPerTable', add: -10, source: 'x' }, { key: 'discardsPerTable', add: -10, source: 'x' });
    const r = e.getRules(s);
    expect(r.handsPerTable).toBe(1);
    expect(r.discardsPerTable).toBe(0);
  });
});

describe('aléatoire à graine', () => {
  it('même graine = même suite', () => {
    const a = createRng({ rngState: hashSeed('abc') });
    const b = createRng({ rngState: hashSeed('abc') });
    const sa = Array.from({ length: 20 }, () => a.next());
    const sb = Array.from({ length: 20 }, () => b.next());
    expect(sa).toEqual(sb);
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
  });

  it('int, chance, pick, shuffle restent dans leurs bornes', () => {
    const r = createRng({ rngState: 42 });
    for (let i = 0; i < 1000; i++) {
      const n = r.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
    const arr = Array.from({ length: 30 }, (_, i) => i);
    const sh = r.shuffle([...arr]);
    expect([...sh].sort((x, y) => x - y)).toEqual(arr);
    expect(sh).not.toEqual(arr);
    expect(() => r.pick([])).toThrow();
  });

  it('l’état du générateur vit dans le state', () => {
    const holder = { rngState: 7 };
    const r = createRng(holder);
    r.next();
    expect(holder.rngState).not.toBe(7);
  });
});
