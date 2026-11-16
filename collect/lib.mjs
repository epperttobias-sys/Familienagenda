// Reine Logik ohne Netzwerk: Seiten lesen, Kinder-Events erkennen, Alter und Zeit herausfinden.
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ss", laquo: "«", raquo: "»", ndash: "–", mdash: "–", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", rsquo: "’", hellip: "…" };

export function decode(s) {
  return String(s ?? "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, c) => {
    if (c[0] === "#") {
      const n = c[1].toLowerCase() === "x" ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return NAMED[c] ?? m;
  });
}

export function strip(html) {
  return decode(String(html ?? "").replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function listFromHtml(html) {
  const m = html.match(/data-entities="([^"]*)"/);
  if (!m) throw new Error("Keine Eventliste im Seitencode gefunden");
  return JSON.parse(decode(m[1])).data;
}

const ADMIN = /gemeinderatssitzung|gemeindeversammlung|urnengang|kartonsammlung|papiersammlung|häckseldienst|sonderabfall|christbaumsammlung|elternabend|elternbildung|femmes-tische|deutschkurs|spielgruppe|yoga|senior|mittagstisch|gottesdienst für erwachsene/i;
const KIDS_NAME = /kinder|chind|famili|eltern-?kind|vater-kind|gschicht|märli|maerli|samichlaus|kerzenzieh|krabbel|chrabbel|fiire mit|zirkus|circus|räbe|puppentheater|kasperli|buchstart|storytime|kamishibai|vorläse|värsli|kreativraum|fasnacht|weihnachtsmärt|christchindli|\bkind\b|elki|knirps|bastel/i;
const KIDS_TEXT = /hauptzielgruppe:\s*(familien|kleinkinder|kinder)|für (die )?(kinder|familien|klein und gross|gross und klein)|kinder (sind )?willkommen|für kinder empfehlenswert|kategorie:?\s*(kinder|famili)/i;
export const KIDS_CATEGORIES = new Set(["14", "18"]);
const SKIP_CATEGORIES = new Set(["7", "19"]);
const MAX_DAYS = 60;
const LATE_HOUR = 20; // Später beginnt kein Anlass für Kinder, ausser die Kategorie oder der Titel sagt es.
const HORIZON_DAYS = 365;

const day = s => Date.parse(s + "T00:00:00Z") / 864e5;

export function normalizeRow(row) {
  const name = strip(row.name);
  return {
    id: String(row.id), name, von: row._datumVon, bis: row._datumBis || row._datumVon,
    ort: strip(row.lokalitaet), veranstalter: strip(row.organisator),
    kategorie: String(row._hauptkategorieId ?? ""), datumText: strip(row._anlassDate),
  };
}

// Lohnt sich die Detailseite? Sitzungen, Abfalltermine und laufende Kurse fallen hier weg.
export function isCandidate(ev, today) {
  if (!ev.von || ev.bis < today) return false;
  if (day(ev.von) - day(today) > HORIZON_DAYS) return false;
  if (day(ev.bis) - day(ev.von) > MAX_DAYS) return false;
  if (SKIP_CATEGORIES.has(ev.kategorie) && !KIDS_NAME.test(ev.name)) return false;
  return !ADMIN.test(ev.name) || KIDS_NAME.test(ev.name);
}

export function detailText(html, name) {
  const mainAt = html.search(/<main[\s>]/i);
  const body = html.slice(Math.max(0, mainAt >= 0 ? mainAt : html.search(/<body[\s>]/i)));
  let t = strip(body);
  const toc = t.lastIndexOf("Inhaltsverzeichnis");
  const from = toc >= 0 ? toc + 18 : 0;
  const at = t.indexOf(name, from);
  t = t.slice(at >= 0 ? at : from);
  const end = t.search(/Fussbereich|Zur Übersicht|Webstatistik/);
  return (end > 0 ? t.slice(0, end) : t).slice(0, 4000);
}

export function parseTime(text) {
  const m = text.match(/\d{4}\s*,\s*(\d{1,2})[.:](\d{2})(?:\s*Uhr)?(?:\s*(?:-|–|bis)\s*(\d{1,2})[.:](\d{2}))?/);
  if (!m) return "";
  return m[3] ? `${m[1]}.${m[2]} - ${m[3]}.${m[4]}` : `${m[1]}.${m[2]}`;
}

const WORDS = { ein: 1, eins: 1, einem: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12 };
const N = "(\\d{1,2}|ein|eins|einem|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf)";
const num = s => (/\d/.test(s) ? Number(s) : WORDS[s.toLowerCase()]);
const age = (min, max, label) => ({ min, max: Math.min(max, 12), label });

export function parseAge(text) {
  let m;
  if ((m = text.match(new RegExp(`${N}\\s*Monate?n?\\s*(?:bis|und|-|–)\\s*(?:zu\\s*)?${N}\\s*Jahre?n?`, "i"))))
    return age(0, num(m[2]), `${num(m[1])} Monate bis ${num(m[2])} Jahre`);
  if ((m = text.match(new RegExp(`${N}\\s*(?:bis\\s*(?:ca\\.\\s*)?|-\\s*|–\\s*|und\\s*)(\\d{1,3}|${N.slice(1, -1)})\\s*-?\\s*(?:Jahre?n?|J\\.|jährig)`, "i")))) {
    const a = num(m[1]), b = num(m[2]);
    if (a <= 16 && b > a) return b > 18 ? age(a, 12, `ab ${a} Jahren`) : a > 12 ? null : age(a, b, `${a} bis ${b} Jahre`);
  }
  if ((m = text.match(new RegExp(`\\bab\\s*(?:ca\\.\\s*)?${N}\\s*Jahre?n?`, "i")))) {
    const a = num(m[1]);
    if (a <= 12) {
      const cap = text.match(/bis ca\.\s*(\d{1,2})\s*Jahre/i);
      return cap && Number(cap[1]) > a ? age(a, Number(cap[1]), `${a} bis ca. ${cap[1]} Jahre`) : age(a, 12, `ab ${a} Jahren`);
    }
    return null;
  }
  if ((m = text.match(new RegExp(`für\\s+${N}\\s*-?\\s*jährige`, "i")))) return age(num(m[1]), num(m[1]), `${num(m[1])} Jahre`);
  if (/Kindergarten bis (zur )?2\. Klasse/i.test(text)) return age(4, 8, "Kindergarten bis 2. Klasse");
  if (/Kindergartenalter|Kindergartenkinder/i.test(text)) return age(4, 6, "Kindergarten");
  if (/(für|mit|Ihren) Kleinkinder/i.test(text)) return age(0, 3, "Kleinkinder");
  return null;
}

// Liest ein Event samt Detailseite aus. text ist der Inhalt der Detailseite.
export function classify(ev, text) {
  const ageInfo = parseAge(ev.name) ?? parseAge(text);
  const time = parseTime(text);
  const late = parseInt(time, 10) >= LATE_HOUR;
  const kids = KIDS_CATEGORIES.has(ev.kategorie) || KIDS_NAME.test(ev.name) || (!late && (KIDS_TEXT.test(text) || ageInfo !== null));
  return { kids, time, age: ageInfo };
}

const norm = s => s.toLowerCase().replace(/[^a-zäöü0-9]/g, "");

// Dieselbe Veranstaltung steht oft mehrfach: pro Gemeinde doppelt oder in mehreren Agenden.
export function merge(events) {
  const out = [], bySite = new Map(), across = new Map();
  for (const e of [...events].sort((a, b) => a.id.localeCompare(b.id))) {
    const site = `${e.gemeinden[0]}|${e.von}|${norm(e.name).slice(0, 12)}`;
    const wide = `${e.von}|${norm(e.name)}|${norm(e.ort)}`;
    const twin = bySite.get(site) ?? across.get(wide);
    if (twin) {
      for (const g of e.gemeinden) if (!twin.gemeinden.includes(g)) twin.gemeinden.push(g);
      twin.time ||= e.time;
      twin.age ??= e.age;
      continue;
    }
    bySite.set(site, e); across.set(wide, e); out.push(e);
  }
  return out.sort((a, b) => a.von.localeCompare(b.von) || a.name.localeCompare(b.name, "de"));
}

// ---------- Datumsangaben auf Deutsch ----------
const MONTHS = { jan: 1, feb: 2, mär: 3, mae: 3, mar: 3, apr: 4, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dez: 12 };
const monthOf = w => MONTHS[String(w).toLowerCase().slice(0, 3)] ?? null;
const pad = n => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y < 100 ? 2000 + Number(y) : y}-${pad(m)}-${pad(d)}`;
const MW = "([A-Za-zÄäÖöÜü]{3,9})\\.?";

// Liest «8. Nov. 2026», «7. – 8. Nov. 2026», «23.10. – 8.11.2026», «9. November 2026, 14:00 Uhr – 13. November 2026».
export function parseDateRange(text) {
  let m;
  if ((m = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})?\s*[–-]\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/))) {
    const y2 = Number(m[6]), y1 = m[3] ? Number(m[3]) : Number(m[2]) > Number(m[5]) ? y2 - 1 : y2;
    return { von: ymd(y1, m[2], m[1]), bis: ymd(y2, m[5], m[4]) };
  }
  if ((m = text.match(new RegExp(`(\\d{1,2})\\.\\s*${MW}\\s*(\\d{4}|\\d{2})?[^–]{0,40}[–]\\s*(\\d{1,2})\\.\\s*${MW}\\s*(\\d{4}|\\d{2})`))) && monthOf(m[2]) && monthOf(m[5])) {
    const y2 = Number(m[6]), y1 = m[3] ? Number(m[3]) : monthOf(m[2]) > monthOf(m[5]) ? y2 - 1 : y2;
    return { von: ymd(y1, monthOf(m[2]), m[1]), bis: ymd(y2, monthOf(m[5]), m[4]) };
  }
  if ((m = text.match(new RegExp(`(\\d{1,2})\\.\\s*[–-]\\s*(\\d{1,2})\\.\\s*${MW}\\s*(\\d{4}|\\d{2})`))) && monthOf(m[3]))
    return { von: ymd(m[4], monthOf(m[3]), m[1]), bis: ymd(m[4], monthOf(m[3]), m[2]) };
  if ((m = text.match(new RegExp(`(\\d{1,2})\\.\\s*${MW}\\s*(\\d{4})`))) && monthOf(m[2])) {
    const d = ymd(m[3], monthOf(m[2]), m[1]);
    return { von: d, bis: d };
  }
  if ((m = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/))) { const d = ymd(m[3], m[2], m[1]); return { von: d, bis: d }; }
  return null;
}

const attr = (html, name) => decode((html.match(new RegExp(`${name}="([^"]*)"`)) || [])[1] ?? "");
const abs = (base, href) => new URL(decode(href), base).href;

// ---------- Bausteine für die verschiedenen Agenda-Systeme ----------
// Jeder Baustein liefert Einträge: { id, name, von, bis, ort, veranstalter, kategorie, hint, url, detailKey, time }
export const SYSTEMS = {
  // i-web (Uster, Egg, Zollikon …): Liste steht als JSON im Seitencode.
  async iweb(site, get) {
    const base = `https://${site.domain}`;
    const rows = listFromHtml(await get(base + (site.path ?? "/anlaesseaktuelles")));
    return rows.map(row => {
      const ev = normalizeRow(row);
      return { ...ev, hint: "", url: `${base}/_rte/anlass/${ev.id}`, detailKey: ev.id, time: "" };
    });
  },

  // Agenda mit «weiter»-Seiten (Maur, Volketswil, Küsnacht, Herrliberg, Oetwil).
  async eventitem(site, get) {
    const listUrl = `https://${site.domain}${site.path}`;
    const items = [], seen = new Set();
    for (let page = 1; page <= (site.maxPages ?? 30); page++) {
      const html = await get(page === 1 ? listUrl : `${listUrl}/eventsjsRequest/0/eventspage/${page}`);
      const blocks = html.split(/<li[^>]*class="[^"]*event-item/).slice(1);
      let fresh = 0;
      for (const b of blocks) {
        const a = b.match(/<a[^>]*href="([^"]*\/event\/(\d+)\/eventdate\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/);
        if (!a) continue;
        const id = `${a[2]}-${a[3]}`;
        if (seen.has(id)) continue;
        seen.add(id); fresh++;
        const dateHtml = (b.match(/class="[^"]*event-date[^"]*"[^>]*>([\s\S]*?)<\/p>/) || [])[1] ?? "";
        const dateText = strip(dateHtml);
        const range = parseDateRange(dateText);
        const von = attr(dateHtml, "datetime") || range?.von;
        if (!von) continue;
        const bis = range && range.bis > von ? range.bis : von;
        items.push({ id, name: strip(a[4]), von, bis, ort: "", veranstalter: "", kategorie: "", hint: "", url: abs(listUrl, a[1]), detailKey: a[2], time: parseTime(dateText) });
      }
      if (!fresh) break;
    }
    return items;
  },

  // TYPO3-Kalender mit Monatsansicht (Schwerzenbach). Kurzbeschreibung steht schon in der Liste.
  async bss(site, get) {
    let url = `https://${site.domain}${site.path}`;
    const items = [];
    for (let i = 0; i < (site.months ?? 6) && url; i++) {
      const html = await get(url);
      const head = strip((html.match(/<div class="text-center">\s*<span>([^<]*)<\/span>/) || [])[1] ?? "");
      const mm = head.match(/([A-Za-zäÄ]+)\s+(\d{4})/);
      const month = mm && monthOf(mm[1]);
      for (const b of html.split('class="bss-event-detail-link"').slice(1)) {
        const href = (b.match(/href="([^"]*)"/) || [])[1];
        const app = decode(href ?? "").match(/appointment%5D=(\d+)/);
        const titles = [...b.matchAll(/class="bss_calendar_day_title">([\s\S]*?)<\/div>/g)].map(x => strip(x[1]));
        const d = (titles[0] || "").match(/^(\d{1,2})\./);
        if (!app || !d || !month) continue;
        const von = ymd(Number(mm[2]), month, d[1]);
        const hint = strip((b.match(/event-preview-body-row[^>]*>([\s\S]*?)<\/div>/) || [])[1] ?? "");
        items.push({ id: app[1], name: titles[1] || attr(b, "data-title"), von, bis: von, ort: "", veranstalter: "", kategorie: "", hint, url: abs(`https://${site.domain}/`, href), detailKey: null, time: parseTime(`${von.slice(0, 4)}, ${hint}`) });
      }
      const next = html.match(/<a href="([^"]*month%5D=next[^"]*)"/);
      url = next ? abs(`https://${site.domain}/`, next[1]) : null;
    }
    return items;
  },

  // RSS-Feed mit einem Eintrag pro Termin (Wetzikon). Beschreibung: «16.11.2026 | 16:00 Uhr - 18:00 Uhr<br/>Kategorie: …<br/>Ort: …».
  async rss(site, get) {
    const xml = await get(`https://${site.domain}${site.path}`);
    const items = [];
    for (const b of xml.split(/<item>/).slice(1)) {
      const tag = t => decode((b.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1] ?? "").replace(/^<!\[CDATA\[|\]\]>$/g, "");
      const desc = decode(tag("description"));
      const link = tag("link").replace(/^http:/, "https:");
      const id = (link.match(/[?&]i=(\d+)/) || [])[1];
      const d = desc.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (!id || !d) continue;
      const von = ymd(d[3], d[2], d[1]);
      const t = desc.match(/(\d{1,2})[:.](\d{2})\s*Uhr(?:\s*-\s*(\d{1,2})[:.](\d{2}))?/);
      const time = t ? (t[3] ? `${t[1]}.${t[2]} - ${t[3]}.${t[4]}` : `${t[1]}.${t[2]}`) : "";
      const ort = strip((desc.match(/Ort:\s*([^<]*)/) || [])[1] ?? "");
      items.push({ id: `${id}-${von}`, name: strip(tag("title")), von, bis: von, ort, veranstalter: "", kategorie: "", hint: "", url: link, detailKey: id, time });
    }
    return items;
  },

  // Kacheln mit Datum und Titel (Erlenbach).
  async tiles(site, get) {
    const listUrl = `https://${site.domain}${site.path}`;
    const html = await get(listUrl);
    const items = [];
    for (const b of html.split(/<li[^>]*class="[^"]*\btile\b/).slice(1)) {
      const href = (b.match(new RegExp(`href="([^"]*${site.linkPart}[^"]*)"`)) || [])[1];
      const range = parseDateRange(strip((b.match(/<time[^>]*>([\s\S]*?)<\/time>/) || [])[1] ?? ""));
      const name = strip((b.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] ?? "");
      if (!href || !range || !name) continue;
      const slug = href.replace(/\/$/, "").split("/").pop();
      items.push({ id: slug, name, ...range, ort: "", veranstalter: "", kategorie: "", hint: strip((b.match(/<\/h1>\s*<p>([\s\S]*?)<\/p>/) || [])[1] ?? ""), url: abs(listUrl, href), detailKey: slug, time: "" });
    }
    return items;
  },
};

function extras(text) {
  const ort = (text.match(/Veranstaltungsort\s+(.+?)\s+Lageplan/) || [])[1]?.replace(/\s+\S*(strasse|weg|gasse|platz|rain)\s.*$/i, "").replace(/\s+\d{4}\s.*$/, "").slice(0, 70) ?? "";
  const veranstalter = (text.match(/Organisator\s+(.+?)\s+(iCalendar|Seite als PDF|$)/) || [])[1]?.slice(0, 70) ?? "";
  return { ort, veranstalter };
}

// Holt eine Gemeinde. fetchText lädt eine Adresse, cache spart Detailseiten, die schon bekannt sind.
export async function collectSite(code, site, { fetchText, cache, today, wait = async () => {} }) {
  const get = async url => { const t = await fetchText(url); await wait(); return t; };
  const system = SYSTEMS[site.system ?? "iweb"];
  if (!system) throw new Error(`Unbekanntes System: ${site.system}`);
  const items = await system(site, get);
  const result = [];
  for (const ev of items) {
    if (!isCandidate(ev, today)) continue;
    const key = `${code}:${ev.detailKey ?? ev.id}`;
    let info = cache[key];
    if (!info || day(today) - day(info.seen) > 14) {
      const text = ev.detailKey ? detailText(await get(ev.url), ev.name) : `${ev.name} ${ev.hint}`;
      info = { ...classify(ev, `${ev.hint} ${text}`), ...extras(text), seen: today };
      cache[key] = info;
    }
    if (info.kids) result.push({
      gemeinden: [code], id: `${code}-${ev.id}`, name: ev.name, von: ev.von, bis: ev.bis,
      ort: ev.ort || info.ort || "", veranstalter: ev.veranstalter || info.veranstalter || "",
      time: ev.time || info.time, age: info.age, url: ev.url,
    });
  }
  return { rows: items.length, events: result };
}

// Vereine: Kinder-Angebote am Namen erkennen und einer Gruppe zuordnen
const CLUB_NO = /senior|veteran|alt[- ]?pfadi|altherren|männerchor|maennerchor|frauenchor|frauenturn|männerturn|damenriege|herrenriege|seniorenturn|kiwanis|rotary|lions|partei|\bsvp\b|\bfdp\b|\bsp\b|die mitte|\bglp\b|\bevp\b|grüne|gewerbe|landfrauen|pensionierte|rentner|60\s*\+|schützen|jäger|jagd|imker|ornitholog(?!.*jugend)|fasn|gugge|zunft|quartierverein|dorfverein|verkehrsverein|verschönerung|wanderverein|kulturverein|kirchenchor|samariter(?!.*jugend)|freundeskreis|stiftung|genossenschaft|club 2|aktive senioren|verband\b|familiengärten|familiengarten|hundesport|motorsport|supporter|gönner|aktivriege|damenturn|damen|herren|krippe|kindertagesst|kinderheim|jugendberatung|tagesfamilien|kita\b|hauseigentümer|privatwald/i;
export const CLUB_GROUPS = [
  ["pfadi", "Pfadi und Jugendgruppen", /pfadi|cevi|jungwacht|blauring|jubla|jungschar|jugendtreff|jugendarbeit|jugendverein|kinder|jugend(?!musik)|kids|juniors?\b/i],
  ["sport", "Sport", /\bfc\b|fussball|football|turn|unihockey|floorball|handball|volleyball|basketball|tennis|badminton|judo|karate|taekwondo|kampfsport|aikido|schwimm|wasserball|leichtathletik|\blv\b|\bla\b|\bski|snowboard|eishockey|eislauf|curling|reit|pony|velo|bike|\brad|orientierungslauf|\bol\b|rugby|hockey|tischtennis|rhönrad|kletter|segel|ruder|kanu|golf|inline|skater|sport|athlet|gymnastik|trampolin|fechten|boxen|ringen|schach/i],
  ["musik", "Musik und Tanz", /jugendmusik|musikschule|kadetten|kinderchor|jugendchor|tanz|ballett|tambour|singschule|musik/i],
  ["familie", "Familie und Eltern", /eltern|famili|mütter|muetter|väter|spielgruppe|ludothek|elki|krabbel|kita|tagesfamilien/i],
  ["kreativ", "Zirkus, Kreativ und Natur", /zirkus|circus|robot|forscher|science|freizeit-?werkstatt|naturspielgruppe|waldjugend|jugendfeuerwehr|kind & kunst|kinderkunst/i],
];
export function classifyClub(name) {
  if (CLUB_NO.test(name)) return null;
  for (const [k, , re] of CLUB_GROUPS) if (re.test(name)) return k;
  return null;
}
