# Familienagenda

Sammelt jede Nacht die Anlässe für Kinder aus den Agenden von Schweizer Gemeinden und zeigt sie auf einer Webseite.

## Einrichten

1. Erstelle auf github.com ein Konto und ein neues Repository mit dem Namen `familienagenda`.
2. Lade den Inhalt dieses Ordners hoch: **Add file > Upload files**. Den Ordner `.github` musst du mit hochladen.
3. Gehe zu **Settings > Pages** und wähle bei **Source** die Option **GitHub Actions**.
4. Gehe zu **Actions**, wähle **Events sammeln** und klicke auf **Run workflow**.

Nach ein paar Minuten läuft die Seite unter `https://DEINNAME.github.io/familienagenda/`. Danach aktualisiert sie sich jede Nacht selbst.

Hinweis: Beim kostenlosen GitHub-Konto ist die Seite öffentlich erreichbar, auch wenn niemand die Adresse kennt.

## Gemeinden

Die Liste steht in `collect/gemeinden.json`. Jede Gemeinde braucht einen eigenen Buchstaben als Schlüssel und ein `system`:

- ohne `system` (i-web): die meisten Gemeinden. Liegt die Agenda nicht unter `/anlaesseaktuelles`, gib den Pfad mit `path` an (siehe Dübendorf, Seegräben, Illnau-Effretikon).
- `eventitem`: z. B. Maur, Volketswil, Küsnacht, Herrliberg, Oetwil am See, Hombrechtikon, Grüningen, Rüti, Wila. Diese Websites erlauben nur 4 Abrufe in 10 Sekunden, deshalb `delay: 3000`.
- `bss`: Schwerzenbach (Monatskalender)
- `tiles`: Erlenbach
- `rss`: Wetzikon (RSS-Feed)

Jede Gemeinde hat ein Feld `bezirk`. Die Webseite gruppiert die Gemeinden danach.

Eine weitere Gemeinde mit einem dieser Systeme kannst du einfach eintragen. Für ein anderes System braucht es einen neuen Baustein in `collect/lib.mjs`.

Der erste Lauf dauert wegen der Pausen etwa 30 bis 45 Minuten. Danach geht es schneller, weil bekannte Detailseiten nur alle 14 Tage neu gelesen werden.

## Dateien

- `collect/lib.mjs`: erkennt Kinder-Events, Alter und Zeit
- `collect/collect.mjs`: holt die Daten und schreibt `site/events.js` und `site/events.json`
- `site/index.html`: die Webseite
- `test/lib.test.mjs`: Tests, Start mit `node --test test/lib.test.mjs`
