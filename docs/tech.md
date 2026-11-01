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
| Mail          | **IONOS-SMTP** per `nodemailer` (Absender `@bretten-kangaroos.net`)                          | `SMTP_*`-Variablen; ohne `SMTP_HOST` lokal nur in die Konsole      |
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

| Anlass                                          | An                                                                                  | Kanal                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------- |
| Saison freigeschaltet / Erinnerung „noch offen“ | offene Familien                                                                     | Push, sonst Mail                             |
| Hinweis am Termin („Treffpunkt geändert“)       | sichtbar für alle Familien des Teams; **Push** an Familien, deren Kind zugesagt hat | Push                                         |
| Änderung nach Stichtag                          | Trainer                                                                             | Push, sonst Mail                             |
| Termin abgesagt / Absage zurückgenommen         | Familien, deren Kind dabei ist (Training: nicht abgemeldet)                         | Push                                         |
| Termin verlegt (Tag, Zeit, Treffpunkt, Ort)     | Familien, deren Kind dabei ist                                                      | Push; Spiele: sonst Mail mit Antwort-Knöpfen |

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

Umsetzung (2026-10-31):

- `public/sw.js` zeigt die Nachricht und öffnet beim Antippen die Seite (kein Offline-Cache).
- `/manifest.webmanifest` (Trainer: `?bereich=trainer`) wird pro Person erzeugt: Startadresse ist
  der persönliche Link aus dem Cookie, weil eine installierte App auf dem iPhone die Cookies des
  Browsers nicht sicher mitbekommt. Deshalb `crossorigin="use-credentials"` und `no-store`.
- `components/PushSetup.tsx`: iPhone im Browser → Anleitung „Zum Home-Bildschirm“; sonst Knopf
  „Einschalten“, bis das Gerät angemeldet ist; danach eine leise Zeile mit „Ausschalten“.
  Anmelden über `POST /api/push` (für die Familie oder den Trainer des Cookies).
- Hinweis am Termin: nur wenn neu oder geändert, an Familien mit Zusage (Training: nicht abgemeldet).
  Keine Mail – der Hinweis steht auf der Seite; der Trainer sieht, wie viele ihn nicht bekommen.
- Späte Änderung: Push an den Trainer; Mail nur, wenn kein Gerät sie bekommen hat.
- Absage / zurückgenommene Absage im Trainerbereich: Push an die Familien, die dabei sind. Verlegung:
  ebenso; bei Spielen bekommt jeder Elternteil mit Zusage, den kein Push erreicht hat, die Mail
  „passt es noch?“. Änderungen über die Admin-API benachrichtigen niemanden.
- Erinnerungen „noch offen“ gehen weiterhin nur per Mail (mit Antwort-Knöpfen).
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (Vercel); ohne sie bietet die Seite keine
  Benachrichtigungen an und alles geht per Mail. Schlüssel nie wechseln – sonst müssen sich alle
  Geräte neu anmelden.

## Späte Änderungen an Trainer

- Jede Stelle, an der Eltern speichern (Antippen, „Bei allen dabei“, Abwesenheit eintragen/löschen,
  Knopf in der Mail), merkt sich vorher und nachher die Antworten zu Spielen, deren Stichtag vorbei ist
  und die noch nicht begonnen haben (`lib/late-change.ts`). Was sich dort geändert hat, geht sofort per
  Mail an die Trainer des Teams – eine Mail pro Trainer und Speichern, mit neuer Teamzahl und Link zum
  Termin. Team ohne eigenen Trainer → an die Admins.
- Eine fehlgeschlagene Mail blockiert die Antwort der Eltern nie (nur Fehlercode im Log).
- Änderungen durch Claude (Admin-API) und durch Trainer lösen keine Mail aus.

## Direkt aus der Mail antworten

- Jeder Knopf in der Mail ist ein Link mit eigenem Einmal-Token pro Kind + Spiel + Antwort.
- **Achtung Mail-Scanner:** Viele Mailprogramme und Virenscanner öffnen Links vorab. Ein Link darf
  deshalb nicht schon beim Aufruf (GET) speichern. Lösung: Die Seite schickt die Antwort per
  JavaScript ab (POST; Scanner führen meist kein JS aus), mit sichtbarem „Bestätigen“-Knopf als Rückfall.
- Danach „Danke – Ella ist am Sa 17.04. dabei“ + Link zur Saisonansicht.

## Automatische Erinnerungen

- Vercel Cron, täglich 15 Uhr UTC (16/17 Uhr deutscher Zeit; Hobby-Crons laufen nur ungefähr pünktlich):
  `/api/cron/reminders`, abgesichert mit `CRON_SECRET` – **ohne die Variable verschickt der Cron nichts**.
- Plan: 7 Tage und 1 Tag vor dem Stichtag (ohne Stichtag: vor dem Spieltag) – für Kinder mit einem offenen
  Spiel, das dann fällig ist. Die Mail listet alle offenen Spiele des Kindes.
- Spät angelegte Spiele (Stichtag in weniger als 7 Tagen): Die erste Erinnerung kommt beim nächsten Cron-Lauf,
  sofern es zu dem Spiel in den letzten 7 Tagen vor dem Stichtag noch keine gab (auch ein ausgefallener
  Cron-Tag wird so nachgeholt). Danach wie gewohnt 1 Tag vorher.
- „3 Tage nach dem Saison-Link“ gibt es nicht automatisch (die App weiß nicht, wann die Links verschickt
  wurden): Claude schickt sie über die Admin-API (`POST /reminders`, Modus `all` = alle mit offenen Spielen).
- Erste Erinnerung zu einem Kind an einen Elternteil, jede weitere an alle Eltern des Kindes. Höchstens
  eine Erinnerung pro Elternteil und Tag. Protokoll in `reminder_mail`.
- Nur Mail, auch wenn die Familie Benachrichtigungen hat (die Mail hat die Antwort-Knöpfe).
- Antwort-Knöpfe: `/antwort/<token>`, signiert (HMAC mit `LINK_KEY` über Eltern, Kind, Spiel, Antwort und
  den aktuellen persönlichen Link) statt gespeichert – ein erneuerter Link macht alte Knöpfe ungültig.

## Backup

Neons kostenloser Plan hat keine automatischen Backups und stellt nur 6 Stunden zurück wieder her.

- `npm run db:backup:neon` schreibt alle Daten als JSON nach `backups/neon-<Zeitpunkt>.json` (nicht im Repo)
  und behält die neuesten 8. Auch von Hand, z. B. vor einer größeren Änderung.
- Wöchentlich läuft das als geplante Aufgabe in der Claude-App auf Martins Mac („Teamplaner-Backup“, sonntags
  abends). Ist der Mac aus oder die App zu, läuft sie beim nächsten Start. Bewusst nicht als Vercel Cron mit
  Mail: so liegen die Daten nur auf dem Mac (und in dessen Backup), nicht in einem Postfach.
- Wiederherstellen nur in eine **leere** Datenbank (in Neon einen neuen Branch oder eine neue Datenbank
  anlegen, `DATABASE_URL` in `.env.neon` darauf zeigen lassen): `npm run db:restore:neon -- <datei.json>`.
  Das Skript wendet die Migrationen an und bricht ab, wenn die Datei zu einem anderen Schema-Stand gehört
  (dann den passenden Git-Stand auschecken). Alles in einer Transaktion. Danach `DATABASE_URL` bei Vercel
  auf die neue Datenbank umstellen.
- Die Datei enthält personenbezogene Daten (Namen, Mail-Adressen, Zusagen) – nur bei Martin, nicht weitergeben.

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
- **„Link verloren?“** (`/link`, entschieden 2026-10-31): schickt **denselben** Link noch einmal, damit
  andere Geräte und das Kalender-Abo weiterlaufen. Dafür liegt der Link zusätzlich verschlüsselt in der
  Datenbank (AES-256-GCM, Schlüssel `LINK_KEY` nur in Vercel) – ein Datenbank-Leck allein verrät keine Links.
  Links von vor dieser Änderung werden beim nächsten Öffnen verschlüsselt abgelegt; ist keiner lesbar,
  gibt es einen neuen Link. Höchstens eine Mail pro Person in 10 Minuten; die Seite antwortet immer
  gleich, egal ob die Adresse bekannt ist. Gilt auch für Trainer.
- **Trainer:** vorerst wie die Eltern ein persönlicher Link `/t/<token>` (Claude legt ihn per Admin-API an) → Cookie. Magic-Link per Mail folgt mit dem Mailversand. 4 Trainer (Martin + 3), je einem oder beiden Teams zugeordnet; Admins sehen alle Teams.
- **Claude:** ein Admin-Token (nur Martin) im `Authorization`-Header, auf dem Server nur gehasht gespeichert (`ADMIN_TOKEN_HASH`). Endpunkte und Abläufe: Skill `.claude/skills/teamplaner-admin/SKILL.md`.

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
