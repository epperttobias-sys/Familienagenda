// Vereine für Zürich und Winterthur: Die beiden Städte haben keine Vereinsliste im Gemeinde-System
// (Winterthurs Verzeichnis sperrt das automatische Auslesen). Deshalb Vereine aus OpenStreetMap,
// erkannt mit denselben Regeln wie bei den anderen Gemeinden (classifyClub), mit eigener Website.
import { readFileSync, writeFileSync } from "node:fs";
import { classifyClub } from "./lib.mjs";
import { fillSites, wdTags } from "./web.mjs";
const CITIES = { zuerich: "Zürich", winterthur: "Winterthur" };
const BB = "(47.31,8.44,47.57,8.82)";
const UA = { "User-Agent": "Familienagenda/1.0 (github.com/epperttobias-sys/fuer-familien-in-zuerich)" };
const q = `[out:json][timeout:300];(nwr["club"]["name"]${BB};nwr["leisure"="sports_club"]["name"]${BB};nwr["office"="association"]["name"]${BB};nwr["amenity"="music_school"]["name"]${BB};);out center tags;` +
  `rel["boundary"="administrative"]["admin_level"="8"]["name"~"^(Zürich|Winterthur)$"]${BB};out geom;`;
const hosts = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
let data;
for (let round = 0; round < 4 && !data; round++) { if (round) await new Promise(r => setTimeout(r, 45000));
  for (const h of hosts) { try { const r = await fetch(h, { method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
    if (!r.ok) throw new Error(r.status); data = await r.json(); console.log("ok", h); break; } catch (e) { console.log("fehler", h, e.message); } } }
if (!data) { console.log("keine Daten, alte Liste bleibt"); process.exit(0); }
const bounds = [];
for (const e of data.elements) if (e.type === "relation" && e.tags && e.tags.boundary === "administrative")
  bounds.push({ name: e.tags.name, segs: (e.members || []).filter(m => m.type === "way" && m.geometry).map(m => m.geometry.map(p => [p.lon, p.lat])) });
const cross = (x, y, lines) => { let c = 0; for (const L of lines) for (let i = 1; i < L.length; i++) { const [x1, y1] = L[i - 1], [x2, y2] = L[i]; if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) c++; } return c; };
const code = Object.fromEntries(Object.entries(CITIES).map(([c, n]) => [n, c]));
const out = { zuerich: [], winterthur: [] }, seen = new Set();
for (const e of data.elements) {
  const t = e.tags || {}; if (e.type === "relation" && t.boundary) continue; const c = e.center || e; if (c.lat == null || !t.name) continue;
  const k = classifyClub(t.name) || (t.club === "scout" ? "pfadi" : t.amenity === "music_school" ? "musik" : null); if (!k) continue;
  const b = bounds.find(b => cross(c.lon, c.lat, b.segs) % 2 === 1); if (!b || !code[b.name]) continue;
  const key = code[b.name] + "|" + t.name.toLowerCase(); if (seen.has(key)) continue; seen.add(key);
  const w = t.website || t["contact:website"] || t.url || "";
  out[code[b.name]].push({ n: t.name, k, o: t["addr:city"] && t["addr:city"] !== b.name ? t["addr:city"] : "", u: "", w, _wd: wdTags(t) });
}
await fillSites([...out.zuerich, ...out.winterthur]);
const t = readFileSync("site/vereine.js", "utf8"), V = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
for (const c in out) { out[c].forEach(v => { delete v._wd; v.u = v.w; }); out[c].sort((a, b) => a.n.localeCompare(b.n, "de")); V.gemeinden[c] = out[c];
  console.log(CITIES[c] + ":", out[c].length, "Vereine für Kinder,", out[c].filter(v => v.w).length, "mit Website"); }
writeFileSync("site/vereine.js", "window.VEREINE=" + JSON.stringify(V) + ";\n");
