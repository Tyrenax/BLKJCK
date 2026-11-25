/**
 * Mesure des textes affichés (noms et phrases de règle), pour l'audit de mise en page.
 * Les descriptions dynamiques des atouts sont évaluées dans leur pire état : compteurs à trois chiffres,
 * « Déjà ouvert à cette table. », « Cette main : rouge. »… On garde la plus longue.
 */
import type { AtoutDef, AtoutInstance, Content, RunState } from '../engine/types';

export type TextCategory =
  | 'atouts'
  | 'combines'
  | 'faveurs'
  | 'privileges'
  | 'patrons'
  | 'pots-de-vin'
  | 'sabots'
  | 'mises'
  | 'figures'
  | 'ameliorations';

/**
 * Budget de longueur, toutes catégories (décision de bjck-41 après mesure des conteneurs par bjck-d4) :
 * la mise en page s'adapte jusque-là, aucune règle n'est tronquée.
 */
export const TEXT_BUDGET = { name: 22, text: 90 } as const;

export interface TextEntry {
  category: TextCategory;
  id: string;
  name: string;
  /** Phrase de règle dans son pire état. */
  text: string;
}

/** Instance d'atout dont chaque compteur vaut `v`, quelle que soit la clé lue. */
function fakeInstance(d: AtoutDef, v: number): AtoutInstance {
  const state = new Proxy({} as Record<string, number>, { get: () => v });
  return { uid: 'mesure', defId: d.id, state } as unknown as AtoutInstance;
}

/** États de partie extrêmes : 999 $, 50 atouts, sabot vide ou de 999 cartes, une main en cours. */
function fakeStates(): (RunState | undefined)[] {
  const make = (deck: number) =>
    ({
      money: 999,
      atouts: new Array(50).fill(null),
      deck: new Array(deck).fill(null),
      table: { hand: {} },
    }) as unknown as RunState;
  return [undefined, make(0), make(999)];
}

/** La plus longue des descriptions possibles d'un atout. */
export function worstAtoutText(d: AtoutDef): string {
  const desc = d.description;
  if (typeof desc === 'string') return desc;
  let worst = '';
  for (const v of [0, 1, 999]) {
    for (const s of fakeStates()) {
      let t = '';
      try {
        t = desc(fakeInstance(d, v), s);
      } catch {
        continue;
      }
      if (t.length > worst.length) worst = t;
    }
  }
  return worst;
}

/** Description d'un atout tel qu'il est proposé en boutique : état initial, début de partie. */
export function shopAtoutText(d: AtoutDef): string {
  const desc = d.description;
  if (typeof desc === 'string') return desc;
  const self = { uid: 'boutique', defId: d.id, state: d.initialState?.() ?? {} } as unknown as AtoutInstance;
  const state = {
    money: 10,
    atouts: new Array(3).fill(null),
    deck: new Array(52).fill(null),
    table: null,
  } as unknown as RunState;
  return desc(self, state);
}

/** Tous les textes du contenu, par catégorie. */
export function textEntries(c: Content): TextEntry[] {
  const out: TextEntry[] = [];
  const add = (category: TextCategory, id: string, name: string, text: string) =>
    out.push({ category, id, name, text });
  for (const a of c.atouts) add('atouts', a.id, a.name, worstAtoutText(a));
  for (const x of c.consumables) add(x.kind === 'faveur' ? 'faveurs' : 'combines', x.id, x.name, x.description);
  for (const x of c.privileges) add('privileges', x.id, x.name, x.description);
  for (const x of c.bosses) add('patrons', x.id, x.name, x.description);
  for (const x of c.skipRewards ?? []) add('pots-de-vin', x.id, x.name, x.description);
  for (const x of c.startingDecks ?? []) add('sabots', x.id, x.name, x.description);
  for (const x of c.stakes ?? []) add('mises', x.id, x.name, x.description);
  for (const x of Object.values(c.figures)) add('figures', x.id, x.name, x.description);
  for (const x of Object.values(c.enhancements)) add('ameliorations', x.id, x.name, x.description);
  return out;
}
