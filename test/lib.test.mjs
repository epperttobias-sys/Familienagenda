import test from "node:test";
import assert from "node:assert/strict";
import { classify, decode, detailText, isCandidate, listFromHtml, merge, normalizeRow, parseAge, parseTime, collectSite } from "../collect/lib.mjs";

const row = (o = {}) => ({ id: "1", name: '<a href="/x">Test</a>', lokalitaet: "Saal", organisator: "Verein", _datumVon: "2026-11-10", _datumBis: "2026-11-10", _hauptkategorieId: "16", _anlassDate: "", ...o });
const ev = o => normalizeRow(row(o));
const html = rows => `<table data-entities="${JSON.stringify({ data: rows }).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}"></table>`;

test("Eventliste aus dem Seitencode", () => {
  const rows = listFromHtml(html([row({ name: '<a href="/_rte/anlass/1">&quot;Märli&quot;</a>' })]));
  assert.equal(normalizeRow(rows[0]).name, '"Märli"');
  assert.throws(() => listFromHtml("<p>nichts</p>"));
});

test("Altersangaben aus echten Texten", () => {
  const cases = [
    ["Verse für Kleinkinder zwischen 9 Monaten und drei Jahren in Begleitung", 0, 3],
    ["Für Kinder von 4–6 Jahren ohne Begleitung", 4, 6],
    ["Für Kinder von 7-9 Jahren.", 7, 9],
    ["Für Kinder ab 4 Jahren.", 4, 12],
    ["Kinder im Alter von 2 bis ca. 6 Jahren richtet", 2, 6],
    ["Kinder von ca. 9 Monaten bis 3 Jahren.", 0, 3],
    ["Hauptzielgruppe: Kleinkinder bis ca. 6 Jahre; Ab 3 Jahren; Zielgruppe", 3, 6],
    ["Familienunterhaltung für Kinder von 3 – 102 Jahren!", 3, 12],
    ["Kinder ab Kindergarten bis zur 2. Klasse", 4, 8],
    ["Kleinkinder von 1 bis 5 Jahren", 1, 5],
  ];
  for (const [t, min, max] of cases) {
    const a = parseAge(t);
    assert.deepEqual([a?.min, a?.max], [min, max], t);
  }
  for (const t of ["Maskenball ab 16 Jahren", "Seit 30 Jahren im Dorf", "Abendkasse ab 19.15 Uhr", "Sonntag, 9. Nov.", "Der 17-jährige Congo Boy", "Eine 28-jährige Frau", "Geburt Kleinkinder Kinder Familie Jugend Alter"]) assert.equal(parseAge(t), null, t);
});

test("Zeit steht nach dem Datum, Öffnungszeiten zählen nicht", () => {
  assert.equal(parseTime("Öffnungszeiten 13.30 – 18.30 Uhr ... 17. Nov. 2026, 15.00 Uhr - 15.30 Uhr, 30 min"), "15.00 - 15.30");
  assert.equal(parseTime("7. Nov. 2026, 9.30 Uhr Für Kinder"), "9.30");
  assert.equal(parseTime("7. Nov. 2026 Lageplan"), "");
});

test("Detailtext beginnt beim Titel", () => {
  const t = detailText("<head><title>x</title></head><body><nav>Menü Für Kinder ab 9 Jahren</nav>Inhaltsverzeichnis <h1>Kreativraum</h1> Für Kinder von 1 bis 5 Jahren</body>", "Kreativraum");
  assert.ok(t.startsWith("Kreativraum"));
  assert.equal(parseAge(t).min, 1);
});

test("Sitzungen, Senioren und Dauerkurse fallen weg", () => {
  assert.equal(isCandidate(ev({ name: "Gemeinderatssitzung" }), "2026-11-02"), false);
  assert.equal(isCandidate(ev({ _hauptkategorieId: "19" }), "2026-11-02"), false);
  assert.equal(isCandidate(ev({ _datumBis: "2027-07-01" }), "2026-11-02"), false);
  assert.equal(isCandidate(ev({ _datumBis: "2026-10-01", _datumVon: "2026-10-01" }), "2026-11-02"), false);
  assert.equal(isCandidate(ev(), "2026-11-02"), true);
  assert.equal(isCandidate(ev({ name: "Yoga für Mama & Kind" }), "2026-11-02"), true);
  assert.equal(isCandidate(ev({ name: "Yoga am Abend" }), "2026-11-02"), false);
});

test("Erkennung: Kategorie, Titel oder Text", () => {
  assert.equal(classify(ev({ _hauptkategorieId: "14" }), "").kids, true);
  assert.equal(classify(ev({ name: "Kerzenziehen" }), "").kids, true);
  assert.equal(classify(ev(), "Für Kinder ab 4 Jahren").kids, true);
  assert.equal(classify(ev({ name: "Jazz Session" }), "Live im Keller").kids, false);
  assert.equal(classify(ev({ name: "Filmabend" }), "9. Dez. 2026, 20.30 Uhr Für Kinder ab 12 Jahren").kids, false);
  assert.equal(classify(ev({ name: "Kinderdisco" }), "9. Dez. 2026, 20.30 Uhr").kids, true);
});

test("Doppelte werden zusammengelegt, ähnliche Kerzenziehen nicht", () => {
  const e = (g, id, name, ort, von = "2026-12-06") => ({ gemeinden: [g], id, name, ort, von, bis: von, time: "", age: null });
  const m = merge([e("u", "1", "Samichlaus", "Silberweide"), e("g", "2", "Samichlaus", "Silberweide"), e("u", "3", "Gschichtefunke - Erzählzeit ab 3", "Bibi"), e("u", "4", "Gschichtefunke - Erzählzeit", "Bibliothek"), e("u", "5", "Kerzenziehen und mehr", "Kirche"), e("m", "6", "Kerzenziehen", "CeVilla")]);
  assert.equal(m.length, 4);
  assert.deepEqual(m.find(x => x.name === "Samichlaus").gemeinden, ["u", "g"]);
});

test("Detailseiten kommen beim zweiten Lauf aus dem Zwischenspeicher", async () => {
  let details = 0;
  const fetchText = async url => (url.includes("/_rte/") ? (details++, "<body>Inhaltsverzeichnis Test 10. Nov. 2026, 14.00 Uhr Für Kinder ab 5 Jahren</body>") : html([row()]));
  const cache = {};
  const opts = { fetchText, cache, today: "2026-11-02" };
  const a = await collectSite("u", { domain: "x.ch" }, opts);
  await collectSite("u", { domain: "x.ch" }, opts);
  assert.equal(details, 1);
  assert.deepEqual([a.events[0].time, a.events[0].age.min], ["14.00", 5]);
});

import { parseDateRange, SYSTEMS } from "../collect/lib.mjs";

test("Deutsche Datumsangaben", () => {
  const cases = [
    ["8. Nov. 2026", "2026-11-08", "2026-11-08"],
    ["7. – 8. Nov. 2026", "2026-11-07", "2026-11-08"],
    ["23.10. – 8.11.2026", "2026-10-23", "2026-11-08"],
    ["30.11. – 15.12.2026", "2026-11-30", "2026-12-15"],
    ["9. November 2026, 14:00 Uhr – 13. November 2026, bis 19:00 Uhr", "2026-11-09", "2026-11-13"],
    ["1. November 2026 – 20. November 2026", "2026-11-01", "2026-11-20"],
    ["28. Dezember 2026 – 3. Januar 2027", "2026-12-28", "2027-01-03"],
    ["23. Jan. 2027", "2027-01-23", "2027-01-23"],
  ];
  for (const [t, von, bis] of cases) assert.deepEqual(parseDateRange(t), { von, bis }, t);
});

test("Baustein Agenda mit weiter-Seiten", async () => {
  const li = (ev, dt, title, date) => `<li class="mod-entry event-item"><h2 class="mod-entry-title event-title summary"><a href="https://x.ch/v.html/561/event/${ev}/eventdate/${dt}">${title}</a></h2><p class="mod-entry-meta event-date"><span><time datetime="${date}" class="dtstart">10. November 2026</time>, <span class="event-time">9:30</span></span><span class="event-time-to"><span class="event-time"> bis 13:00 Uhr</span></span></p></li>`;
  const pages = { 1: li(1, 10, "Kinderkafi", "2026-11-10") + li(2, 20, "Kerzenziehen &amp; mehr", "2026-11-12"), 2: li(2, 20, "Kerzenziehen &amp; mehr", "2026-11-12") };
  const get = async url => pages[url.endsWith("/eventspage/2") ? 2 : url.includes("eventspage") ? 3 : 1] ?? "";
  const items = await SYSTEMS.eventitem({ domain: "x.ch", path: "/v.html/407" }, get);
  assert.equal(items.length, 2);
  assert.deepEqual([items[0].id, items[0].von, items[0].detailKey, items[1].name, items[0].time], ["1-10", "2026-11-10", "1", "Kerzenziehen & mehr", "9.30 - 13.00"]);
});

test("Baustein Monatskalender", async () => {
  const card = `<a class="bss-event-detail-link" href="/k/?tx_bssevents_calendar%5Baction%5D=detail&amp;tx_bssevents_calendar%5Bappointment%5D=2661&amp;cHash=1"> <div data-title="Miniclub"><div class="bss_calendar_day_title">10. Dienstag</div> <div class="bss_calendar_day_title">Miniclub</div> <div class="event-preview-body-row"><p>Spiel für Kinder von 0 bis 4 Jahren</p></div></div></a>`;
  const html = `<div class="text-center"> <span>November 2026</span> </div>${card}`;
  const items = await SYSTEMS.bss({ domain: "s.ch", path: "/k/", months: 1 }, async () => html);
  assert.deepEqual([items[0].von, items[0].name, items[0].detailKey], ["2026-11-10", "Miniclub", null]);
  assert.match(items[0].url, /^https:\/\/s\.ch\/k\/\?/);
});

test("Baustein Kacheln", async () => {
  const html = `<li class="state--record--show tile has-image"><a href="https://e.ch/de/veranstaltungen/kletterplausch/"><article><header><time>8. Nov. 2026</time> <h1>Kletterplausch</h1> <p>Für Familien</p></header></article></a></li>`;
  const items = await SYSTEMS.tiles({ domain: "e.ch", path: "/de/v/", linkPart: "/de/veranstaltungen/" }, async () => html);
  assert.deepEqual([items[0].id, items[0].von, items[0].hint], ["kletterplausch", "2026-11-08", "Für Familien"]);
});

test("Baustein RSS", async () => {
  const xml = `<rss><channel><item><title>Kinder-Theater &amp; Musik</title><description>21.11.2026 | 14:00 Uhr - 15:30 Uhr&lt;br/&gt;Kategorie: Kinder&lt;br/&gt;Ort: Aula Egg&lt;br/&gt;https://x.ch</description><link>http://www.w.ch/de/veranstaltungen/detail/detail.php?i=55</link></item><item><title>Ohne Link</title><description>21.11.2026</description><link>http://www.w.ch/de/</link></item></channel></rss>`;
  const items = await SYSTEMS.rss({ domain: "www.w.ch", path: "/rss.php" }, async () => xml);
  assert.equal(items.length, 1);
  assert.deepEqual([items[0].name, items[0].von, items[0].time, items[0].ort, items[0].detailKey, items[0].url], ["Kinder-Theater & Musik", "2026-11-21", "14.00 - 15.30", "Aula Egg", "55", "https://www.w.ch/de/veranstaltungen/detail/detail.php?i=55"]);
  assert.equal(classify({ name: "Theater", kategorie: "" }, "Datum 21.11.2026 Kategorie Kinder & Familie Lokalität").kids, true);
});
