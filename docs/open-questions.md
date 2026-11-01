# Offene Fragen

## Geklärt (2026-10-29)

- 2 Teams (Schüler, Jugend), je max. ~16 Kinder
- Spiele + Trainings
- Nur dabei / nicht dabei
- Saisonplan steht zu Saisonbeginn, Zusage für die ganze Saison
- Keine Gebühren, keine Statistiken, kein App Store (außer zwingend)
- Kein Next.js; **eigene App auf Vercel** (Astro mit Server-Rendering, wie die Rezepte-App), Optik wie die Homepage, unter `team.bretten-kangaroos.net`
- Claude-Anbindung ist Pflicht – nur für Martin, einfach gehalten (Admin-Token + Skill, kein MCP)
- Spiele ohne Antwort = **offen**, Eltern müssen ausdrücklich zusagen
- Trainings: Standard **dabei**, Eltern melden nur ab
- Benachrichtigungen: E-Mail + WhatsApp-Text + **Web Push** (Erinnerung „offen“, Hinweis am Termin, späte Änderung an Trainer; keine Spieltag-Erinnerung)
- 4 Trainer (Martin + 3)
- Änderungen nach dem Stichtag erlaubt (Trainer wird benachrichtigt)
- Datenbank: Postgres bei Neon (Vercel Marketplace, Frankfurt)
- Kein Chat; stattdessen Hinweis am Termin + Knopf „In WhatsApp teilen“
- WhatsApp: keine direkte Anbindung (siehe [tech.md](tech.md)), nur Teilen-Knopf

## Chat – ersetzt das die WhatsApp-Gruppe?

**Entschieden: kein Chat.** Gründe:

- Eltern sind in WhatsApp sowieso – ein zweiter Kanal wird nicht gelesen.
- Chat bedeutet Moderation, Benachrichtigungen, Datenschutz für Nachrichten – viel Aufwand, wenig Nutzen.
- Das Problem ist nicht Kommunikation, sondern verlässliche Zu-/Absagen.

Was es stattdessen geben könnte:

- **Hinweis pro Termin** vom Trainer („Treffpunkt geändert“, „Trikot weiß“) – steht beim Termin, optional als Mail
- **Fertiger WhatsApp-Text** mit Link, per Knopf „In WhatsApp teilen“
- Ein Chat würde WhatsApp nur ersetzen, wenn ihr WhatsApp loswerden _wollt_ (z. B. Datenschutz) – dann eher über eine eigene Lösung nachdenken als hier eine einzubauen.

## Noch offen

- [ ] **Vercel-Support** fragen, ob der Hobby-Plan für ein ehrenamtliches Vereinswerkzeug ohne Werbung/Zahlungen in Ordnung ist (optional)
- [x] **Subdomain** `team.bretten-kangaroos.net` zeigt auf Vercel (A-Record `216.198.79.1`, kein CNAME wegen der Mail-Einträge auf `team`)
- [x] **Neon** Grenzen des kostenlosen Plans geprüft (2026-11-01): 1 GB Speicher, 100 CU-Stunden und 5 GB Datentransfer pro Monat, Pause nach 5 Minuten ohne Zugriff. Reicht für ~20 Kinder weit. Über der Grenze pausiert die Datenbank bis zum Monatsende, Daten bleiben. Keine automatischen Backups, Wiederherstellung nur 6 Stunden zurück – deshalb eigenes wöchentliches Backup ([tech.md](tech.md), „Backup“).
- [ ] **DPA** von Vercel und Neon im Verein ablegen
- [ ] **Trainer:** Welcher der 3 weiteren Trainer betreut welches Team?
- [ ] **Vorstand:** Zustimmung zum Datenschutz nötig?
- [x] **Migration:** kein Export – Martin legt die ~20 Kinder und Familien von Hand an (2026-11-01)
- [x] **Testphase:** keine – Umstieg für beide Teams auf einmal, sobald die Trainer zugestimmt haben (2026-11-01)
