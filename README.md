# Teamplaner (Arbeitstitel)

Selbstgebauter Ersatz für SpielerPlus – fokussiert auf das, was wir wirklich nutzen:
**Eltern melden ihre Kinder für Spiele und Trainings an oder ab.**

Status: Umsetzung begonnen (Stand 2026-10-31)

## Problem

- Eltern zum Zu-/Absagen zu bewegen ist mühsam – das ist **das** Kernproblem.
- Der Saisonplan steht zu Saisonbeginn fest, Eltern sollen dann einmal für die ganze Saison zusagen.
- SpielerPlus nervt: Werbung, seltsame Oberfläche, zu viele ungenutzte Funktionen,
  Trainer und Kinder gemischt in der Spielerliste, Upselling / Cross-Selling.

## Ziel (MVP in einem Satz)

Eltern öffnen **einen persönlichen Link**, sehen die ganze Saison ihres Kindes auf einer Seite,
tippen **„Bei allen dabei“** und nehmen nur die Ausnahmen raus – fertig in unter einer Minute.

## Rahmen

- 2 Teams: **Schüler** und **Jugend**, je max. ~16 Kinder
- Spiele **und** Trainings
- Nur **Dabei / Nicht dabei** – kein „Vielleicht“
- Ein Elternteil kann mehrere Kinder haben
- **Keine** Gebühren, **keine** Spielerstatistiken, **keine** App-Store-App (99 €/Jahr nur wenn zwingend nötig)
- **Eigene App auf Vercel** unter `team.bretten-kangaroos.net`, Optik wie die Homepage (Stack wie die Rezepte-App)
- **Anbindung an Claude ist Pflicht** – nur für Martin über Claude Code, so einfach wie möglich
- Datenbank: Postgres (Neon, Frankfurt); kein Chat (WhatsApp-Gruppe bleibt)

## Dokumente

| Datei                                            | Inhalt                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| [docs/features.md](docs/features.md)             | Rollen, Abläufe, MVP vs. später                                                      |
| [docs/data-model.md](docs/data-model.md)         | Datenmodell                                                                          |
| [docs/tech.md](docs/tech.md)                     | Technik: Vercel-Stack, Benachrichtigungen, Claude-Anbindung                          |
| [docs/design.md](docs/design.md)                 | Farben, Schriften, Bausteine, Liste der Mockup-Screens                               |
| [mockup/canvas/](mockup/canvas/)                 | Klickbares Mockup (Claude Design): https://claude.ai/artifact/XgvhWom64h8uwr7DSxjNDY |
| [docs/open-questions.md](docs/open-questions.md) | Offene Fragen                                                                        |

## Stand & nächste Schritte (2026-10-29)

- [x] Anforderungen, Datenmodell, Technik entschieden (Vercel, Neon, Astro mit Server-Rendering)
- [x] Klickbares Mockup in Claude Design
- [ ] Mockup mit den 3 anderen Trainern besprechen (Link im Canvas über „Share“ freigeben)
- [ ] Offene Punkte in [docs/open-questions.md](docs/open-questions.md) klären
- [x] Projekt aufgesetzt (Astro, Tailwind, Preact) + Eltern-Saisonansicht (Spiele, Trainings, „Bei allen dabei“) – lokal mit Testdaten
- [ ] Vercel-Projekt, Neon-Datenbank, Subdomain einrichten und erste Vorschau deployen
- [ ] Trainer-Ansicht + Admin-API für Claude

## Entwicklung

```bash
npm install
npm run db:reset   # lokale Datenbank (PGlite in .pglite/) mit Testdaten neu anlegen
npm run dev        # http://localhost:4321/f/dev-mueller (Familie mit 2 Kindern)
```

Ohne `DATABASE_URL` läuft die App gegen eine eingebettete Postgres-Datenbank (PGlite), es muss nichts
installiert werden. `db:reset` nicht parallel zu `npm run dev` ausführen (Datei-Sperre).
Prüfen: `npm test`, `npm run check`, `npm run lint`.

## Leitplanken

1. **Zusagen muss reibungslos sein.** Kein Passwort, kein Login, kein App-Download.
2. **Mobile first.** Am Handy, oft aus der WhatsApp-Gruppe heraus.
3. **Weniger ist mehr.** Keine Werbung, keine Funktion, die wir nicht nutzen.
4. **DSGVO ernst nehmen.** Daten von Minderjährigen – so wenig wie möglich speichern.
