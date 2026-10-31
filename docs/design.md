# Design

Optik wie die Homepage bretten-kangaroos.net (Quelle: `bretten-kangaroos.net/src/config/theme.json`,
`src/styles/*.css`). Mockup: https://claude.ai/artifact/XgvhWom64h8uwr7DSxjNDY
(Quelldateien in [../mockup/canvas/project/](../mockup/canvas/project/)).

## Farben

| Name                | Hex                   | Verwendung                                        |
| ------------------- | --------------------- | ------------------------------------------------- |
| forest              | `#23461E`             | Kopfzeile, ausgewählte Pills, Schritt-Nummern     |
| jersey / primary    | `#1E7B3C`             | Links, „Dabei“, Fortschrittsbalken, Rahmen-Knöpfe |
| leaf                | `#80B058`             | Akzent auf dunklem Grund                          |
| rust                | `#A3500F`             | Hauptknöpfe, Labels, „Nicht dabei“, „Noch offen“  |
| rust-dark           | `#8A3A0A`             | Hover der Hauptknöpfe, ✗ in der Matrix            |
| chalk               | `#F7F6F1`             | Titelband, Infokästen                             |
| ink                 | `#1D231B`             | Überschriften, starke Schrift                     |
| line                | `#E3E3DE`             | Rahmen, Trennlinien                               |
| text / text-light   | `#4A4A4A` / `#6B6F68` | Fließtext / Nebentext                             |
| Erfolg-Hintergrund  | `#EEF4E8`             | Bestätigungen („Gespeichert“)                     |
| Hinweis-Hintergrund | `#FFF4E5`             | Hinweis vom Trainer                               |

## Schrift

- **Barlow** 400/500/600 – Fließtext, 17 px Basis
- **Barlow Condensed** 600/700, GROSSBUCHSTABEN – Überschriften, Labels, Knöpfe
- Größen: Titel 56/40 px (Handy 36 px), Abschnitt 32 px (Handy 26 px), Label 15 px mit weiter Laufweite

## Bausteine

- **Kopfzeile:** forest, Wappen im weißen Kreis, „Bretten Kangaroos“ in Barlow Condensed
- **Titelband:** chalk, rost-farbenes Label, große Überschrift, Pills darunter (Kind / Team)
- **Hauptknopf:** rust, weiß, Barlow Condensed, mind. 48–52 px hoch, Radius 4 px
- **Rahmenknopf:** 2 px jersey-Rahmen, weißer Grund
- **Pill:** rund, 2 px Rahmen `#C9C9C2`, ausgewählt = forest gefüllt
- **Dabei / Nicht dabei:** zwei gleich breite Knöpfe; ausgewählt = jersey bzw. rust gefüllt
- **Offenes Spiel:** Karte mit 2 px rust-Rahmen + „Noch offen – bitte zu- oder absagen“
- **Teamzahl:** rust „Noch 2 Zusagen bis 9 Spieler“ / jersey „13 dabei – genug Spieler“
- Touch-Ziele mindestens 44 px, keine Emojis, Symbole als Linien-SVG

## Screens im Mockup

| Datei                        | Screen                                                                     |
| ---------------------------- | -------------------------------------------------------------------------- |
| `Main.dc.html`               | Eltern · Saisonübersicht (Spiele, Ferienfrage, Home-Bildschirm-Hinweis)    |
| `Eltern-Abwesenheit.dc.html` | Eltern · Abwesenheit (mit Schulferien-Schnellauswahl)                      |
| `Eltern-Training.dc.html`    | Eltern · Trainings (nur abmelden)                                          |
| `Eltern-Hinweise.dc.html`    | Eltern · Home-Bildschirm + Push aktivieren                                 |
| `Eltern-Mail.dc.html`        | Eltern · Erinnerungs-Mail mit Antwort-Knöpfen                              |
| `Eltern-Link.dc.html`        | Eltern · Link verloren                                                     |
| `Trainer-Uebersicht.dc.html` | Trainer · Übersicht (Matrix, Erinnerungsplan, ohne Push, späte Änderungen) |
| `Trainer-Termin.dc.html`     | Trainer · Termin (Listen, Hinweis, WhatsApp, persönlicher Anstoß)          |
