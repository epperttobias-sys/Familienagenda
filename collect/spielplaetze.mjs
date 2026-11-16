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
for (let i = 0; i < Math.ceil((n0 - s0) / 0.08); i++) for (let j = 0; j < Math.ceil((e0 - w0) / 0.25); j++) tiles.push(`(${(s0 + i * 0.08).toFixed(2)},${(w0 + j * 0.25).toFixed(2)},${(s0 + (i + 1) * 0.08).toFixed(2)},${(w0 + (j + 1) * 0.25).toFixed(2)})`);
let got = 0;
for (const bb of tiles) {
  const eq = `[out:json][timeout:600];nwr["leisure"="playground"]${bb}->.all;foreach.all->.p(` +
    `way(around.p:70)["highway"]["name"]->.s;node(around.p:80)["amenity"~"^(drinking_water|fountain|water_point)$"]->.w;` +
    `node(around.p:30)["natural"="tree"]->.t;way(around.p:15)["natural"~"^(wood|tree_row)$"]->.wd;way(around.p:15)["landuse"="forest"]->.fo;` +
    `(.p;node(w.p);)->.pp;.pp is_in->.ia;area.ia["amenity"~"^(school|kindergarten)$"]->.sch;` +
    `make info ty=p.u(type()),i=p.u(id()),st=s.min(t["name"]),w=w.count(nodes),tr=t.count(nodes),wd=wd.count(ways)+fo.count(ways),sc=sch.count(areas););out;`;
  const d = await ask(eq); if (!d) continue;
  for (const e of d.elements) { const t = e.tags || {}; const p = byId[(t.ty || "?")[0] + t.i]; if (!p) continue; got++;
    if (!p.n && t.st) p.s = t.st; if (+t.w) p.w = 1; if (+t.tr) p.tr = +t.tr; if (+t.wd) p.wd = 1; if (+t.sc) p.sc = 1; }
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
