// Familienangebote aus OpenStreetMap: Kitas, Bibliotheken, Ludotheken, Bäder, Familienzentren
import { readFileSync, writeFileSync } from "node:fs";
const G = JSON.parse(readFileSync(new URL("./gemeinden.json", import.meta.url)));
const names = Object.values(G).map(g => g.name), code = Object.fromEntries(Object.entries(G).map(([c, g]) => [g.name, c]));
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&");
const re = `^(${names.map(esc).join("|")})( \\\\(ZH\\\\))?$`;
const BB = "(47.20,8.52,47.52,9.02)";
const q = `[out:json][timeout:240];(` +
  `nwr["amenity"="childcare"]${BB};nwr["amenity"="kindergarten"]["name"~"kita|krippe|hort|tagesst|kinderhaus|spielgruppe",i]${BB};` +
  `nwr["amenity"="library"]${BB};nwr["amenity"="toy_library"]${BB};` +
  `nwr["leisure"="sports_centre"]["sport"~"swimming"]${BB};nwr["leisure"="water_park"]${BB};nwr["amenity"="public_bath"]${BB};nwr["leisure"="bathing_place"]${BB};` +
  `nwr["amenity"="community_centre"]${BB};nwr["amenity"="social_facility"]["social_facility:for"~"child|famil"]${BB};` +
  `);out center tags;rel["boundary"="administrative"]["admin_level"="8"]["name"~"${re}"]${BB};out geom;`;
const hosts = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
let data;
for (const h of hosts) {
  try { const r = await fetch(h, { method: "POST", headers: { "User-Agent": "Familienagenda/1.0 (github.com/epperttobias-sys/Familienagenda)", "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
    if (!r.ok) throw new Error(r.status); data = await r.json(); console.log("ok", h); break; } catch (e) { console.log("fehler", h, e.message); }
}
if (!data) { console.log("keine Daten, alte Liste bleibt"); process.exit(0); }
const bounds = [];
for (const e of data.elements) if (e.type === "relation" && e.tags && e.tags.boundary === "administrative")
  bounds.push({ name: e.tags.name.replace(/ \(ZH\)$/, ""), segs: (e.members || []).filter(m => m.type === "way" && m.geometry).map(m => m.geometry.map(p => [p.lon, p.lat])) });
const cross = (x, y, lines) => { let c = 0; for (const L of lines) for (let i = 1; i < L.length; i++) { const [x1, y1] = L[i - 1], [x2, y2] = L[i]; if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) c++; } return c; };
function kind(t) {
  if (t.amenity === "toy_library") return "ludo";
  if (t.amenity === "library") return /ludothek/i.test(t.name || "") ? "ludo" : "bib";
  if (t.amenity === "childcare" || t.amenity === "kindergarten") return /spielgruppe/i.test(t.name || "") ? "spiel" : "kita";
  if (t.leisure === "sports_centre" || t.leisure === "water_park" || t.amenity === "public_bath" || t.leisure === "bathing_place") return "bad";
  if (t.amenity === "community_centre" || t.amenity === "social_facility") {
    const n = (t.name || "") + " " + (t["community_centre:for"] || "") + " " + (t["social_facility:for"] || "");
    if (/famil|eltern|kind|child|gemeinschaftszentrum|\bgz\b|quartier|jugend|robinson|treff/i.test(n)) return "zentrum";
  }
  return null;
}
const out = {}; const seen = new Set();
for (const e of data.elements) {
  if (e.type === "relation" && e.tags && e.tags.boundary === "administrative") continue;
  const t = e.tags || {}, c = e.center || e; if (c.lat == null || !t.name) continue;
  if (["private", "no"].includes(t.access)) continue;
  const k = kind(t); if (!k) continue;
  const b = bounds.find(b => cross(c.lon, c.lat, b.segs) % 2 === 1); if (!b || !code[b.name]) continue;
  const key = k + t.name + b.name; if (seen.has(key)) continue; seen.add(key);
  const addr = [[t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" "), t["addr:city"] || ""].filter(Boolean).join(", ");
  (out[code[b.name]] = out[code[b.name]] || []).push({ k, n: t.name, lat: +c.lat.toFixed(5), lon: +c.lon.toFixed(5), a: addr,
    w: t.website || t["contact:website"] || "", oh: t.opening_hours || "" });
}
for (const c in out) out[c].sort((a, b) => a.k.localeCompare(b.k) || a.n.localeCompare(b.n, "de"));
const cnt = {}; Object.values(out).flat().forEach(x => cnt[x.k] = (cnt[x.k] || 0) + 1);
console.log("familienangebote:", JSON.stringify(cnt), "gemeinden:", Object.keys(out).length);
writeFileSync("site/familie.js", "window.FAMILIE=" + JSON.stringify({ stand: new Date().toISOString().slice(0, 10), gemeinden: out }) + ";\n");
