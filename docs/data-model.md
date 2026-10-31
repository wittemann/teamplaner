# Datenmodell (Entwurf)

```
Team ──< TeamMember >── Player ──< Guardianship >── Family/Guardian
  │                       │
  ├──< Event ──< Response >┘
  └──< Coach
```

## Entitäten

**Team** – id, name (Schüler | Jugend), season, bsm_league_id

**Player** (Kind) – id, first_name, last_name_initial, birth_year

**TeamMember** – team_id, player_id, active

**Guardian** (Elternteil) – id, name, email, phone? (optional, nur für den persönlichen WhatsApp-Anstoß), access_token_hash (SHA-256 des Tokens im persönlichen Link; das Token selbst wird nicht gespeichert, rotierbar)

**Reminder** (Erinnerungsplan) – id, team_id, kind (season_start | before_deadline_7 | before_deadline_1 | manual), planned_at, sent_at?, recipients[] (guardian_id + Kanal push|mail)
→ Cronjob verschickt fällige Erinnerungen nur an Familien mit offenen Spielen; hat ein Elternteil auf die letzte nicht reagiert, geht die nächste an den anderen Elternteil.

**Holiday** (Schulferien BW) – name, from, to → keine Tabelle, `src/data/holidays-bw.json`, einmal pro Schuljahr gepflegt (amtlicher Ferienkalender BW)

**Guardianship** – guardian_id, player_id

**Coach** – id, name, email, is_admin, access_token_hash (persönlicher Trainer-Link); Teams über **CoachTeam** (coach_id, team_id)
→ eigene Tabelle, Trainer sind nie Spieler.

**Event**

- id, team_id, type (game | training | tournament | other)
- series_id? (Trainingsserie), bsm_match_id? (für Abgleich bei Verlegungen)
- title, opponent?, home_away?
- meet_at, starts_at, ends_at?, respond_by? (Stichtag), location_name, location_url
- min_players?, cancelled, cancel_reason? (z. B. „Christi Himmelfahrt“)

**Response**

- event_id, player_id, status (**in | out**)
- responded_by (guardian_id | coach_id | „claude“), updated_at
- Kein Eintrag: bei Spielen = offen, bei Trainings = dabei.

**Absence** (Abwesenheitszeitraum)

- player_id, from, to (Tage in Berliner Zeit, inklusive), note, created_by → setzt Responses auf „out“ mit responded_by `absence:<id>`; Entfernen nimmt genau diese zurück. Neue Termine (Admin-API) bekommen das „out“ auch.

**PushSubscription** – id, guardian_id | coach_id, endpoint, p256dh, auth, user_agent, created_at, last_success_at
→ mehrere pro Person (ein Eintrag je Gerät); bei Fehler 404/410 vom Push-Dienst löschen.

**Event.coach_note** – Hinweis des Trainers am Termin („Treffpunkt geändert“), mit coach_note_updated_at

Umgesetzt in `db/migrations/` (bisher: Team, Player, TeamMember, Guardian, Guardianship, Event, Response, Coach, CoachTeam, Absence).

**Guardian.calendar_token_hash** – Kalender-Abo `/kalender/<token>.ics`. Der Token wird aus dem persönlichen Link abgeleitet; ein neuer Link beendet also auch das alte Abo.

Admin-Token für Claude: nur ein Hash in der Server-Konfiguration, keine eigene Tabelle.

## Gedanken

- Antwort hängt am **Kind**, egal welcher Elternteil antwortet.
- Kein Eintrag bei Spielen = **offen** – Eltern müssen ausdrücklich zusagen.
- Änderungen nach dem Stichtag sind erlaubt; dann wird der Trainer benachrichtigt (`updated_at` > Stichtag).
- Größenordnung: 2 Teams × 16 Kinder × ~40 Termine ≈ 1 300 Responses pro Saison – trivial für Postgres (Neon, kostenloser Plan).
