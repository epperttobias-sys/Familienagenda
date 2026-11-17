// Holt Spielplätze aus OpenStreetMap (Overpass) für alle Gemeinden in gemeinden.json
import { readFileSync, writeFileSync } from "node:fs";
import { alleGemeinden } from "./alle.mjs";
const G = alleGemeinden();
const names = Object.values(G).map(g => g.name);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&");
const re = `^(${names.map(esc).join("|")})( \\\\(ZH\\\\))?$`;
const BB = "(47.15,8.35,47.70,9.00)";
const q = `[out:json][timeout:180];(nwr["leisure"="playground"]${BB};);out center tags;` +
  `rel["boundary"="administrative"]["admin_level"="8"]["name"~"${re}"]${BB};out geom;`;
const hosts = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
async function ask(q) {
  for (let round = 0; round < 3; round++) { if (round) await new Promise(r => setTimeout(r, 45000));
  for (const h of hosts) {
    try {
      const r = await fetch(h, { method: "POST", headers: { "User-Agent": "Familienagenda/1.0 (github.com/epperttobias-sys/Familienagenda)", "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json(); console.log("ok", h); return j;
    } catch (e) { console.log("fehler", h, e.message); }
  }}
}
const data = await ask(q);
if (!data) { console.log("keine Daten, alte Liste bleibt"); process.exit(0); }
// Gemeindegrenzen als Ringe
const bounds = [];
for (const e of data.elements) if (e.type === "relation" && e.tags && e.tags.boundary === "administrative") {
  const rings = (e.members || []).filter(m => m.type === "way" && m.geometry && m.role !== "inner").map(m => m.geometry.map(p => [p.lon, p.lat]));
  bounds.push({ name: e.tags.name.replace(/ \(ZH\)$/, ""), segs: rings, inner: (e.members || []).filter(m => m.role === "inner" && m.geometry).map(m => m.geometry.map(p => [p.lon, p.lat])) });
}
// Punkt-in-Polygon über einzelne Wege (Strahl-Methode, Segmente müssen nicht verbunden sein)
const cross = (x, y, lines) => { let c = 0; for (const L of lines) for (let i = 1; i < L.length; i++) { const [x1, y1] = L[i - 1], [x2, y2] = L[i]; if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) c++; } return c; };
const out = {}; names.forEach(n => out[n] = []);
for (const e of data.elements) {
  if (e.tags && e.tags.boundary === "administrative") continue;
  const t = e.tags || {}, c = e.center || e; if (c.lat == null) continue;
  if (["private", "no", "customers"].includes(t.access)) continue;
  const g = bounds.find(b => (cross(c.lon, c.lat, b.segs) + cross(c.lon, c.lat, b.inner)) % 2 === 1); if (!g || !out[g.name]) continue;
  const feat = Object.keys(t).filter(k => k.startsWith("playground:") && t[k] !== "no").map(k => k.slice(11));
  if (t.playground) feat.push(...t.playground.split(";"));
  out[g.name].push({ id: e.type[0] + e.id, n: t.name || "", lat: +c.lat.toFixed(5), lon: +c.lon.toFixed(5),
    min: t.min_age || "", max: t.max_age || "", rs: t.wheelchair === "yes" ? 1 : 0, f: feat, desc: t.description || "",
    sh: t.shade === "yes" || t.covered === "yes" ? 1 : 0, dw: t.drinking_water === "yes" ? 1 : 0, oh: t.opening_hours || "", op: t.operator || "" });
}
// Umgebung aus OpenStreetMap: nächste Strasse, Trinkbrunnen, Bäume, Schulgelände (echte Einträge, keine Schätzung)
const all = Object.values(out).flat(), byId = Object.fromEntries(all.map(p => [p.id, p]));
let old = {}; try { const t = readFileSync("site/spielplaetze.js", "utf8"); const o = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
  for (const L of Object.values(o.gemeinden)) for (const p of L) old[p.lat + "," + p.lon] = p; } catch (e) {}
const [s0, w0, n0, e0] = [47.15, 8.35, 47.70, 9.00], tiles = [];
for (let la = s0; la < n0 - 1e-9; la += 0.06) for (let lo = w0; lo < e0 - 1e-9; lo += 0.12) tiles.push([la, lo, Math.min(la + 0.06, n0), Math.min(lo + 0.12, e0)]);
// einfache Abstandsrechnung in Metern (lokal flach)
const M = 111320, mx = lat => M * Math.cos(lat * Math.PI / 180);
const dist = (a, b, c, d) => Math.hypot((d - b) * mx(a), (c - a) * M);
const segDist = (la, lo, g) => { let best = 1e9; for (let i = 1; i < g.length; i++) { const ax = (g[i - 1].lon - lo) * mx(la), ay = (g[i - 1].lat - la) * M, bx = (g[i].lon - lo) * mx(la), by = (g[i].lat - la) * M;
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / ((dx * dx + dy * dy) || 1))); best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy)); } return best; };
const inPoly = (la, lo, g) => { let c = 0; for (let i = 1; i < g.length; i++) { const x1 = g[i - 1].lon, y1 = g[i - 1].lat, x2 = g[i].lon, y2 = g[i].lat; if ((y1 > la) !== (y2 > la) && lo < (x2 - x1) * (la - y1) / (y2 - y1) + x1) c++; } return c % 2 === 1; };
let got = 0;
for (const [la1, lo1, la2, lo2] of tiles) {
  const mine = all.filter(p => p.lat >= la1 && p.lat < la2 && p.lon >= lo1 && p.lon < lo2); if (!mine.length) continue;
  const bb = `(${(la1 - 0.002).toFixed(4)},${(lo1 - 0.003).toFixed(4)},${(la2 + 0.002).toFixed(4)},${(lo2 + 0.003).toFixed(4)})`;
  const eq = `[out:json][timeout:180];(node["amenity"~"^(drinking_water|fountain|water_point)$"]${bb};node["natural"="tree"]${bb};);out;` +
    `(way["amenity"~"^(school|kindergarten)$"]${bb};way["natural"~"^(wood|tree_row)$"]${bb};way["landuse"="forest"]${bb};way["highway"~"^(residential|living_street|pedestrian|footway|path|tertiary|unclassified|service|secondary)$"]["name"]${bb};);out geom;`;
  const d = await ask(eq); if (!d) continue;
  const water = [], trees = [], schools = [], woods = [], streets = [];
  for (const e of d.elements) { const t = e.tags || {};
    if (e.type === "node") (t.natural === "tree" ? trees : water).push(e);
    else if (e.geometry) { if (t.amenity) schools.push(e.geometry); else if (t.highway) streets.push([t.name, e.geometry]); else woods.push(e.geometry); } }
  for (const p of mine) { got++;
    if (water.some(w => dist(p.lat, p.lon, w.lat, w.lon) <= 80)) p.w = 1;
    const tr = trees.filter(t => dist(p.lat, p.lon, t.lat, t.lon) <= 30).length; if (tr) p.tr = tr;
    if (woods.some(g => segDist(p.lat, p.lon, g) <= 15 || (g.length > 3 && inPoly(p.lat, p.lon, g)))) p.wd = 1;
    if (schools.some(g => g.length > 3 && inPoly(p.lat, p.lon, g))) p.sc = 1;
    if (!p.n) { let best = 71, nm = ""; for (const [n, g] of streets) { const x = segDist(p.lat, p.lon, g); if (x < best) { best = x; nm = n; } } if (nm) p.s = nm; }
  }
  console.log("gebiet", bb, mine.length, "spielplätze");
}
console.log("umgebung:", got, "von", all.length);
for (const p of all) { const o = old[p.lat + "," + p.lon]; if (!o || p.s || p.w || p.tr || p.wd || p.sc) continue; for (const k of ["s", "w", "tr", "wd", "sc"]) if (o[k]) p[k] = o[k]; }
for (const p of Object.values(out).flat()) delete p.id;
console.log("grenzen:", bounds.map(b => b.name).join(", "));
for (const k in out) out[k].sort((a, b) => (b.n ? 1 : 0) - (a.n ? 1 : 0) || (a.n || a.s || "~").localeCompare(b.n || b.s || "~", "de"));
const miss = names.filter(n => !out[n].length);
console.log(Object.entries(out).map(([k, v]) => `${k}: ${v.length}`).join(", "), "| fehlt:", miss.join(", ") || "-");
const res = { stand: new Date().toISOString().slice(0, 10), gemeinden: out };
writeFileSync("site/spielplaetze.js", "window.SPIELPLAETZE=" + JSON.stringify(res) + ";\n");
