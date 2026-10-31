# Teamplaner

Ersatz für SpielerPlus für die Bretten Kangaroos (Schüler + Jugend): Eltern sagen ihre Kinder für Spiele zu/ab, Trainings nur abmelden.
Phase: Umsetzung. Astro-App im Repo-Root, Eltern-Saisonansicht steht (lokal, PGlite + Testdaten).

- Start hier: `README.md` (Ziel, Stand, nächste Schritte), dann `docs/`.
- Entscheidungen stehen in `docs/open-questions.md` („Geklärt“) und `docs/tech.md` – nicht neu diskutieren.
- Seltene Aufgaben (z. B. Spielplan aus dem BSM einmal pro Saison) macht Claude über die Admin-API – nicht als Funktion in die App einbauen.
- Docs auf Deutsch; Martin schreibt im Chat meist Englisch.
- Stack-Vorbild: `~/workspace/rezepte` (Astro mit Server-Rendering auf Vercel). Optik: `~/workspace/bretten-kangaroos.net` (`docs/design.md`).
- Mockup = Claude-Design-Canvas https://claude.ai/artifact/XgvhWom64h8uwr7DSxjNDY, Quelle in `mockup/canvas/project/`.
  Änderungen: Datei hier bearbeiten, dann mit dem Artifact-Tool an dieselbe URL veröffentlichen (`root` = `mockup/canvas`).
  Vorher die Canvas-Datei lesen, falls jemand im Canvas selbst etwas geändert hat. Wappen-Asset: `/_blob/c67d46d18b2e95f921285e53693ca32c`.
