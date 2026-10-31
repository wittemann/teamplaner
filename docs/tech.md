# Technik

**Entschieden (2026-10-29): eigene App auf Vercel – wie die Rezepte-App –, nicht in die Homepage eingebaut.**

Der Teamplaner ist fast nur dynamisch (Links pro Familie, Antworten, Erinnerungen, Push). Das passt
besser zu einer App mit Server-Rendering als zur statischen Homepage. Der frühere PHP-Plan auf IONOS
steht unten unter „Verworfen“.

## Stack

| Teil          | Wahl                                                                                         | Bemerkung                                                          |
| ------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Framework     | **Astro mit Server-Rendering** (`@astrojs/vercel`), Preact-Inseln                            | wie `rezepte`                                                      |
| Sprache       | TypeScript überall, Eingaben mit `zod` prüfen                                                |                                                                    |
| Hosting       | **Vercel**, Region **Frankfurt (`fra1`)**                                                    | Hobby-Plan, siehe „Vercel-Plan“                                    |
| Datenbank     | **Postgres bei Neon** über den Vercel Marketplace, Region Frankfurt                          | kostenloser Plan reicht weit (Daten pro Saison: wenige hundert KB) |
| Adresse       | **`team.bretten-kangaroos.net`** (Subdomain, DNS-Eintrag bei IONOS → Vercel)                 |                                                                    |
| Optik         | Farben, Schriften, Wappen aus der Homepage übernehmen (`src/config/theme.json`, `crest.png`) | Tailwind wie auf der Homepage                                      |
| Mail          | **IONOS-SMTP** per `nodemailer` (Absender `@bretten-kangaroos.net`)                          | kein neues Konto; Alternative: Resend                              |
| Push          | `web-push` (Node), VAPID-Schlüssel als Vercel-Umgebungsvariablen                             |                                                                    |
| Zeitgesteuert | **Vercel Cron** (Hobby: 1× täglich)                                                          | reicht für Erinnerungen                                            |
| Spielplan     | Claude legt die Spiele einmal pro Saison aus dem BSM an (siehe unten)                        | kein BSM-Code in der App                                           |
| Qualität      | Vitest, Playwright, ESLint, Prettier, CI bei jedem Push; Sentry                              | wie `rezepte`                                                      |
| Vorschau      | Jede Änderung bekommt einen eigenen Vorschau-Link                                            | ideal, um neue Funktionen mit den Trainern abzustimmen             |

## Vercel-Plan

- Laut Vercels Fair-Use-Richtlinien ist **kommerziell** = finanzieller Gewinn für irgendwen
  (Zahlungen, Werbung, Verkauf, bezahlte Entwicklung). Trifft nicht zu: keine Gebühren, keine
  Werbung, ehrenamtlich.
- Grauzone: Hobby ist „non-commercial **personal** use“, ein Vereinswerkzeug ist nicht rein privat.
  → **Keine Sponsorenlogos oder Werbung** auf den Teamplaner-Seiten.
  → Optional kurze Nachfrage beim Vercel-Support für eine schriftliche Bestätigung.
- Rückfall: Pro-Plan (ca. 20 $/Monat).
- Hobby-Grenzen (1 Mio. Aufrufe, 4 h CPU pro Monat) werden bei weitem nicht erreicht.

## Anbindung an Claude (Pflicht)

Ziel: Claude kann alles, was ein Trainer kann – z. B.

- „Leg die Saison für Schüler aus dem BSM an, Trainings Di/Do 17:30, Ferien ausgenommen.“
- „Wer hat für Samstag noch nicht zugesagt? Schreib mir eine Erinnerung für WhatsApp.“
- „Haben wir für alle Spiele im Mai mindestens 9 Kinder?“
- „Das Spiel am 17.5. wurde auf 14 Uhr verlegt – passe es an und informiere die Familien.“

**Entscheidung (2026-10-29): so einfach wie möglich, nur für Martin, kein MCP-Server.**

- Die App hat ohnehin API-Endpunkte für die Trainer-Oberfläche. Dazu kommt **ein Admin-Token**
  (liegt lokal, z. B. in `.env`), mit dem dieselben Endpunkte ohne Login nutzbar sind.
- Claude Code ruft sie per `curl` auf. Eine **Skill** im Projekt (wie `baseball-besprechung`)
  beschreibt die Endpunkte und typischen Abläufe (Saisonstart, wöchentlicher Check, WhatsApp-Text).
- Kein MCP, kein Connector, keine Anthropic-API – nichts Zusätzliches zu betreiben.
- Später ausbaubar zu einem MCP-Server (in Node einfach), falls andere Trainer das auch wollen.

## Benachrichtigungen

**Entschieden (2026-10-29): E-Mail + Web Push + „In WhatsApp teilen“.**

| Anlass                                          | An                                                                                  | Kanal            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------- |
| Saison freigeschaltet / Erinnerung „noch offen“ | offene Familien                                                                     | Push, sonst Mail |
| Hinweis am Termin („Treffpunkt geändert“)       | sichtbar für alle Familien des Teams; **Push** an Familien, deren Kind zugesagt hat | Push             |
| Änderung nach Stichtag                          | Trainer                                                                             | Push, sonst Mail |

Keine Spieltag-Erinnerung („Stimmt noch?“) – nicht gewünscht.

Web Push – was es braucht:

- **Service Worker + Web-App-Manifest** (`public/`).
- **iPhone:** Push geht nur, wenn die Seite über „Zum Home-Bildschirm“ installiert ist (iOS 16.4+).
- **Erkennen, ob installiert:** `matchMedia('(display-mode: standalone)')` bzw. `navigator.standalone`
  auf iOS. Die Eltern-Seite zeigt **dauerhaft** „Zum Home-Bildschirm hinzufügen“, solange sie im
  normalen Browser geöffnet ist, danach „Benachrichtigungen aktivieren“, solange keine Freigabe besteht.
  Der Trainer sieht, welche Familien **kein** Gerät für Push angemeldet haben.
- **Senden:** Node-Bibliothek `web-push`, VAPID-Schlüssel einmal erzeugen.
- Jedes Gerät meldet sich einzeln an (mehrere pro Elternteil möglich).
- Hinweise am Termin und späte Änderungen werden **sofort** beim Speichern verschickt (kein Cron nötig).

## Direkt aus der Mail antworten

- Jeder Knopf in der Mail ist ein Link mit eigenem Einmal-Token pro Kind + Spiel + Antwort.
- **Achtung Mail-Scanner:** Viele Mailprogramme und Virenscanner öffnen Links vorab. Ein Link darf
  deshalb nicht schon beim Aufruf (GET) speichern. Lösung: Die Seite schickt die Antwort per
  JavaScript ab (POST; Scanner führen meist kein JS aus), mit sichtbarem „Bestätigen“-Knopf als Rückfall.
- Danach „Danke – Ella ist am Sa 17.04. dabei“ + Link zur Saisonansicht.

## Automatische Erinnerungen

- Vercel Cron, täglich (z. B. 17 Uhr deutscher Zeit; Hobby-Crons laufen nur ungefähr pünktlich).
- Plan: 3 Tage nach dem Saison-Link, 7 Tage und 1 Tag vor dem Stichtag. Nur an Familien mit offenen
  Spielen, per Push, sonst Mail. Keine Reaktion → nächste Erinnerung (auch) an den anderen Elternteil.
- Cron-Endpunkt mit `CRON_SECRET` absichern.

## Spielplan aus dem BSM

BSM (Baseball Softball Manager) = System des Verbands, in dem alle Ligaspiele stehen. Die Homepage
liest es schon für `/spielplan` (Details: `bretten-kangaroos.net/docs/bsm-api.md`).

**Entschieden (2026-10-29): kein eingebauter Import, Claude macht das einmal pro Saison.**
Die App bekommt keinen BSM-Code, keinen Knopf und keinen täglichen Abgleich.

Ablauf zu Saisonbeginn, in Claude Code („Leg die Schüler-Saison aus dem BSM an“):

1. Claude sucht die Liga-IDs der Saison (bekommen jedes Jahr neue IDs; 2026 z. B. Schüler
   Landesliga `6358`, Jugend Verbandsliga `6353`) – Vorgehen wie in `bretten-kangaroos.net/docs/bsm-api.md`.
2. Claude holt `matches.json?filter[leagues][]=<ID>&compact=true` (kein API-Schlüssel nötig), nimmt die
   Spiele mit Verein `398` (Bretten) und zeigt dir die Liste zur Kontrolle.
3. Nach deinem OK legt Claude die Termine über die Admin-API an: Datum, Uhrzeit, Gegner, Heim/Auswärts,
   Platz, dazu Treffpunkt (Vorschlag 90 Min. vor Spielbeginn) und Stichtag (Vorschlag Do 20 Uhr davor).
   Die BSM-Spiel-ID wird mitgespeichert (`bsm_match_id`), damit spätere Vergleiche einfach sind.
4. Turniere ohne BSM-Eintrag: von Hand in der App oder Claude sagen.

Während der Saison:

- **Verlegtes Spiel:** Trainer ändert den Termin in der App (Familien mit Zusage bekommen
  „Spiel verlegt – passt es noch?“), oder du sagst Claude „Prüf das BSM auf Änderungen“ – Claude
  vergleicht anhand der `bsm_match_id` und schlägt Änderungen vor.
- Später ausbaubar zu einem automatischen Abgleich, falls Verlegungen oft vergessen werden.

## Schulferien

- Ferien Baden-Württemberg einmal pro Schuljahr als JSON im Repo pflegen (amtlicher Ferienkalender
  des Kultusministeriums). Keine externe API nötig.

## WhatsApp

**Entschieden (2026-10-29): nur ein Teilen-Knopf, keine direkte Anbindung.**

- Knopf „In WhatsApp teilen“ = Link `https://wa.me/?text=<Text URL-kodiert>` (auf dem Handy alternativ
  die Web-Share-API `navigator.share`). Öffnet WhatsApp mit fertigem Text, Trainer wählt die Gruppe
  und tippt Senden. Kostenlos, kein Konto, nichts zu betreiben.
- Ein Link kann nicht direkt in eine bestimmte Gruppe posten – die Gruppe wählt man in WhatsApp.
- **Persönlicher Anstoß** an eine einzelne Familie: `https://wa.me/<Telefonnummer>?text=…` öffnet den Chat
  mit diesem Elternteil. Braucht die Telefonnummer → nur freiwillig mit Einwilligung speichern (DSGVO).
- Verworfen:
  - **WhatsApp Business Platform (Meta):** Business-Verifizierung, eigene Nummer, Vorlagen-Freigabe,
    Kosten pro Nachricht, für Einzelnachrichten gedacht, DSGVO-Aufwand für Telefonnummern – zu viel für 2 Teams.
  - **Inoffizielle Bibliotheken**, die ein privates Konto fernsteuern: verstoßen gegen die
    WhatsApp-Nutzungsbedingungen, Nummer kann gesperrt werden.

## Auth

- **Eltern:** persönlicher Link `team.bretten-kangaroos.net/f/<token>` mit langem Zufallstoken.
  Beim ersten Aufruf setzt der Server ein Cookie (httpOnly) und leitet auf `/` weiter – das Token
  steht danach nicht mehr in der Adresszeile. Token rotierbar, falls ein Link weitergegeben wurde.
- **Trainer:** Magic-Link per Mail → Sitzung im Cookie. 4 Trainer (Martin + 3), je einem oder beiden Teams zugeordnet.
- **Claude:** ein Admin-Token (nur Martin) im `Authorization`-Header, auf dem Server nur gehasht gespeichert.

## Datenschutz (DSGVO)

- Nur Vorname + Initial des Kindes, Jahrgang
- Vercel und Neon: Region Frankfurt; beide US-Firmen → Auftragsverarbeitungsvertrag (DPA) beider
  Anbieter akzeptieren und im Verein ablegen
- Einwilligung beim ersten Aufruf des Eltern-Links
- Löschung nach Saisonende / Austritt
- Seiten `noindex`; Tokens nie in Sentry oder Logs: URLs und Header in Sentry filtern
  (`beforeSend`), Tokens nicht loggen

## Verworfen: in die Homepage einbauen (PHP auf IONOS)

Geprüft am 2026-10-29: hätte funktioniert – die Homepage hat mit `signup.php`, `private/` und
PHPMailer schon das Muster (statisches Astro + PHP-API + IONOS-MySQL + IONOS-Cron, Token im URL-Fragment).
Vorteile: keine Kosten, keine neuen Dienste, Daten nur bei IONOS.
Dagegen entschieden, weil der Teamplaner fast nur dynamisch ist: zwei Sprachen (TypeScript + PHP),
kein Server-Rendering, keine Vorschau-Links, weniger Tests, Web Push in PHP unsicher (Erweiterungen
auf IONOS nicht änderbar), und die Homepage-Deploys löschen alles, was nicht im Build ist.
