---
name: sabot-da
description: Direction artistique de SABOT (roguelike de blackjack). À lire avant d'écrire ou de modifier quoi que ce soit de visible ou d'audible dans le jeu - écrans, cartes, couleurs, typographie, animations, sons, textes affichés. Donne la palette, les polices, la mise en scène, les règles de « juice » et la liste des tics de design générés par IA à éviter.
---

# SABOT — direction artistique

SABOT est un jeu, pas un site. Tout ce qui s'affiche doit pouvoir passer pour la capture d'écran
d'un jeu indé tournant sur une borne : une scène fixe, des objets qu'on manipule, zéro élément
qui rappelle une page web (pas de barre de navigation, pas de carte arrondie à ombre douce,
pas de scroll de page, pas de curseur texte, pas de sélection de texte).

## L'idée

Un tripot clandestin filmé par un vieux moniteur de surveillance. Arrière-salle, velours prune,
laiton terni, fumée, un tapis bleu pétrole usé. Le croupier tire, le joueur triche.

Le jeu appartient à la famille visuelle « pixel art + écran cathodique + cartes qui ont du poids »
popularisée par Balatro, mais il a sa propre identité : on ne reprend ni ses couleurs
(pas de tourbillon rouge/bleu, pas de Jetons bleus / Mult rouge), ni sa police, ni sa mise en page
à panneau latéral, ni ses illustrations, ni ses noms. Si un écran pouvait être confondu avec
une capture de Balatro, il est raté.

## Palette

Uniquement ces couleurs (plus leurs variantes assombries/éclaircies pour le relief en pixel art).
Elles vivent dans `src/ui/styles/tokens.css` en variables CSS ; ne jamais écrire un hex en dur ailleurs.

| Nom         | Hex       | Rôle |
|-------------|-----------|------|
| Nuit        | `#150c1a` | fond le plus sombre, contours de tous les objets |
| Prune       | `#3d1640` | panneaux, velours, fumée (ton froid) |
| Bordeaux    | `#7d1f3f` | fumée (ton chaud), zone de danger de la Jauge |
| Pétrole     | `#0f4a57` | tapis de la table |
| Pétrole clair | `#1c7a80` | reflets du tapis, lignes peintes |
| Ivoire      | `#f4ead4` | face des cartes, texte principal |
| Encre       | `#231a2e` | enseignes noires (♠ ♣), texte sur ivoire |
| Cerise      | `#d92b4b` | enseignes rouges (♥ ♦) |
| Menthe      | `#5ef0bf` | **Jetons** (le score additif) — toujours et seulement ça |
| Braise      | `#ff6a3d` | **Mult** — toujours et seulement ça |
| Laiton      | `#f0b63a` | **argent ($)**, cadres, titre |
| Cendre      | `#8d7f96` | texte secondaire, éléments désactivés |

Menthe, Braise et Laiton sont des couleurs de sens : on ne les utilise jamais en décoration.
Un joueur doit pouvoir lire un nombre à sa seule couleur.

Raretés des atouts (liseré du cadre) : commun = Cendre, peu commun = Menthe sombre `#2fa98a`,
rare = Cerise, légendaire = Laiton animé.

## Typographie

Deux familles, installées en local via @fontsource (aucune requête réseau) :

- **Jacquard 24** — gothique en pixels. Le titre du jeu, les noms des patrons, les annonces
  de figure (« Blackjack », « Crevé »). Toujours en bas de casse avec capitale initiale :
  une gothique tout en capitales est illisible. Jamais sous 28 px.
- **Jersey 20** — chiffres, boutons, compteurs, tout ce qui se lit d'un coup d'œil.
- **Jersey 15** — textes de règles dans les infobulles et descriptions (corps 18–22 px mini).

Rendu : `font-smooth: never; -webkit-font-smoothing: none; text-rendering: optimizeSpeed`.
Tailles en multiples entiers de la grille du design pour garder des pixels nets.
Le relief du texte se fait par une ombre dure décalée de 2 px en Nuit, jamais par un flou.

## La scène

Une scène de **1280 × 720** unités, mise à l'échelle d'un bloc pour remplir la fenêtre
(letterbox en Nuit autour). On positionne en absolu dans cette scène comme dans un moteur de jeu.
Rien ne se réorganise quand la fenêtre change : tout grossit ou rapetisse ensemble.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ plaque de table          MAIN DU CROUPIER              sabot du croupier │
│ (salon, objectif,        [▒▒][7♦]   total 7                              │
│  règle du patron)                                                        │
│                                                                          │
│ atouts   ◄──────────────── LA JAUGE ────────────────►        Jetons × Mult│
│ (colonne  0 ····· 12 ···· 17▲croupier ···· 20 █21█ crève      = score    │
│  gauche)                    ▼ toi : 14                        progression│
│                                                               de la table│
│                          TA MAIN                                         │
│ combines                 [9♠][5♥]            mains 3  défausses 2   $ 12 │
│ (2 emplacements)   [Tirer] [Rester] [Doubler] [Défausser]    ton sabot 40│
└──────────────────────────────────────────────────────────────────────────┘
```

Lecture verticale = l'affrontement : le croupier en haut, toi en bas, la Jauge entre les deux.

## L'élément signature : la Jauge

Toute l'audace visuelle du jeu va là. C'est une règle graduée en laiton posée en travers du tapis,
de 0 jusqu'à la limite, avec une zone Bordeaux « crève » au-delà.

- Ton total est une aiguille qui avance à chaque carte, avec élan et rebond.
- Le total visible du croupier est un second curseur, au-dessus de la règle ; son seuil
  d'arrêt (17) est un cran gravé.
- Quand un atout change la limite, **la règle s'allonge physiquement** (22, 23…) avec un bruit
  de cliquet ; quand un patron la réduit, elle se fait rogner. C'est ainsi que le joueur *voit*
  que les règles ont changé.
- Plus l'aiguille approche de la limite, plus elle tremble, et plus la fumée du fond se réchauffe.
- Dépasser : l'aiguille tape la butée, flash Bordeaux, secousse de l'écran.

Le reste de l'interface reste sobre pour que la Jauge porte le spectacle.

## Le fond et l'écran

- Fond : un shader WebGL de fumée (bruit déformé par domaine, lent), entre Prune et Bordeaux,
  calculé en basse résolution (~320×180) puis agrandi en `image-rendering: pixelated` pour
  avoir de gros pixels. Il réagit au jeu : plus chaud près de la limite, bouffée claire sur
  une victoire, tirant sur le Bordeaux à la table du patron.
- Écran cathodique en surcouche sur toute la scène : lignes de balayage légères, vignettage,
  très légère courbure et aberration chromatique sur les bords. Subtil : on doit l'oublier
  au bout de dix secondes.
- Réglages obligatoires : intensité de l'écran cathodique (0–100), mouvement du fond
  (oui/non), secousses (oui/non), vitesse du jeu (×1 ×2 ×4), volume. `prefers-reduced-motion`
  coupe par défaut le fond animé et les secousses.

## Les cartes

- Dessinées par le code (canvas ou SVG en grille de pixels), pas d'images externes.
  Format logique 60 × 84, affichées ×2 en `image-rendering: pixelated`.
- Face Ivoire, coins légèrement cassés (2 px), contour Nuit de 2 px, ombre portée dure
  (un aplat Nuit décalé de 4 px vers le bas, sans flou).
- Enseignes en deux couleurs seulement : Cerise et Encre. Rang en Jersey 20 dans le coin,
  grande enseigne au centre. Figures (V, D, R) : un grand monogramme gothique en Jacquard 24
  sur un motif tissé, pas de portrait.
- Dos : guillochis Prune et Laiton pour le joueur, Pétrole et Ivoire pour le croupier.
- Améliorations : traitement visible de loin (Plombée = barre de plomb en bas, Ardente =
  braises qui montent, Cristal = reflet qui balaie, Dorée = tranche Laiton, Marquée = coin
  corné, Fantôme = translucide, Élastique = bord ondulé, Arlequin = losanges quatre couleurs).
- Atouts, combines, faveurs, privilèges : même gabarit de carte, illustrés par un **emblème
  procédural** (`EmblemArt` : un glyphe géant + un motif + deux couleurs de la palette).
- Les cartes ont du poids : elles penchent dans le sens du déplacement, s'inclinent en 3D
  sous le curseur, se soulèvent au survol (ombre qui s'éloigne), et la main forme un léger
  éventail. Une carte ne se téléporte jamais : elle part toujours d'un sabot ou y retourne.

## Juice — le retour sensoriel

Chaque action du joueur reçoit une réponse visuelle ET sonore dans les 100 ms.

- **Marquage** : les cartes sautent une à une de gauche à droite ; un petit nombre jaillit
  (« +10 » en Menthe, « +4 » en Braise, « ×2 » en Braise sur fond plein) ; l'atout qui
  s'active se secoue. Le son de chaque étape monte d'un demi-ton : une longue cascade
  s'entend comme une gamme qui grimpe.
- Les compteurs Jetons et Mult défilent chiffre par chiffre, grossissent brièvement à chaque
  ajout, puis fusionnent en un seul nombre qui file vers la progression de la table.
- Défaite : le compteur Mult se brise et retombe à 1 (« la banque garde ton Mult »).
- Plus le score d'une main est gros par rapport à l'objectif, plus la mise en scène en fait :
  flammes de pixels sur le compteur au-delà de 50 % de l'objectif en une main.
- Secousse d'écran courte (≤ 250 ms) réservée à : crever, croupier qui crève, gros score.
- Courbes : jamais de `linear` ni de `ease` par défaut. Ressorts avec dépassement pour ce qui
  arrive, `cubic-bezier(.2,.9,.3,1.2)` en repli, sorties rapides sans rebond.
- Hors action du joueur, l'écran est calme : fumée lente, cartes qui respirent à peine.
  Aucune animation décorative en boucle qui attire l'œil.

## Son

Tout est synthétisé avec WebAudio (aucun fichier). Carte = souffle de bruit filtré court ;
jeton = clic boisé accordé ; cliquet de la Jauge ; coup sourd pour « crevé » ; arpège pour une
table gagnée. Le contexte audio démarre au premier clic. Un volume général, coupable.

## Les mots

Interface en français, tutoiement, phrases courtes, ton de tripot pince-sans-rire.
Un bouton dit ce qu'il fait : « Tirer », « Rester », « Doubler », « Défausser », « Encaisser »,
« Quitter la boutique ». Vocabulaire fixe, à ne jamais varier :

| Mot | Sens |
|-----|------|
| Crever | dépasser la limite |
| Jetons × Mult | le score d'une main |
| Figure | le type de main (Blackjack, Pile, Charlie…) |
| Atout | bonus permanent (5 emplacements) |
| Combine | carte de tricheur à usage unique |
| Faveur | monte une figure de niveau |
| Privilège | amélioration définitive de la partie |
| Salon / Table / Patron | étage / manche / boss |
| Sabot | ta pioche |

Textes de règles : nombres colorés selon leur sens (Menthe, Braise, Laiton), le reste en Ivoire.
Une infobulle tient en trois lignes.

## À ne pas faire

- Rien qui ressemble à un composant web : bords arrondis uniformes, ombres floues
  `rgba(0,0,0,.1)`, dégradés décoratifs, flou d'arrière-plan façon verre dépoli, fenêtres
  modales centrées sur fond gris, icônes en trait fin, emoji.
- Pas de police système, pas de monospace pour « faire technique », pas d'étiquettes en
  petites capitales espacées au-dessus des blocs.
- Pas de fond noir avec un seul accent fluo, pas de crème + terracotta.
- Pas de tapis vert casino ni de rouge/noir roulette : c'est le cliché du genre.
- Pas de flou, pas d'anticrénelage : tout est net, à la grille, avec contour Nuit.
- Pas de fondu + glissement vers le haut sur chaque élément : un objet arrive d'un endroit
  qui a un sens (le sabot, la boutique, hors de l'écran) ou ne bouge pas.
- Pas de texte d'aide verbeux à l'écran : la règle se découvre au survol.

## Avant de dire « c'est fini »

1. Capture d'écran en 1280×720 et en 1920×1080 : est-ce qu'on dirait un jeu ? Un site ?
2. Plisse les yeux : la Jauge est-elle l'élément le plus fort ? Les trois couleurs de sens
   sont-elles les seules taches vives ?
3. Coupe le son, joue une main : comprend-on tout ? Remets le son, ferme les yeux : aussi ?
4. Retire un ornement.
