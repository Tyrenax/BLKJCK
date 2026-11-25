/**
 * Agrégation des RunRecord en un rapport texte compact (à coller dans un message).
 */
import type { FigureId, TableKind } from '../../src/engine/types';
import type { RunRecord, TableRecord } from './runner';

const KINDS: TableKind[] = ['petite', 'grande', 'patron'];
const KIND_SHORT: Record<TableKind, string> = { petite: 'P', grande: 'G', patron: 'B' };
const FIGS: FigureId[] = ['blackjack', 'triple7', 'charlie', 'pile', 'couleur', 'paire', 'haute', 'petite'];
const FIG_SHORT: Record<FigureId, string> = {
  blackjack: 'BJ',
  triple7: '777',
  charlie: 'Charlie',
  pile: 'Pile',
  couleur: 'Couleur',
  paire: 'Paire',
  haute: 'Haute',
  petite: 'Petite',
};

export const pct = (a: number, b: number) => (b > 0 ? `${((100 * a) / b).toFixed(0)}%` : '—');
const pad = (s: string | number, n: number) => String(s).padStart(n);
const padR = (s: string | number, n: number) => String(s).padEnd(n);

function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function sd(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Synthèse chiffrée d'un lot de parties (sert aussi aux comparaisons de variantes). */
export interface Summary {
  runs: number;
  winRate: number;
  salonMean: number;
  salonSd: number;
  s1Clear: number;
  s1PetiteLoss: number;
  handWin: number;
  handBust: number;
  zeroWinTables: number;
  unluckyLossShare: number;
}

export function summarize(runs: RunRecord[]): Summary {
  const salons = runs.map((r) => r.salonReached);
  const tables = runs.flatMap((r) => r.tables);
  const s1p = tables.filter((t) => t.salon === 1 && t.kind === 'petite');
  const hands = tables.reduce((a, t) => a + t.hands, 0);
  const wins = tables.reduce((a, t) => a + t.wins, 0);
  const busts = tables.reduce((a, t) => a + t.busts, 0);
  const finished = tables.filter((t) => t.won || isLost(t, runs));
  const lost = finished.filter((t) => !t.won);
  return {
    runs: runs.length,
    winRate: runs.filter((r) => r.won).length / Math.max(1, runs.length),
    salonMean: mean(salons),
    salonSd: sd(salons),
    s1Clear: runs.filter((r) => r.salonReached > 1).length / Math.max(1, runs.length),
    s1PetiteLoss: s1p.filter((t) => !t.won).length / Math.max(1, s1p.length),
    handWin: wins / Math.max(1, hands),
    handBust: busts / Math.max(1, hands),
    zeroWinTables: finished.filter((t) => t.wins === 0).length / Math.max(1, finished.length),
    unluckyLossShare: unluckyLosses(runs).unlucky / Math.max(1, lost.length),
  };
}

/** Une table est « perdue » si c'est la table de la mort de la partie. */
function isLost(t: TableRecord, _runs: RunRecord[]): boolean {
  return !t.won && t.hands > 0;
}

/**
 * Tables perdues « par malchance » : moins de victoires que le 10e centile des tables gagnées
 * du même salon et du même type (le robot a suivi sa stratégie, les cartes n'ont pas suivi).
 */
function unluckyLosses(runs: RunRecord[]): { unlucky: number; needByKey: Map<string, number> } {
  const tables = runs.flatMap((r) => r.tables);
  const needByKey = new Map<string, number>();
  const byKey = new Map<string, number[]>();
  for (const t of tables) {
    if (!t.won) continue;
    const k = `${t.salon}${t.kind}`;
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(t.wins);
  }
  for (const [k, ws] of byKey) needByKey.set(k, quantile(ws, 0.1));
  let unlucky = 0;
  for (const t of tables) {
    if (t.won || t.hands === 0) continue;
    const need = needByKey.get(`${t.salon}${t.kind}`);
    if (need !== undefined && t.wins < need) unlucky++;
  }
  return { unlucky, needByKey };
}

export interface ReportMeta {
  label: string;
  ms: number;
  families?: Record<string, string>;
}

export function report(runs: RunRecord[], meta: ReportMeta): string {
  const L: string[] = [];
  const p = (s = '') => L.push(s);
  const n = runs.length;
  const dispatches = runs.reduce((a, r) => a + r.dispatches, 0);
  const errors = runs.reduce((a, r) => a + r.botErrors, 0);
  const sum = summarize(runs);

  p(`== ${meta.label} — ${n} parties, ${(meta.ms / 1000).toFixed(1)} s (${(meta.ms / Math.max(1, n)).toFixed(1)} ms/partie, ${(
    dispatches / Math.max(1, n)
  ).toFixed(0)} actions/partie, ${((1000 * meta.ms) / Math.max(1, dispatches)).toFixed(0)} µs/action)${
    errors ? `  ⚠ ${errors} actions refusées` : ''
  }`);
  const salons = runs.map((r) => r.salonReached);
  p(
    `Victoire ${pct(runs.filter((r) => r.won).length, n)} · salon atteint moy ${sum.salonMean.toFixed(2)} ± ${sum.salonSd.toFixed(
      2,
    )} (p10 ${quantile(salons, 0.1)} · p50 ${quantile(salons, 0.5)} · p90 ${quantile(salons, 0.9)})`,
  );
  const hist = Array.from({ length: 9 }, (_, i) => salons.filter((s) => s === i + 1).length);
  p(`Meurt au salon : ${hist.slice(0, 8).map((c, i) => `${i + 1}:${pct(c, n)}`).join(' ')} · gagne : ${pct(hist[8] ?? 0, n)}`);

  // Réussite par table
  p('Réussite par table (gagnées / jouées) :');
  p(`  salon ${KINDS.map((k) => pad(k, 13)).join('')}`);
  const tables = runs.flatMap((r) => r.tables);
  for (let s = 1; s <= 8; s++) {
    const row = KINDS.map((k) => {
      const ts = tables.filter((t) => t.salon === s && t.kind === k && t.hands > 0);
      return pad(ts.length ? `${pct(ts.filter((t) => t.won).length, ts.length)} (${ts.length})` : '—', 13);
    });
    if (row.every((c) => c.trim() === '—')) break;
    p(`  ${pad(s, 5)} ${row.join('')}`);
  }

  // Patrons
  const bossStats = new Map<string, { met: number; kills: number }>();
  for (const t of tables) {
    if (t.kind !== 'patron' || !t.bossId || t.hands === 0) continue;
    const b = bossStats.get(t.bossId) ?? { met: 0, kills: 0 };
    b.met++;
    if (!t.won) b.kills++;
    bossStats.set(t.bossId, b);
  }
  const bossRows = [...bossStats.entries()].sort((a, b) => b[1].kills / b[1].met - a[1].kills / a[1].met);
  if (bossRows.length) {
    p(`Patrons (taux de mort quand rencontré) : ${bossRows.map(([id, b]) => `${id} ${pct(b.kills, b.met)}/${b.met}`).join(' · ')}`);
  }

  // Chance
  const played = tables.filter((t) => t.hands > 0);
  const winsDist = (ts: TableRecord[]) =>
    [0, 1, 2, 3, 4].map((w) => pct(ts.filter((t) => (w === 4 ? t.wins >= 4 : t.wins === w)).length, ts.length)).join(' / ');
  const hands = played.reduce((a, t) => a + t.hands, 0);
  const W = played.reduce((a, t) => a + t.wins, 0);
  const Pu = played.reduce((a, t) => a + t.pushes, 0);
  const Lo = played.reduce((a, t) => a + t.losses, 0);
  const B = played.reduce((a, t) => a + t.busts, 0);
  p(`Mains : victoire ${pct(W, hands)} · égalité ${pct(Pu, hands)} · défaite ${pct(Lo, hands)} · crevé ${pct(B, hands)}`);
  p(`Victoires par table (0/1/2/3/4+) : toutes ${winsDist(played)} · salon 1 ${winsDist(played.filter((t) => t.salon === 1))}`);
  const lost = played.filter((t) => !t.won);
  const { unlucky, needByKey } = unluckyLosses(runs);
  p(
    `Tables perdues : ${lost.length} · par nb de victoires ${winsDist(lost)} · « sans faute » (moins de victoires que le p10 des tables gagnées) ${pct(
      unlucky,
      lost.length,
    )}`,
  );
  const need = [1, 2, 3].map((s) => KINDS.map((k) => needByKey.get(`${s}${k}`) ?? '—').join('/')).join('  ');
  p(`Victoires « nécessaires » (p10 des tables gagnées, P/G/B) salons 1-3 : ${need}`);
  const s1p = played.filter((t) => t.salon === 1 && t.kind === 'petite');
  p(`Petite table du salon 1 perdue : ${pct(s1p.filter((t) => !t.won).length, s1p.length)} (cible ≤ 17 %)`);
  const s1 = played.filter((t) => t.salon === 1);
  const s1Points = s1.reduce((a, t) => a + t.score, 0);
  const s1Bj = s1.reduce((a, t) => a + t.bjScore, 0);
  const s1Won = s1.filter((t) => t.won);
  const byNatural = s1Won.filter((t) => t.bjScore > 0 && t.score - t.bjScore < t.target).length;
  p(`Blackjack au salon 1 : ${pct(s1Bj, s1Points)} des points · ${pct(byNatural, s1Won.length)} des tables gagnées ne l'auraient pas été sans lui`);

  // Figures
  const figLine = (from: number, to: number) => {
    const hc: Partial<Record<FigureId, number>> = {};
    const pc: Partial<Record<FigureId, number>> = {};
    for (const r of runs) {
      for (let s = from; s <= to; s++) {
        for (const f of FIGS) {
          hc[f] = (hc[f] ?? 0) + (r.figureHands[s]?.[f] ?? 0);
          pc[f] = (pc[f] ?? 0) + (r.figurePoints[s]?.[f] ?? 0);
        }
      }
    }
    const th = FIGS.reduce((a, f) => a + (hc[f] ?? 0), 0);
    const tp = FIGS.reduce((a, f) => a + (pc[f] ?? 0), 0);
    if (!th) return null;
    return FIGS.filter((f) => (hc[f] ?? 0) > 0)
      .map((f) => `${FIG_SHORT[f]} ${pct(hc[f] ?? 0, th)}/${pct(pc[f] ?? 0, tp)}`)
      .join(' · ');
  };
  const early = figLine(1, 2);
  const late = figLine(5, 8);
  if (early) p(`Figures (mains/points) salons 1-2 : ${early}`);
  if (late) p(`Figures (mains/points) salons 5-8 : ${late}`);

  // Rythme
  const shops = runs.flatMap((r) => r.shops);
  const moneyBySalon = [1, 2, 3, 4, 5, 6, 7, 8]
    .map((s) => {
      const xs = shops.filter((x) => x.salon === s);
      return xs.length ? `${s}:${mean(xs.map((x) => x.money)).toFixed(0)}$` : null;
    })
    .filter(Boolean);
  p(
    `Boutiques : ${shops.length} · achats/boutique ${mean(shops.map((x) => x.bought)).toFixed(2)} · rien d'abordable ${pct(
      shops.filter((x) => !x.couldBuy).length,
      shops.length,
    )} · argent en entrant ${moneyBySalon.join(' ')}`,
  );
  const ratio = [1, 2, 3, 4, 5, 6, 7, 8]
    .map((s) => {
      const ts = played.filter((t) => t.salon === s);
      if (!ts.length) return null;
      // Chaque main rapportée à la part d'objectif qu'elle doit couvrir (objectif ÷ mains de la table).
      const rel = ts.flatMap((t) => t.handScores.map((h) => h / (t.target / t.handsPerTable)));
      return `${s}:${quantile(rel, 0.5).toFixed(2)}/${mean(rel).toFixed(1)}`;
    })
    .filter(Boolean);
  p(`Main / (objectif ÷ mains), médiane/moyenne par salon : ${ratio.join(' ')}`);

  // Atouts
  const ever = new Map<string, number[]>();
  for (const r of runs) for (const a of r.atoutsEver) (ever.get(a) ?? ever.set(a, []).get(a)!).push(r.salonReached);
  if (ever.size) {
    const winners = runs.filter((r) => r.won);
    const gain = new Map<string, { log: number; hands: number }>();
    for (const r of runs) {
      for (const [id, g] of Object.entries(r.atoutGain)) {
        const x = gain.get(id) ?? { log: 0, hands: 0 };
        x.log += g.log;
        x.hands += g.hands;
        gain.set(id, x);
      }
    }
    const rows = [...ever.entries()].map(([id, sal]) => {
      const g = gain.get(id);
      const inWins = winners.filter((r) => r.atoutsFinal.includes(id)).length;
      return {
        id,
        n: sal.length,
        salon: mean(sal),
        x: g && g.hands ? Math.exp(g.log / g.hands) : 1,
        inWins,
      };
    });
    rows.sort((a, b) => b.salon - a.salon);
    const fam = meta.families ?? {};
    const fmt = (r: (typeof rows)[number]) =>
      `${r.id}${fam[r.id] ? `[${fam[r.id]}]` : ''} s${r.salon.toFixed(1)} ×${r.x.toFixed(2)} n${r.n}${
        winners.length ? ` v${pct(r.inWins, winners.length)}` : ''
      }`;
    p(`Atouts (salon moyen atteint quand possédé · ×gain moyen par main gagnée · nb parties · présence dans les victoires) :`);
    p(`  meilleurs : ${rows.slice(0, 10).map(fmt).join(' | ')}`);
    p(`  pires     : ${rows.slice(-8).map(fmt).join(' | ')}`);
    const byX = [...rows].filter((r) => r.n >= 5).sort((a, b) => b.x - a.x);
    p(`  plus gros ×gain : ${byX.slice(0, 8).map((r) => `${r.id} ×${r.x.toFixed(2)}`).join(' · ')}`);
    if (winners.length) {
      const common = rows.filter((r) => r.inWins / winners.length > 0.5).map((r) => `${r.id} ${pct(r.inWins, winners.length)}`);
      const uncond = ['corde-raide', 'sans-filet'].map(
        (id) => `${id} ${pct(winners.filter((w) => w.atoutsFinal.includes(id)).length, winners.length)}`,
      );
      p(`  dans plus de la moitié des victoires : ${common.join(' · ') || 'aucun'} · sans condition : ${uncond.join(' · ')}`);
    }
  }
  const maxTrig = Math.max(0, ...runs.map((r) => r.maxCardTriggers));
  const maxRatio = Math.max(0, ...runs.map((r) => r.maxHandRatio));
  p(`Pire cas : une carte déclenchée ${maxTrig} fois dans une main · plus grosse main = ${maxRatio.toFixed(1)}× l'objectif de sa table`);
  const samples = runs.flatMap((r) => r.errorSamples).slice(0, 3);
  if (samples.length) p(`Actions refusées (exemples) : ${samples.join(' || ')}`);
  return L.join('\n');
}

export function summaryLine(label: string, s: Summary): string {
  return `${padR(label, 26)} victoire ${pad(pct(s.winRate, 1), 4)} · salon ${s.salonMean.toFixed(2)} ± ${s.salonSd.toFixed(
    2,
  )} · S1 passé ${pad(pct(s.s1Clear, 1), 4)} · S1P perdue ${pad(pct(s.s1PetiteLoss, 1), 4)} · main gagnée ${pad(
    pct(s.handWin, 1),
    4,
  )} · crevé ${pad(pct(s.handBust, 1), 4)} · tables à 0 victoire ${pad(pct(s.zeroWinTables, 1), 4)} · pertes « sans faute » ${pad(
    pct(s.unluckyLossShare, 1),
    4,
  )}`;
}

export { KIND_SHORT };
