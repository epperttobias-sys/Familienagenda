// Kinderarztpraxen und Apotheken aus OpenStreetMap, pro Gemeinde (Kanton Zürich)
import { writeFileSync } from "node:fs";
import { alleGemeinden } from "./alle.mjs";
const G = alleGemeinden();
const names = Object.values(G).map(g => g.name), code = Object.fromEntries(Object.entries(G).map(([c, g]) => [g.name, c]));
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&");
const re = `^(${names.map(esc).join("|")})( \\\\(ZH\\\\))?$`;
const BB = "(47.15,8.35,47.70,9.00)";
const UA = { "User-Agent": "Familienagenda/1.0 (github.com/epperttobias-sys/fuer-familien-in-zuerich)" };
const q = `[out:json][timeout:300];(nwr["amenity"="pharmacy"]${BB};nwr["healthcare"="pharmacy"]${BB};` +
  `nwr["healthcare:speciality"~"paediatric"]${BB};nwr["amenity"="doctors"]["name"~"Kinder|Pädiatr|Paediatr|Pediatr|Kids|Kinderärzt",i]${BB};nwr["healthcare"="doctor"]["name"~"Kinder|Pädiatr|Paediatr|Pediatr|Kids",i]${BB};);out center tags;` +
  `rel["boundary"="administrative"]["admin_level"="8"]["name"~"${re}"]${BB};out geom;`;
const hosts = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
let data;
for (let round = 0; round < 4 && !data; round++) { if (round) await new Promise(r => setTimeout(r, 45000));
  for (const h of hosts) { try { const r = await fetch(h, { method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
    if (!r.ok) throw new Error(r.status); data = await r.json(); console.log("ok", h); break; } catch (e) { console.log("fehler", h, e.message); } } }
if (!data) { console.log("keine Daten, alte Liste bleibt"); process.exit(0); }
const bounds = [];
for (const e of data.elements) if (e.type === "relation" && e.tags && e.tags.boundary === "administrative")
  bounds.push({ name: e.tags.name.replace(/ \(ZH\)$/, ""), segs: (e.members || []).filter(m => m.type === "way" && m.geometry).map(m => m.geometry.map(p => [p.lon, p.lat])) });
const cross = (x, y, lines) => { let c = 0; for (const L of lines) for (let i = 1; i < L.length; i++) { const [x1, y1] = L[i - 1], [x2, y2] = L[i]; if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) c++; } return c; };
const aerzte = [], apo = [], seen = new Set();
for (const e of data.elements) {
  const t = e.tags || {}; if (e.type === "relation" && t.boundary) continue; const c = e.center || e; if (c.lat == null || !t.name) continue;
  const isApo = t.amenity === "pharmacy" || t.healthcare === "pharmacy";
  if (!isApo && /tierarzt|veterin|zahn|dental/i.test(t.name + " " + (t["healthcare:speciality"] || ""))) continue;
  const b = bounds.find(b => cross(c.lon, c.lat, b.segs) % 2 === 1); if (!b || !code[b.name]) continue;
  const key = (isApo ? "a" : "k") + t.name + b.name; if (seen.has(key)) continue; seen.add(key);
  const x = { g: code[b.name], n: t.name, lat: +c.lat.toFixed(5), lon: +c.lon.toFixed(5), w: t.website || t["contact:website"] || "",
    tel: t.phone || t["contact:phone"] || "", oh: t.opening_hours || "", adr: [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ") };
  (isApo ? apo : aerzte).push(x);
}
aerzte.sort((a, b) => a.n.localeCompare(b.n, "de")); apo.sort((a, b) => a.n.localeCompare(b.n, "de"));
console.log("kinderärzte:", aerzte.length, "apotheken:", apo.length);
writeFileSync("site/gesundheit.js", "window.GESUNDHEIT=" + JSON.stringify({ stand: new Date().toISOString().slice(0, 10), aerzte, apo }) + ";\n");
