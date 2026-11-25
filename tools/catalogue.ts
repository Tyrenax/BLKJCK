/**
 * Catalogue lisible du contenu (pour la relecture) : `npx tsx tools/catalogue.ts > src/content/CATALOGUE.md`.
 */
import { ATOUTS_BY_FAMILY, content } from '../src/content/index';
import type { AtoutDef } from '../src/engine/types';

const out: string[] = [];
const p = (s = '') => out.push(s);

function text(d: AtoutDef): string {
  return typeof d.description === 'string'
    ? d.description
    : d.description({ uid: 0, defId: d.id, state: d.initialState?.() ?? {} });
}

p('# SABOT — catalogue du contenu');
p();
p(`_Généré par tools/catalogue.ts. ${content.atouts.length} atouts, ${
  content.consumables.filter((c) => c.kind === 'combine').length
} combines, ${content.consumables.filter((c) => c.kind === 'faveur').length} faveurs, ${
  content.privileges.length
} privilèges, ${content.bosses.length} patrons._`);
p();
p('## Atouts');
for (const [fam, defs] of Object.entries(ATOUTS_BY_FAMILY)) {
  p();
  p(`### ${fam} (${defs.length})`);
  for (const d of defs) p(`- **${d.name}** — ${text(d)} _(${d.rarity}, ${d.cost} $)_`);
}
p();
p('## Combines');
for (const c of content.consumables.filter((x) => x.kind === 'combine')) {
  p(`- **${c.name}** — ${c.description} _(${c.cost} $ ; ${c.usableIn.join(', ')})_`);
}
p();
p('## Faveurs');
for (const c of content.consumables.filter((x) => x.kind === 'faveur')) p(`- **${c.name}** — ${c.description}`);
p();
p('## Privilèges');
for (const v of content.privileges) {
  p(`- **${v.name}** — ${v.description} _(${v.cost} $${v.minSalon ? `, dès le salon ${v.minSalon}` : ''})_`);
}
p();
p('## Patrons');
for (const b of [...content.bosses].sort((a, z) => a.minSalon - z.minSalon)) {
  p(`- **${b.name}** — ${b.description} _(${b.finale ? 'salon final' : `dès le salon ${b.minSalon}`})_`);
}
p();
p('## Balance');
p(`- Objectifs de base par salon : ${content.balance.salonBaseTargets.join(' · ')}`);
p(`- Facteurs de table : ${JSON.stringify(content.balance.tableFactors)} · gains : ${JSON.stringify(content.balance.tableRewards)}`);

console.log(out.join('\n'));
