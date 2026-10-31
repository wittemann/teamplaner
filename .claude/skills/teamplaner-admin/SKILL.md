---
name: teamplaner-admin
description: Teamplaner der Bretten Kangaroos über die Admin-API verwalten – Saison/Spiele anlegen (z. B. aus dem BSM), Termine ändern oder absagen, Familien und Trainer mit persönlichem Link anlegen, Links erneuern, Zusagen prüfen ("wer fehlt noch?") und WhatsApp-Texte schreiben. Nutzen, wenn Martin etwas im Teamplaner nachsehen oder ändern will.
---

# Teamplaner-Admin

Die App hat eine kleine JSON-API unter `/api/admin/*`. Claude ruft sie mit `curl` auf (kein MCP).
Code: `src/pages/api/admin/`, Eingaben/Felder: `src/lib/admin/data.ts`.

## Verbindung

| Ziel                  | Basis-URL                                                                           | Token                        |
| --------------------- | ----------------------------------------------------------------------------------- | ---------------------------- |
| Lokal (`npm run dev`) | `http://localhost:4321`                                                             | `ADMIN_TOKEN` in `.env`      |
| Produktion            | `https://teamplaner-kappa.vercel.app` (später `https://team.bretten-kangaroos.net`) | `ADMIN_TOKEN` in `.env.neon` |

```bash
set -a; . ./.env.neon; set +a     # bzw. ./.env für lokal
B=https://teamplaner-kappa.vercel.app/api/admin
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$B/teams"
```

Solange die `*.vercel.app`-Adresse durch Vercel Authentication geschützt ist, zusätzlich
`-H "x-vercel-protection-bypass: $VERCEL_BYPASS"` (ebenfalls in `.env.neon`).

Tokens und Links **nie** in Commits, Docs oder Logs schreiben. Persönliche Links nur an Martin ausgeben.

## Endpunkte

| Methode + Pfad                       | Body / Query                                                                                            | Ergebnis                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /teams`                         | –                                                                                                       | Teams mit Kindern (`name` = Vorname + Initial), Eltern, Trainern, IDs          |
| `POST /teams`                        | `{ name, season }`                                                                                      | `{ id }`                                                                       |
| `GET /events?team=<id>[&from=<ISO>]` | –                                                                                                       | kommende Termine mit `counts {in,out,open}`, Namen `out`/`open`, `lateChanges` |
| `POST /events`                       | `{ teamId, events: [Event…] }` (max. 200)                                                               | `{ created: [ids] }`                                                           |
| `PATCH /events/<id>`                 | Teil eines Events                                                                                       | `{ updated }`                                                                  |
| `PUT /responses`                     | `{ eventId, playerId, status: "in" \| "out" \| null }`                                                  | Antwort setzen (null = wieder offen)                                           |
| `POST /families`                     | `{ name, email, phone?, players: [{ firstName, lastNameInitial, birthYear, teamId } \| { playerId }] }` | `{ guardianId, playerIds, link }`                                              |
| `POST /guardians/<id>/token`         | –                                                                                                       | neuer Eltern-Link, alter ungültig                                              |
| `POST /coaches`                      | `{ name, email, isAdmin?, teamIds }`                                                                    | `{ coachId, link }` (Link zum Trainerbereich)                                  |
| `POST /coaches/<id>/token`           | –                                                                                                       | neuer Trainer-Link                                                             |

**Event-Felder:** `type` (`game` \| `training` \| `tournament` \| `other`), `title` („vs. Heidelberg“ /
„bei Mannheim“ / „Training“), `opponent`, `homeAway` (`home` \| `away`), `seriesId` (UUID, gleiche für
eine Trainingsserie), `bsmMatchId`, `meetAt`, `startsAt`, `endsAt`, `respondBy` (Stichtag),
`locationName`, `locationUrl`, `minPlayers`, `coachNote`, `cancelled`, `cancelReason`.
Zeiten als ISO mit Offset, deutsche Zeit: Sommer `+02:00`, Winter `+01:00`.

Fehler: 401 = Token falsch, 400 = `issues` (zod) zeigen das falsche Feld, 404 = ID unbekannt.

## Abläufe

**Saison aus dem BSM anlegen** (einmal pro Saison, siehe `docs/tech.md` „Spielplan aus dem BSM“):

1. Liga-IDs suchen (`~/workspace/bretten-kangaroos.net/docs/bsm-api.md`), Spiele mit Verein `398` holen.
2. Liste Martin zeigen (Datum, Uhrzeit, Gegner, Heim/Auswärts, Platz) und OK abwarten.
3. Team-ID per `GET /teams` (oder `POST /teams`), dann `POST /events` mit:
   `title` „vs. <Gegner>“ / „bei <Gegner>“, `meetAt` 90 Min. vor Beginn, `respondBy` Do 20:00 davor,
   `minPlayers` 9, `bsmMatchId`, Heimspiele `locationName` „Kangaroos Ballpark“.
4. Trainings als Serie: ein `seriesId` (z. B. `uuidgen`), je Termin ein Event `type: "training"`;
   Feiertage/Ferien mit `cancelled: true, cancelReason`. Schulferien BW vorher mit Martin klären.

**Wöchentlicher Check** („Wer hat für Samstag noch nicht zugesagt?“): `GET /events?team=…`, für die
nächsten Spiele `counts` + `open` zusammenfassen, Mindestzahl prüfen, späte Änderungen nennen.
Auf Wunsch WhatsApp-Text schreiben (kurz, Datum, Treffpunkt, offene Vornamen).

**Verlegung/Absage:** `PATCH /events/<id>` mit neuer Zeit bzw. `cancelled`. Familien werden noch
**nicht** automatisch benachrichtigt (Push/Mail kommt später) – Martin auf WhatsApp-Text hinweisen.

**Neue Familie:** Kind + Elternteil per `POST /families`; zweiter Elternteil mit `{ playerId }`.
Den zurückgegebenen Link Martin geben, nicht speichern.
