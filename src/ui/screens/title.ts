/** Écran titre : le nom en gothique de laiton, un éventail de cartes, trois boutons. */
import type { Card, Rank, Suit } from '../../engine/types';
import { el, place } from '../core/stage';
import type { Game } from '../game';
import { Sprite } from '../view/sprite';
import { backOf, faceOf } from '../view/table';
import { button, Panel } from './common';

export class TitleScreen {
  private panel: Panel;
  private root: HTMLElement;
  private sprites: Sprite[] = [];
  private menu: HTMLElement;
  private visible = false;
  constructor(parent: HTMLElement, private game: Game) {
    this.root = place(el('div', 'title', parent), 0, 0, 1280, 720);
    this.panel = new Panel(this.root, 'top');
    el('div', 'ti-name t-gothic', this.root, 'Sabot');
    el('div', 'ti-sub t-num', this.root, 'un blackjack de tricheur');
    this.menu = el('div', 'ti-menu', this.root);
  }

  isOpen(): boolean {
    return this.visible;
  }

  show(): void {
    this.visible = true;
    this.menu.innerHTML = '';
    const hasSave = this.game.hasSave();
    let y = 0;
    if (hasSave) {
      button(this.menu, 'Reprendre', { tone: 'petrole', key: 'Espace', w: 300, x: 0, y }, () => this.primary());
      y += 76;
    }
    button(this.menu, 'Nouvelle partie', { tone: hasSave ? '' : 'petrole', key: hasSave ? undefined : 'Espace', w: 300, x: 0, y }, () => this.newGame());
    y += 76;
    if (this.game.screens.collection) {
      button(this.menu, 'Collection', { w: 300, x: 0, y }, () => this.game.screens.collection?.open());
      y += 76;
    }
    button(this.menu, 'Réglages', { key: 'Échap', w: 300, x: 0, y }, () => this.game.screens.settings.open());
    this.fan();
    void this.panel.show();
  }

  primary(): void {
    if (!this.visible) return;
    if (this.game.hasSave()) {
      this.hide();
      this.game.resume();
    } else this.newGame();
  }

  /** Nouvelle partie : l'écran de lancement s'il existe (sabot, mise), sinon directement. */
  private newGame(): void {
    const launch = this.game.screens.launch;
    if (launch) {
      launch.open();
      return;
    }
    this.hide();
    void this.game.newRun();
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    for (const s of this.sprites) {
      s.moveTo(1178, -120, 0);
    }
    const old = this.sprites;
    this.sprites = [];
    setTimeout(() => old.forEach((s) => s.destroy()), 500);
    void this.panel.hide();
  }

  /** Un éventail de cartes qui sort du sabot du croupier. */
  private fan(): void {
    for (const s of this.sprites) s.destroy();
    this.sprites = [];
    const hand: [Rank, Suit][] = [['A', 'spades'], ['K', 'hearts'], ['7', 'diamonds'], ['Q', 'clubs'], ['10', 'hearts']];
    hand.forEach(([rank, suit], i) => {
      const card: Card = { id: 9000 + i, rank, suit, enhancement: i === 2 ? 'cristal' : i === 4 ? 'ardente' : undefined };
      const sp = new Sprite({ face: faceOf(card), back: backOf('player'), faceUp: false, parent: this.game.L.cards, size: 2 });
      sp.jump(1178, -120, 0);
      const m = i - 2;
      setTimeout(() => {
        sp.moveTo(640 + m * 150, 700 + m * m * 12, m * 8);
        setTimeout(() => void sp.flip(true, 220), 260);
      }, 120 + i * 90);
      sp.z = 5 + i;
      this.sprites.push(sp);
    });
  }
}
