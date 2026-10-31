# Features & Abläufe

## Rollen

| Rolle          | Wer                           | Darf                                                  |
| -------------- | ----------------------------- | ----------------------------------------------------- |
| **Admin**      | Vorstand / Abteilungsleitung  | Teams, Trainer, Saison anlegen                        |
| **Trainer**    | Coach von Schüler oder Jugend | Termine pflegen, Zusagen sehen, Erinnerungen schicken |
| **Elternteil** | Erziehungsberechtigte         | Eigene Kinder an-/abmelden                            |

Trainer sind **keine** Spieler und tauchen nie in der Spielerliste auf (Ärgernis bei SpielerPlus).
Ein Kind kann mehrere Elternteile haben, ein Elternteil mehrere Kinder (auch in beiden Teams).

## Wie wird Zusagen einfacher? (Kernproblem)

| Idee                                                                                                                                                                                                               | Wirkung                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| **Persönlicher Link pro Familie**, einmal verschickt, läuft nicht ab                                                                                                                                               | Kein Login, kein Passwort, kein „Wie war nochmal …?“               |
| **Saisonansicht auf einer Seite**: alle Termine untereinander, je ein großer Schalter pro Kind                                                                                                                     | Eine Seite statt 20 einzelne Termine                               |
| **„Bei allen dabei“-Knopf**, danach nur Ausnahmen antippen                                                                                                                                                         | Typischer Aufwand: 1 Tipp + 2–3 Ausnahmen                          |
| **Ferien/Urlaub eintragen** („Wir sind vom 1.–14.8. weg“) → setzt alle Termine im Zeitraum auf „Nicht dabei“                                                                                                       | Ausnahmen in einem Schritt                                         |
| **Fortschrittsanzeige** für Trainer: „12 von 16 Familien haben die Saison bestätigt“                                                                                                                               | Trainer weiß, wen er anschreiben muss                              |
| **Gezielte Erinnerung nur an die Offenen** (Mail und/oder fertiger WhatsApp-Text mit Link)                                                                                                                         | Kein Spam für die, die schon fertig sind                           |
| **Direkt aus der Mail antworten**: unter jedem offenen Spiel zwei Knöpfe „Dabei“ / „Nicht dabei“                                                                                                                   | Antworten ohne die Seite zu öffnen                                 |
| **Automatische Erinnerungen**: 3 Tage nach dem Saison-Link, 7 Tage und 1 Tag vor dem Stichtag; stoppt, sobald alles beantwortet ist; reagiert ein Elternteil nicht, geht die nächste an den **anderen Elternteil** | Kein Trainer muss hinterhertelefonieren                            |
| **Teamzahl + Stichtag bei jedem Spiel**: „Noch 2 Zusagen bis 9 Spieler“, „Antwort bis Do 20 Uhr“ (nur Zahlen, keine Namen)                                                                                         | „Das Team braucht uns“ wirkt besser als eine allgemeine Erinnerung |
| **Schulferien Baden-Württemberg**: „Seid ihr in den Pfingstferien weg?“ → mit einem Tipp für die ganzen Ferien abmelden                                                                                            | Die häufigste Ausnahme in einem Schritt                            |
| **„Link verloren?“** im Teamplaner (verlinkt von der Homepage): E-Mail eingeben → neuer Link kommt sofort                                                                                                          | Keine Nachfrage beim Trainer nötig                                 |
| **Persönlicher Anstoß vom Trainer**: Knopf bei jeder offenen Familie öffnet einen WhatsApp-Chat mit fertigem Text                                                                                                  | Persönlich wirkt am stärksten – für die letzten Offenen            |

### Training: Standard „dabei“, nur abmelden

**Entschieden:** Bei Trainings gelten Kinder als **dabei**, Eltern melden nur **ab**.
Für Spiele dagegen **ausdrückliche** Zusage zu Saisonbeginn (keine Antwort = offen).

## Abläufe

**Saisonstart**

1. Martin lässt Claude die Spiele einmal aus dem BSM anlegen (siehe [tech.md](tech.md)); Trainer legen Trainings als Serie an und ergänzen Turniere.
2. Claude oder Trainer verschickt die persönlichen Links an alle Familien.
3. Eltern bestätigen die Saison (Alle dabei + Ausnahmen).
4. Trainer sieht den Fortschritt, Erinnerung an die Offenen.

**Während der Saison**

- Eltern ändern jederzeit über denselben Link – auch nach dem Stichtag; dann wird der Trainer benachrichtigt.
- Trainer hinterlegt bei Bedarf einen **Hinweis am Termin** („Treffpunkt geändert“, „weiße Trikots“).
- Für die WhatsApp-Gruppe gibt es einen **fertigen Text mit Link** und den Knopf **„In WhatsApp teilen“**: öffnet WhatsApp mit dem Text, Trainer wählt die Gruppe und sendet.
- Spielverlegung: Trainer ändert den Termin (oder Claude prüft das BSM auf Änderungen) → Familien mit Zusage werden informiert.

## MVP

### Trainer

- [x] Termine anlegen und bearbeiten (Spiele kommen einmal pro Saison per Claude aus dem BSM; Turniere, Freundschaftsspiele von Hand) – verlegtes Spiel → Mail an Familien mit Zusage
- [ ] Trainings als Serie (z. B. Di + Do 17:30), einzelne absagen – Absagen geht, Serien legt vorerst Claude an
- [x] Termin: Typ, Datum, Treffpunkt + Uhrzeit, Beginn, Ort (Maps-Link), Gegner (im Titel), Heim/Auswärts
- [x] Übersicht pro Termin: dabei / nicht dabei / offen, mit Ampel (Mindestzahl)
- [x] Saison-Matrix: Kinder × Termine
- [ ] Erinnerung an die Offenen (automatisch per Mail und über Claude erledigt; Knopf im Trainerbereich fehlt)
- [ ] Hinweis am Termin (für alle sichtbar, Push an die Zugesagten) – sichtbar ja, Push fehlt
- [ ] Sehen, welche Familien keine Push-Benachrichtigungen aktiviert haben
- [x] „In WhatsApp teilen“ mit fertigem Text + Link (Saisonstart, Erinnerung, Hinweis)
- [ ] Automatischer Erinnerungsplan sichtbar (was wurde wann an wen geschickt, was ist geplant)
- [x] Persönlicher Anstoß: WhatsApp-Chat mit einer offenen Familie öffnen (nur wenn Telefonnummer hinterlegt)

### Eltern

- [x] Persönlicher Link, kein Login
- [x] Saisonansicht aller eigenen Kinder, „Bei allen dabei“, Ausnahmen, Abwesenheitszeitraum
- [x] Bei jedem Spiel: Teamzahl („Noch 2 Zusagen bis 9“) und Stichtag
- [x] Schulferien-Frage („Seid ihr in den Pfingstferien weg?“), Ferien als Schnellauswahl bei Abwesenheit
- [x] Antworten direkt aus der Erinnerungs-Mail (`/antwort/<token>`)
- [x] „Link verloren?“ – Link per E-Mail noch einmal anfordern (`/link`)
- [x] Kalender-Abo (iCal) mit den Terminen der eigenen Kinder (nur die, bei denen sie dabei sind)
- [ ] Web Push aktivieren; dauerhafter Hinweis „Zum Home-Bildschirm“, solange die Seite im Browser offen ist, sonst E-Mail

### Claude

- [ ] Alles, was der Trainer kann, auch über Claude Code – nur für Martin (siehe [tech.md](tech.md))

## Später / Nice-to-have

- **Fahrgemeinschaften** bei Auswärtsspielen
- **Dienste:** Kuchen, Scorer, Platzaufbau
- **Kader-Nominierung** bei zu vielen Zusagen

## Bewusst NICHT

- **Chat** – die WhatsApp-Gruppe bleibt (Begründung in [open-questions.md](open-questions.md))
- Gebühren / Kasse
- Spielerstatistiken
- Native App im App Store
- Werbung, Premium, „Vielleicht“
