// Kinderfreundliche Restaurants und Cafés aus OpenStreetMap: Spielecke, Kinderstuhl, Kindermenü oder Spielplatz direkt nebenan
import { readFileSync, writeFileSync } from "node:fs";
import { alleGemeinden } from "./alle.mjs";
import { wdTags, fillSites } from "./web.mjs";
const G = alleGemeinden();
const names = Object.values(G).map(g => g.name), code = Object.fromEntries(Object.entries(G).map(([c, g]) => [g.name, c]));
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&");
const re = `^(${names.map(esc).join("|")})( \\\\(ZH\\\\))?$`;
const BB = "(47.15,8.35,47.70,9.00)";
const UA = { "User-Agent": "Familienagenda/1.0 (github.com/epperttobias-sys/fuer-familien-in-zuerich)" };
const q = `[out:json][timeout:300];(nwr["amenity"~"^(restaurant|cafe|biergarten)$"]["name"]${BB};);out center tags;` +
  `nwr["leisure"="playground"]${BB};out center;rel["boundary"="administrative"]["admin_level"="8"]["name"~"${re}"]${BB};out geom;`;
const hosts = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
let data;
for (let round = 0; round < 4 && !data; round++) { if (round) await new Promise(r => setTimeout(r, 45000));
  for (const h of hosts) { try { const r = await fetch(h, { method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
    if (!r.ok) throw new Error(r.status); data = await r.json(); console.log("ok", h); break; } catch (e) { console.log("fehler", h, e.message); } } }
if (!data) { console.log("keine Daten, alte Liste bleibt"); process.exit(0); }
const bounds = [], plays = [];
for (const e of data.elements) {
  if (e.type === "relation" && e.tags && e.tags.boundary === "administrative") bounds.push({ name: e.tags.name.replace(/ \(ZH\)$/, ""), segs: (e.members || []).filter(m => m.type === "way" && m.geometry).map(m => m.geometry.map(p => [p.lon, p.lat])) });
  else if (e.tags && e.tags.leisure === "playground" || (!e.tags && (e.center || e.lat))) { const c = e.center || e; plays.push([c.lat, c.lon]); }
}
const cross = (x, y, lines) => { let c = 0; for (const L of lines) for (let i = 1; i < L.length; i++) { const [x1, y1] = L[i - 1], [x2, y2] = L[i]; if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) c++; } return c; };
const M = 111320, dist = (a, b, c, d) => Math.hypot((d - b) * M * Math.cos(a * Math.PI / 180), (c - a) * M);
// Raster für schnelle Spielplatz-Suche
const grid = {}; for (const [la, lo] of plays) { const k = Math.floor(la * 200) + ":" + Math.floor(lo * 150); (grid[k] = grid[k] || []).push([la, lo]); }
const nearPlay = (la, lo) => { let best = 1e9; const gy = Math.floor(la * 200), gx = Math.floor(lo * 150);
  for (let y = gy - 1; y <= gy + 1; y++) for (let x = gx - 1; x <= gx + 1; x++) for (const [a, b] of grid[y + ":" + x] || []) best = Math.min(best, dist(la, lo, a, b)); return best; };
const yes = v => v && v !== "no";
const out = []; const seen = new Set();
for (const e of data.elements) {
  const t = e.tags || {}; if (!t.amenity || !t.name) continue; const c = e.center || e; if (c.lat == null) continue;
  if (t.takeaway === "only" || /kurier|take ?away|imbiss|kiosk|starbucks|mcdonald|burger king|subway|mensa|bäckerei|konditorei|confiserie/i.test(t.name)) continue;
  const f = [];
  if (yes(t["kids_area:indoor"]) || (yes(t.kids_area) && t["kids_area:outdoor"] !== "yes" && !t["kids_area:indoor"])) f.push("drinnen");
  if (yes(t["kids_area:outdoor"])) f.push("draussen");
  if (yes(t.highchair)) f.push("stuhl");
  if (yes(t.kids_menu) || yes(t["diet:kids"])) f.push("menu");
  const d = nearPlay(c.lat, c.lon); if (d <= 60) f.push("spielplatz");
  if (!f.some(k => ["spielplatz", "drinnen", "draussen"].includes(k))) continue; // nur mit Beschäftigung für Kinder
  const b = bounds.find(b => cross(c.lon, c.lat, b.segs) % 2 === 1); if (!b || !code[b.name]) continue;
  const key = t.name + b.name; if (seen.has(key)) continue; seen.add(key);
  out.push({ g: code[b.name], n: t.name, a: t.amenity, f, d: d <= 60 ? Math.round(d) : undefined, lat: +c.lat.toFixed(5), lon: +c.lon.toFixed(5),
    w: t.website || t["contact:website"] || t.url || "", _wd: wdTags(t), oh: t.opening_hours || "", cu: (t.cuisine || "").split(";").slice(0, 2).join(", "),
    adr: [[t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ")].filter(Boolean).join("") });
}
out.sort((a, b) => b.f.length - a.f.length || a.n.localeCompare(b.n, "de"));
const cnt = {}; out.forEach(x => x.f.forEach(k => cnt[k] = (cnt[k] || 0) + 1));
console.log("restaurants:", out.length, JSON.stringify(cnt), "spielplätze:", plays.length);
await fillSites(out);
writeFileSync("site/essen.js", "window.ESSEN=" + JSON.stringify({ stand: new Date().toISOString().slice(0, 10), orte: out }) + ";\n");
