/**
 * Collection et profil : tout ce qui a été rencontré (le reste en silhouette), les statistiques
 * et les records qui survivent d'une partie à l'autre.
 */
import type { AtoutDef, BossDef, ConsumableDef, EmblemArt, PrivilegeDef, Rarity, StartingDeckDef } from '../../engine/types';
import { sfx } from '../audio/sfx';
import { el, place } from '../core/stage';
import type { EmblemKind } from '../gfx/cardArt';
import type { Game, OpenScreenLike } from '../game';
import { button, Panel } from '../screens/common';
import { fmt } from '../view/hud';
import { atoutText } from '../view/items';
import { attachTip } from '../view/tooltip';
import { ATOUT_FAMILY } from '../../content';
import type { Profile } from '../../profile';
import { getProfile } from './profileStore';
import { dealRow, emblemOrSilhouette, figureName, scoreLine } from './widgets';

type TabId = 'atouts' | 'combines' | 'faveurs' | 'patrons' | 'privileges' | 'sabots' | 'records';

/** Familles d'atouts (axes de synergie), dans l'ordre d'affichage, avec leur nom. */
const FAMILIES: [string, string][] = [
  ['limite', 'La limite'],
  ['croupier', 'Le croupier'],
  ['enseignes', 'Les enseignes'],
  ['tetes', 'Les grosses cartes'],
  ['petites', 'Petites cartes'],
  ['risque', 'Le risque'],
  ['croissance', 'Ce qui grossit'],
  ['argent', "L'argent"],
  ['sabot', 'Le sabot affiné'],
  ['legendaire', 'Légendaires'],
];
const FAMILIES_PER_PAGE = 5;

interface Entry {
  id: string;
  name: string;
  sub: string;
  body: string;
  art: EmblemArt;
  kind: EmblemKind;
  rarity?: Rarity;
  seen: boolean;
}

const RARITY_NAME: Record<Rarity, string> = { commun: 'Commun', 'peu-commun': 'Peu commun', rare: 'Rare', legendaire: 'Légendaire' };

export class CollectionScreen implements OpenScreenLike {
  private panel: Panel;
  private body: HTMLElement;
  private tab: TabId = 'atouts';
  private page = 0;

  constructor(parent: HTMLElement, private game: Game) {
    const root = place(el('div', 'x-root f-panel', parent), 40, 20, 1200, 680);
    this.panel = new Panel(root, 'right');
    this.body = el('div', 'xc-body', root);
  }

  isOpen(): boolean {
    return this.panel.open;
  }

  open(): void {
    this.render();
    void this.panel.show();
  }

  /** Ouvre directement un onglet (captures : ?exttab=records). */
  showTab(id: string): void {
    const ok = ['atouts', 'combines', 'faveurs', 'patrons', 'privileges', 'sabots', 'records'];
    if (!ok.includes(id)) return;
    this.tab = id as TabId;
    if (this.panel.open) this.render();
  }

  hide(): void {
    void this.panel.hide();
  }

  primary(): void {
    this.hide();
  }

  private entries(tab: Exclude<TabId, 'records'>, p: Profile): Entry[] {
    const c = this.game.engine.content;
    const seen = p.seen;
    switch (tab) {
      case 'atouts':
        return c.atouts.map((d: AtoutDef) => ({
          id: d.id,
          name: d.name,
          sub: RARITY_NAME[d.rarity],
          body: atoutText(d, null, null),
          art: d.art,
          kind: 'atout' as const,
          rarity: d.rarity,
          seen: seen.atouts.includes(d.id),
        }));
      case 'combines':
      case 'faveurs':
        return c.consumables
          .filter((d: ConsumableDef) => (tab === 'combines' ? d.kind === 'combine' : d.kind === 'faveur'))
          .map((d) => ({
            id: d.id,
            name: d.name,
            sub: d.kind === 'combine' ? 'Combine' : 'Faveur',
            body: d.description,
            art: d.art,
            kind: d.kind,
            seen: seen.consumables.includes(d.id),
          }));
      case 'patrons':
        return c.bosses.map((d: BossDef) => ({
          id: d.id,
          name: d.name,
          sub: d.finale ? 'Patron du dernier salon' : `Patron, dès le salon ${d.minSalon}`,
          body: d.description,
          art: d.art,
          kind: 'patron' as const,
          seen: seen.bosses.includes(d.id),
        }));
      case 'privileges':
        return c.privileges.map((d: PrivilegeDef) => ({
          id: d.id,
          name: d.name,
          sub: 'Privilège',
          body: d.description,
          art: d.art,
          kind: 'privilege' as const,
          seen: seen.privileges.includes(d.id),
        }));
      case 'sabots':
        return (c.startingDecks ?? []).map((d: StartingDeckDef) => ({
          id: d.id,
          name: d.name,
          sub: 'Sabot de départ',
          body: d.description,
          art: d.art,
          kind: 'sabot' as const,
          seen: seen.decks.includes(d.id),
        }));
    }
  }

  private render(): void {
    const b = this.body;
    b.innerHTML = '';
    const p = getProfile();
    const tabs: [TabId, string][] = [
      ['atouts', 'Atouts'],
      ['combines', 'Combines'],
      ['faveurs', 'Faveurs'],
      ['patrons', 'Patrons'],
      ['privileges', 'Privilèges'],
      ['sabots', 'Sabots'],
      ['records', 'Records'],
    ];
    let seenTotal = 0;
    let total = 0;
    const counts = new Map<TabId, [number, number]>();
    for (const [id] of tabs) {
      if (id === 'records') continue;
      const e = this.entries(id, p);
      const n = e.filter((x) => x.seen).length;
      counts.set(id, [n, e.length]);
      seenTotal += n;
      total += e.length;
    }

    const head = el('div', 'xc-head', b);
    el('div', 'x-h1 t-num', head, 'Collection');
    el('div', 'x-sub t-num', head, `${seenTotal} objets rencontrés sur ${total}`);

    const bar = el('div', 'xc-tabs', b);
    for (const [id, label] of tabs) {
      const t = el('button', `xc-tab${id === this.tab ? ' on' : ''}`, bar);
      const n = counts.get(id);
      t.innerHTML = n ? `${label}<span>${n[0]}/${n[1]}</span>` : label;
      t.addEventListener('click', () => {
        if (this.tab === id) return;
        sfx.tick();
        this.tab = id;
        this.render();
      });
    }

    const foot = el('div', 'xc-foot', b);
    if (this.tab === 'records') this.records(b, p);
    else if (this.tab === 'atouts') this.families(b, foot, this.entries('atouts', p));
    else this.grid(b, this.entries(this.tab, p));
    button(foot, 'Fermer', { key: 'Échap', w: 220, x: 478, y: 0 }, () => this.hide());
  }

  private grid(parent: HTMLElement, items: Entry[]): void {
    const g = el('div', 'xc-grid', parent);
    if (items.length === 0) {
      el('div', 'xc-empty t-body', g, 'Rien à collectionner ici pour l’instant.');
      return;
    }
    const cols = 15;
    const stepX = 76;
    const stepY = 96;
    const rows = Math.ceil(items.length / cols);
    const used = Math.min(cols, items.length);
    const x0 = Math.round((1160 - (used * stepX - 16)) / 2);
    const y0 = Math.max(0, Math.round((456 - (rows * stepY - 12)) / 2) - 8);
    items.forEach((it, i) => {
      const cv = emblemOrSilhouette(it.art, it.kind, it.seen, it.rarity);
      cv.className = 'xc-item';
      cv.style.left = `${x0 + (i % cols) * stepX}px`;
      cv.style.top = `${y0 + Math.floor(i / cols) * stepY}px`;
      g.appendChild(cv);
      attachTip(cv, () => (it.seen ? { name: it.name, sub: it.sub, body: it.body } : { name: '???', sub: 'Pas encore rencontré' }));
    });
  }

  /** Atouts rangés par famille : une ligne par famille, son nom à gauche, cinq familles par page. */
  private families(parent: HTMLElement, foot: HTMLElement, items: Entry[]): void {
    const g = el('div', 'xc-grid', parent);
    const groups = new Map<string, Entry[]>(FAMILIES.map(([id]) => [id, []]));
    const others: Entry[] = [];
    for (const it of items) (groups.get(ATOUT_FAMILY[it.id] ?? '') ?? others).push(it);
    const rows: [string, Entry[]][] = FAMILIES.map(([id, name]) => [name, groups.get(id) ?? []] as [string, Entry[]]).filter(
      ([, list]) => list.length > 0,
    );
    if (others.length) rows.push(['Autres', others]);
    const pages = Math.max(1, Math.ceil(rows.length / FAMILIES_PER_PAGE));
    this.page = Math.min(this.page, pages - 1);
    const shown = rows.slice(this.page * FAMILIES_PER_PAGE, (this.page + 1) * FAMILIES_PER_PAGE);
    const stepX = 72;
    const stepY = 90;
    shown.forEach(([name, list], r) => {
      const y = r * stepY;
      const seen = list.filter((x) => x.seen).length;
      const labEl = place(el('div', 'xc-fam t-body', g), 0, y + 22, 170);
      labEl.innerHTML = `${name}<span>${seen}/${list.length}</span>`;
      list.forEach((it, i) => {
        const cv = emblemOrSilhouette(it.art, it.kind, it.seen, it.rarity);
        cv.className = 'xc-item';
        cv.style.left = `${180 + i * stepX}px`;
        cv.style.top = `${y}px`;
        g.appendChild(cv);
        attachTip(cv, () => (it.seen ? { name: it.name, sub: `${it.sub}, ${name.toLowerCase()}`, body: it.body } : { name: '???', sub: 'Pas encore rencontré' }));
      });
    });
    if (pages > 1) {
      for (let k = 0; k < pages; k++) {
        const first = k * FAMILIES_PER_PAGE + 1;
        const last = Math.min(rows.length, (k + 1) * FAMILIES_PER_PAGE);
        const t = place(el('button', `xc-tab xc-page${k === this.page ? ' on' : ''}`, foot, `familles ${first} à ${last}`), k * 170, 12);
        t.addEventListener('click', () => {
          if (this.page === k) return;
          sfx.tick();
          this.page = k;
          this.render();
        });
      }
    }
  }

  private records(parent: HTMLElement, p: Profile): void {
    const r = el('div', 'xc-rec', parent);
    const big = (x: number, v: string, k: string) => {
      const e = place(el('div', 'xc-big', r), x, 0);
      el('div', 'xc-big-v t-num', e, v);
      el('div', 'xc-big-k t-num', e, k);
    };
    const rate = p.runsPlayed ? Math.round((p.runsWon / p.runsPlayed) * 100) : 0;
    big(0, fmt(p.runsPlayed), p.runsPlayed > 1 ? 'parties jouées' : 'partie jouée');
    big(230, fmt(p.runsWon), p.runsWon > 1 ? 'parties gagnées' : 'partie gagnée');
    big(460, `${rate} %`, 'de victoires');
    big(690, p.furthestSalon ? `${p.furthestSalon}` : '0', 'salon le plus loin');

    // Meilleure main de tous les temps
    place(el('div', 'x-lab t-num abs', r, 'ta meilleure main, toutes parties confondues'), 0, 116);
    const bh = p.bestHand;
    if (bh) {
      const cards = place(el('div', 'xe-best-cards', r), 0, 146);
      place(el('div', 'xe-fig t-gothic', r, figureName(this.game, bh.figure)), 0, 330);
      place(el('div', 'xe-score t-num', r), 0, 380).innerHTML = scoreLine(bh.chips, bh.mult, bh.score);
      void dealRow(cards, bh.cards, { width: 300, gap: 10, scale: 2 });
      if (bh.salon) place(el('div', 'x-lab t-num abs', r, `au salon ${bh.salon}`), 0, 420);
    } else {
      place(el('div', 'xc-empty t-body', r, 'Joue une main qui marque, elle viendra ici.'), 0, 146);
    }

    // Par sabot : parties, victoires, mise la plus haute gagnée
    const c = this.game.engine.content;
    const decks = c.startingDecks?.length ? c.startingDecks.map((d) => ({ id: d.id, name: d.name })) : [{ id: 'standard', name: 'Sabot classique' }];
    // 210 + 80 + 90 + 220 + 3 × 10 = 630 px : tient dans le panneau, à droite de la meilleure main
    const table = place(el('div', 'xc-table', r), 470, 116, 630);
    const head = el('div', 'xc-row head t-num', table);
    const cell = (row: HTMLElement, text: string, w: number, align: 'left' | 'right' = 'left') => {
      const e = el('div', 'xc-cell', row, text);
      e.style.width = `${w}px`;
      e.style.textAlign = align;
      return e;
    };
    const withStakes = !!c.stakes?.length;
    cell(head, 'par sabot', 210);
    cell(head, 'jouées', 80, 'right');
    cell(head, 'gagnées', 90, 'right');
    if (withStakes) cell(head, 'plus haute mise gagnée', 220, 'right');
    for (const d of decks) {
      const rec = p.byDeck[d.id];
      const row = el('div', 'xc-row t-num', table);
      cell(row, d.name, 210).classList.toggle('c-cendre', !rec?.played);
      cell(row, String(rec?.played ?? 0), 80, 'right');
      cell(row, String(rec?.won ?? 0), 90, 'right');
      if (withStakes) {
        const best = rec && rec.bestStakeWon >= 0 ? (c.stakes?.[rec.bestStakeWon]?.name ?? '') : '';
        cell(row, best || 'aucune', 220, 'right').classList.toggle('c-cendre', !best);
      }
    }
  }
}
