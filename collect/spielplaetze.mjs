// Holt Spielplätze aus OpenStreetMap (Overpass) für alle Gemeinden in gemeinden.json
import { readFileSync, writeFileSync } from "node:fs";
const G = JSON.parse(readFileSync(new URL("./gemeinden.json", import.meta.url)));
const names = Object.values(G).map(g => g.name);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&");
const re = `^(${names.map(esc).join("|")})( \\\\(ZH\\\\))?$`;
const BB = "(47.20,8.52,47.52,9.02)";
const q = `[out:json][timeout:180];(nwr["leisure"="playground"]${BB};);out center tags;` +
  `rel["boundary"="administrative"]["admin_level"="8"]["name"~"${re}"]${BB};out geom tags;`;
const hosts = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
let data;
for (const h of hosts) {
  try {
    const r = await fetch(h, { method: "POST", headers: { "User-Agent": "Familienagenda/1.0 (github.com/epperttobias-sys/Familienagenda)", "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
    if (!r.ok) throw new Error(r.status);
    data = await r.json(); console.log("ok", h); break;
  } catch (e) { console.log("fehler", h, e.message); }
}
if (!data) { console.log("keine Daten, alte Liste bleibt"); process.exit(0); }
// Gemeindegrenzen als Ringe
const bounds = [];
for (const e of data.elements) if (e.type === "relation") {
  const rings = (e.members || []).filter(m => m.type === "way" && m.geometry && m.role !== "inner").map(m => m.geometry.map(p => [p.lon, p.lat]));
  bounds.push({ name: e.tags.name.replace(/ \(ZH\)$/, ""), segs: rings, inner: (e.members || []).filter(m => m.role === "inner" && m.geometry).map(m => m.geometry.map(p => [p.lon, p.lat])) });
}
// Punkt-in-Polygon über einzelne Wege (Strahl-Methode, Segmente müssen nicht verbunden sein)
const cross = (x, y, lines) => { let c = 0; for (const L of lines) for (let i = 1; i < L.length; i++) { const [x1, y1] = L[i - 1], [x2, y2] = L[i]; if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) c++; } return c; };
const out = {}; names.forEach(n => out[n] = []);
for (const e of data.elements) {
  if (e.type === "relation") continue;
  const t = e.tags || {}, c = e.center || e; if (c.lat == null) continue;
  if (["private", "no", "customers"].includes(t.access)) continue;
  const g = bounds.find(b => (cross(c.lon, c.lat, b.segs) + cross(c.lon, c.lat, b.inner)) % 2 === 1); if (!g || !out[g.name]) continue;
  const feat = Object.keys(t).filter(k => k.startsWith("playground:") && t[k] !== "no").map(k => k.slice(11));
  if (t.playground) feat.push(...t.playground.split(";"));
  out[g.name].push({ n: t.name || "", lat: +c.lat.toFixed(5), lon: +c.lon.toFixed(5),
    min: t.min_age || "", max: t.max_age || "", rs: t.wheelchair === "yes" ? 1 : 0, f: feat, desc: t.description || "" });
}
console.log("grenzen:", bounds.map(b => b.name).join(", "));
for (const k in out) out[k].sort((a, b) => (b.n ? 1 : 0) - (a.n ? 1 : 0) || a.n.localeCompare(b.n, "de"));
const miss = names.filter(n => !out[n].length);
console.log(Object.entries(out).map(([k, v]) => `${k}: ${v.length}`).join(", "), "| fehlt:", miss.join(", ") || "-");
const res = { stand: new Date().toISOString().slice(0, 10), gemeinden: out };
writeFileSync("site/spielplaetze.js", "window.SPIELPLAETZE=" + JSON.stringify(res) + ";\n");
