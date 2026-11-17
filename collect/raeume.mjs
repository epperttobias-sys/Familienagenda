// Mietbare Räume für alle Gemeinden: Säle, Zentren, Hallen, Waldhütten aus OpenStreetMap + Link zur Raumvermietung der Gemeinde
import { readFileSync, writeFileSync } from "node:fs";
import { alleGemeinden } from "./alle.mjs";
const G = alleGemeinden();
const names = Object.values(G).map(g => g.name), code = Object.fromEntries(Object.entries(G).map(([c, g]) => [g.name, c]));
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&");
const re = `^(${names.map(esc).join("|")})( \\\\(ZH\\\\))?$`;
const BB = "(47.15,8.35,47.70,9.00)";
const UA = { "User-Agent": "Familienagenda/1.0 (github.com/epperttobias-sys/fuer-familien-in-zuerich)" };
const q = `[out:json][timeout:240];(` +
  `nwr["amenity"~"^(events_venue|community_centre|conference_centre)$"]["name"]${BB};` +
  `nwr["name"~"(saal|gemeindehaus|kirchgemeindehaus|pfarreizentrum|mehrzweck|gemeinschaftszentrum|waldhütte|forsthütte|forsthaus|vereinshaus|jugendhaus)",i]["amenity"!~"place_of_worship|restaurant|school"]${BB};` +
  `nwr["amenity"="shelter"]["name"~"hütte",i]${BB};nwr["tourism"="wilderness_hut"]["name"]${BB};` +
  `);out center tags;rel["boundary"="administrative"]["admin_level"="8"]["name"~"${re}"]${BB};out geom;`;
const hosts = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
let data;
for (let round = 0; round < 4 && !data; round++) { if (round) await new Promise(r => setTimeout(r, 45000));
  for (const h of hosts) { try { const r = await fetch(h, { method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
    if (!r.ok) throw new Error(r.status); data = await r.json(); console.log("ok", h); break; } catch (e) { console.log("fehler", h, e.message); } } }
let old = {}; try { const t = readFileSync("site/raeume.js", "utf8"); old = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); } catch {}
const out = {};
if (data) {
  const bounds = [];
  for (const e of data.elements) if (e.type === "relation" && e.tags && e.tags.boundary === "administrative")
    bounds.push({ name: e.tags.name.replace(/ \(ZH\)$/, ""), segs: (e.members || []).filter(m => m.type === "way" && m.geometry).map(m => m.geometry.map(p => [p.lon, p.lat])) });
  const cross = (x, y, lines) => { let c = 0; for (const L of lines) for (let i = 1; i < L.length; i++) { const [x1, y1] = L[i - 1], [x2, y2] = L[i]; if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) c++; } return c; };
  const SKIP = /restaurant|hotel|kino|theater am|disco|club\b|bar\b|altersheim|alterszentrum|pflege|spital|klinik|gefängnis|kaserne|polizei|feuerwehr(?!.*saal)|asyl/i;
  const kind = t => /hütte|forsthaus|wilderness/i.test((t.name || "") + " " + (t.tourism || "")) || t.amenity === "shelter" ? "huette"
    : /kirch|pfarrei|kirchgemeinde/i.test(t.name) ? "kirche" : /halle|mehrzweck|turn/i.test(t.name) ? "halle" : /jugend|gemeinschaftszentrum|\bgz\b|quartier|treff|vereinshaus/i.test(t.name) || t.amenity === "community_centre" ? "zentrum" : "saal";
  const seen = new Set();
  for (const e of data.elements) {
    if (e.type === "relation" && e.tags && e.tags.boundary === "administrative") continue;
    const t = e.tags || {}, c = e.center || e; if (c.lat == null || !t.name || SKIP.test(t.name)) continue;
    if (["private", "no"].includes(t.access)) continue;
    const b = bounds.find(b => cross(c.lon, c.lat, b.segs) % 2 === 1); if (!b || !code[b.name]) continue;
    const key = t.name + b.name; if (seen.has(key)) continue; seen.add(key);
    (out[code[b.name]] = out[code[b.name]] || []).push({ n: t.name, k: kind(t), lat: +c.lat.toFixed(5), lon: +c.lon.toFixed(5), w: t.website || t["contact:website"] || "", p: +t.capacity || undefined });
  }
} else Object.assign(out, old.raeume || {});
// Link zur Raumvermietung auf der Gemeinde-Website
const links = Object.assign({}, old.links || {});
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const [c, g] of Object.entries(G)) {
  if (!g.domain) continue;
  try {
    const r = await fetch("https://" + g.domain, { headers: UA, signal: AbortSignal.timeout(20000) }); if (!r.ok) continue; const h = await r.text();
    const cands = [...h.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map(m => [m[1], m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()])
      .filter(([u, t]) => /raum|räume|raeume|lokal|saal|vermiet|reservation|mieten/i.test(u + " " + t) && !/abfall|entsorg|pdf$/i.test(u));
    const best = cands.find(([u, t]) => /raum|räume|raeume/i.test(u + t) && /vermiet|reserv|miet/i.test(u + t)) || cands.find(([u, t]) => /vermiet|reserv|mieten/i.test(u + t)) || cands[0];
    if (best) links[c] = new URL(best[0].replace(/&amp;/g, "&"), "https://" + g.domain).href;
  } catch {}
  await sleep(250);
}
const cnt = {}; Object.values(out).flat().forEach(x => cnt[x.k] = (cnt[x.k] || 0) + 1);
console.log("räume:", Object.values(out).flat().length, JSON.stringify(cnt), "gemeinden:", Object.keys(out).length, "links:", Object.keys(links).length);
writeFileSync("site/raeume.js", "window.RAEUME=" + JSON.stringify({ stand: new Date().toISOString().slice(0, 10), raeume: out, links }) + ";\n");
