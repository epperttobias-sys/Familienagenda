// Monatlich: Websites aller Gemeinden nach Kinderbetreuung und Familienangeboten durchsuchen.
// Startseite → Seiten zu Kinderbetreuung, Familie, Freizeit → Einträge (Kitas, Horte, Spielgruppen, Ludotheken, ...)
// mit Link zur eigenen Website, Adresse und Koordinaten (geo.admin.ch). Schreibt data/gemeinde-seiten.json.
import { readFileSync, writeFileSync } from "node:fs";

const G = JSON.parse(readFileSync("site/gemeinden.js", "utf8").replace(/^[^=]*=\s*/, "").replace(/;\s*$/, ""));
const ONLY = (process.env.NUR || "").split(",").filter(Boolean);
const UA = { "User-Agent": "Mozilla/5.0 (compatible; FamilienZuerichBot/1.0; +https://epperttobias-sys.github.io/fuer-familien-in-zuerich/)", "Accept-Language": "de-CH,de;q=0.9" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dec = s => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&rsquo;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü").replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));
const txt = h => dec(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// Seiten, die wahrscheinlich Angebote auflisten
const TOPIC = /kinderbetreuung|familienerg[aä]nz|kita|krippe|tagesstruktur|betreuung|vorschul|fr[uü]he[- ]kindheit|frühbereich|familie|kinder|eltern|spielgruppe|ludothek|bibliothek|freizeit|vereine|institution|soziales|schule|hort/i;
const NAV_NO = /abfall|steuer|bau|wahl|abstimm|politik|stelle|jobs|amtsblatt|protokoll|gesetz|reglement|login|kontakt$|impressum|datenschutz|news|aktuell|medien|feuerwehr|friedhof|bestattung|wasser|strom|parkier/i;
// Einträge
const CAT = [
  ["kita", /tagesfamilie|tageseltern|\bkita\b|kitas\b|kinderkrippe|krippe|kindertagesst|kinderhaus|kinderhort|\bhort\b|tagesstruktur|tagesschule|mittagstisch|kinderbetreuung\s+\S|childcare|nursery|kinderland|kinderwelt|kindergarten\s+\S+|chinderhuus|chinderhus|tagi\b|schülerclub|kinderclub/i],
  ["spiel", /spielgruppe|waldspielgruppe|elternverein|familienverein|elternforum|frauenverein|müttertreff|eltern-kind|elki|krabbel/i],
  ["ludo", /ludothek/i],
  ["bib", /bibliothek|mediathek/i],
  ["treff", /familienzentrum|familientreff|gemeinschaftszentrum|\bgz\b|kinder- und jugendtreff|jugendtreff|quartiertreff|eltern-?café|elterncafé|familiencafé/i],
];
const GENERIC = /^(kinderbetreuung|familienergänzende (kinder)?betreuung|kita|kitas|krippe|krippen|hort|horte|spielgruppen?|bibliothek|ludothek|familie|familien|kinder|eltern|mittagstisch|tagesstrukturen?|betreuung|schulergänzende betreuung|freizeit|vereine|mehr|weiter|website|webseite|homepage|link|details?|zur website|kinderbetreuung im frühbereich|vorschulalter|frühe kindheit|familienzentrum|angebote?|übersicht|kontakt|tagesfamilien|tageseltern)$/i;
const DOC = /reglement|verordnung|ordnung\b|benutzungs|benützungs|gebühr|beitrag|vergünstigung|aufsicht|meldepflicht|notsituation|konto|katalog|onleihe|richtlinie|merkblatt|formular|antrag|anmeldung für|tarif|^über die|^offizielle|^weitere|^website|^link$|^mehr\b|kindergarten und schulen|^andere\b|\.pdf|\d{3}\.\d/i;
export const cleanName = n => n.replace(/\s*Externer Link wird in einem neuen Fenster geöffnet\.?/gi, "").replace(/\s*\((?:ausgewählt|pdf|extern)[^)]*\)/gi, "").replace(/\s+/g, " ").trim();
const BAD = /readspeaker|\.(pdf|docx?|xlsx?|jpe?g|png)(\?|$)|mailto:|tel:|javascript:|facebook|instagram|twitter|linkedin|youtube|google\.|maps\.|whatsapp/i;

const robots = new Map();
async function allowed(u) {
  const o = new URL(u).origin;
  if (!robots.has(o)) {
    let dis = [];
    try { const r = await fetch(o + "/robots.txt", { headers: UA, signal: AbortSignal.timeout(10000) });
      if (r.ok) { let on = false; for (const l of (await r.text()).split(/\r?\n/)) { const m = l.match(/^\s*(user-agent|disallow)\s*:\s*(.*)$/i); if (!m) continue; if (m[1].toLowerCase() === "user-agent") on = m[2].trim() === "*"; else if (on && m[2].trim()) dis.push(m[2].trim()); } } } catch {}
    robots.set(o, dis);
  }
  const p = new URL(u).pathname; return !robots.get(o).some(d => d === "/" || p.startsWith(d));
}
async function get(u) {
  if (!(await allowed(u))) throw new Error("robots");
  const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  if (!/html/i.test(r.headers.get("content-type") || "")) throw new Error("kein HTML");
  await sleep(400);
  return { html: (await r.text()).slice(0, 1500000), url: r.url };
}
const links = (html, base) => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map(m => {
  const h = (m[1].match(/href=["']([^"']+)["']/i) || [])[1]; if (!h || BAD.test(h)) return null;
  let u; try { u = new URL(dec(h), base); } catch { return null; } u.hash = "";
  const t = txt(m[2]) || dec((m[1].match(/title=["']([^"']+)["']/i) || [])[1] || "");
  return { u: u.href, t, host: u.hostname.replace(/^www\./, "") };
}).filter(Boolean);
const main = html => (html.match(/<main[\s\S]*?<\/main>/i) || html.match(/<div[^>]+(?:id|class)=["'][^"']*(?:content|main|inhalt)[^"']*["'][\s\S]*/i) || [html])[0];
const catOf = s => (CAT.find(([, re]) => re.test(s)) || [])[0];
const ADR = /([A-ZÄÖÜ][a-zäöüé-]+(?:strasse|str\.|weg|gasse|platz|rain|halde|hof|acker|matt|wies|ring|allee|steig|berg|graben)\s+\d+[a-z]?)\s*,?\s*(8\d{3})\s+([A-ZÄÖÜ][\wäöüéè. -]{1,30})/;

async function geocode(q) {
  try {
    const r = await fetch("https://api3.geo.admin.ch/rest/services/api/SearchServer?type=locations&origins=address&limit=1&sr=4326&searchText=" + encodeURIComponent(q), { headers: UA, signal: AbortSignal.timeout(10000) });
    const j = await r.json(); const a = j.results && j.results[0] && j.results[0].attrs;
    return a ? [+a.lat.toFixed(5), +a.lon.toFixed(5)] : null;
  } catch { return null; }
}

const DOMAINS = { hausenamalbis: "www.hausen.ch", oetwilanderlimmat: "www.oetwil-limmat.ch", thalheimanderthur: "www.thalheim.ch", wettswilamalbis: "www.wettswil.ch" };
// Seiten aus der Sitemap, deren Adresse nach Kinderbetreuung oder Familie klingt
async function fromSitemap(home) {
  const urls = [];
  const take = async (u, depth) => { try { if (!(await allowed(u))) return; const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) }); if (!r.ok) return;
    const x = await r.text(); const L = [...x.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => dec(m[1]));
    if (/<sitemapindex/i.test(x) && depth < 1) { for (const s of L.slice(0, 15)) await take(s, depth + 1); } else urls.push(...L); } catch {} };
  let maps = [];
  try { const r = await fetch(new URL("/robots.txt", home), { headers: UA, signal: AbortSignal.timeout(10000) }); if (r.ok) maps = [...(await r.text()).matchAll(/^\s*sitemap:\s*(\S+)/gim)].map(m => m[1]); } catch {}
  if (!maps.length) maps = [new URL("/sitemap.xml", home).href];
  for (const m of maps.slice(0, 3)) await take(m, 0);
  return urls.filter(u => /kinderbetreuung|familienerg|kita|krippe|tagesstruktur|tagesschule|hort\b|horte|fr[uü]he-?kindheit|vorschul|spielgruppe|familie|eltern|ludothek|betreuung/i.test(decodeURIComponent(u)) && !/news|aktuell|archiv|stelle|job|reglement|\.pdf/i.test(u));
}

async function crawl(code, g) {
  g = { ...g, domain: g.domain || DOMAINS[code] };
  if (!g.domain) return { err: "keine Domain", items: [] };
  const home = "https://" + g.domain + "/", ghost = g.domain.replace(/^www\./, "");
  const seen = new Set(), queue = [], pages = [], found = new Map();
  const push = (u, score, d) => { const k = u.replace(/\/$/, ""); if (seen.has(k)) return; seen.add(k); queue.push({ u, score, d }); };
  push(home, 99, 0);
  for (const u of (await fromSitemap(home)).slice(0, 25)) push(u, 10 + (/kinderbetreuung|familienerg|kita|krippe|tagesstruktur|fr[uü]he/i.test(u) ? 5 : 0), 1);
  while (queue.length && pages.length < 24) {
    queue.sort((a, b) => b.score - a.score); const { u, d } = queue.shift();
    let page; try { page = await get(u); } catch { continue; }
    pages.push(page.url);
    const L = links(page.html, page.url), body = links(main(page.html), page.url);
    for (const l of L) {
      if (l.host !== ghost || d >= 2) continue;
      const s = (TOPIC.test(l.t) ? 3 : 0) + (TOPIC.test(new URL(l.u).pathname) ? 2 : 0) + (/kinderbetreuung|familienerg|kita|krippe|tagesstruktur|fr[uü]he|vorschul|familie/i.test(l.t + l.u) ? 4 : 0) - (NAV_NO.test(l.t + l.u) ? 6 : 0);
      if (s >= 3) push(l.u, s - d, d + 1);
    }
    // Einträge im Inhaltsbereich (nicht im Menü)
    for (const l of (d === 0 ? [] : body)) {
      if (/\(ausgewählt\)/i.test(l.t)) continue;
      const name = cleanName(l.t);
      if (name.length < 4 || name.length > 90 || GENERIC.test(name) || DOC.test(name) || /^(www\.|https?:)/i.test(name) && !catOf(l.host)) continue;
      const cat = catOf(name) || (l.host !== ghost && catOf(l.host.replace(/[.-]/g, " ")));
      if (!cat) continue;
      const key = name.toLowerCase().replace(/[^a-z0-9äöü]/g, "");
      if (found.has(key)) continue;
      found.set(key, { n: /^(www\.|https?:)/i.test(name) ? l.host : name, k: cat, w: l.host !== ghost ? l.u : "", u: l.host === ghost ? l.u : page.url, src: page.url });
    }
  }
  // Interne Detailseiten (z.B. _rte/institution) öffnen: Website und Adresse holen
  const items = [...found.values()];
  let n = 0;
  for (const it of items) {
    if (it.w || n >= 40 || !it.u || it.u === it.src) continue; n++;
    try { const { html } = await get(it.u); const m = main(html);
      const ext = links(m, it.u).filter(l => l.host !== ghost && !BAD.test(l.u) && !/zh\.ch|admin\.ch|bibliotheken-zh|kibesuisse/.test(l.host));
      const best = ext.find(l => /website|webseite|homepage|www\./i.test(l.t)) || (ext.length === 1 ? ext[0] : null);
      if (best) it.w = best.u;
      const a = txt(m).match(ADR); if (a) it.a = `${a[1]}, ${a[3].trim()}`, it.plz = a[2];
    } catch {}
  }
  // Adresse, die bei vielen Einträgen gleich ist, ist die der Gemeindeverwaltung
  const freq = {}; items.forEach(x => x.a && (freq[x.a] = (freq[x.a] || 0) + 1));
  items.forEach(x => { if (x.a && freq[x.a] > 1) { delete x.a; delete x.plz; } });
  // gleiche Website nur einmal
  const byW = new Map(); for (const x of items) { if (!x.w) continue; const k = x.w.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""); if (byW.has(k)) x.dup = 1; else byW.set(k, x); }
  for (let j = items.length - 1; j >= 0; j--) if (items[j].dup) items.splice(j, 1);
  for (const it of items) if (it.a) { const p = await geocode(`${it.a.split(",")[0]} ${it.plz || ""} ${it.a.split(",")[1] || g.name}`); if (p) [it.lat, it.lon] = p; await sleep(150); }
  return { pages: pages.length, items };
}

const codes = Object.keys(G).filter(c => !ONLY.length || ONLY.includes(c));
const out = {}; let i = 0;
await Promise.all(Array.from({ length: 6 }, async () => { while (i < codes.length) { const c = codes[i++];
  try { out[c] = await crawl(c, G[c]); } catch (e) { out[c] = { err: String(e.message || e), items: [] }; }
  console.log(G[c].name, (out[c].items || []).length, "Einträge,", out[c].pages || 0, "Seiten", out[c].err || ""); } }));
writeFileSync("data/gemeinde-seiten.json", JSON.stringify({ stand: new Date().toISOString().slice(0, 10), g: out }, null, 1));
const cnt = {}; Object.values(out).forEach(o => (o.items || []).forEach(x => cnt[x.k] = (cnt[x.k] || 0) + 1));
console.log("Total:", cnt, "Gemeinden ohne Treffer:", Object.entries(out).filter(([, o]) => !(o.items || []).length).map(([c]) => G[c].name).join(", "));
