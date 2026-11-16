// Holt Spielplätze aus OpenStreetMap (Overpass) für alle Gemeinden in gemeinden.json
import { readFileSync, writeFileSync } from "node:fs";
const G = JSON.parse(readFileSync(new URL("./gemeinden.json", import.meta.url)));
const names = Object.values(G).map(g => g.name);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&");
const q = `[out:json][timeout:180];area["ISO3166-2"="CH-ZH"]->.zh;` +
  `area["admin_level"="8"]["name"~"^(${names.map(esc).join("|")})( \\\\(ZH\\\\))?$"](area.zh)->.g;` +
  `foreach.g->.a(.a out tags;nwr["leisure"="playground"](area.a);out center tags;);`;
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
const out = {}; let cur = null;
for (const e of data.elements) {
  if (e.type === "area") { cur = e.tags.name.replace(/ \(ZH\)$/, ""); out[cur] = out[cur] || []; continue; }
  const t = e.tags || {}, c = e.center || e;
  if (["private", "no", "customers"].includes(t.access)) continue;
  const feat = Object.keys(t).filter(k => k.startsWith("playground:") && t[k] !== "no").map(k => k.slice(11));
  out[cur].push({ n: t.name || "", lat: +c.lat.toFixed(5), lon: +c.lon.toFixed(5),
    min: t.min_age || "", max: t.max_age || "", rs: t.wheelchair === "yes" ? 1 : 0, f: feat, desc: t.description || "" });
}
for (const k in out) out[k].sort((a, b) => (b.n ? 1 : 0) - (a.n ? 1 : 0) || a.n.localeCompare(b.n, "de"));
const miss = names.filter(n => !out[n]);
console.log(Object.entries(out).map(([k, v]) => `${k}: ${v.length}`).join(", "), "| fehlt:", miss.join(", ") || "-");
const res = { stand: new Date().toISOString().slice(0, 10), gemeinden: out };
writeFileSync("site/spielplaetze.js", "window.SPIELPLAETZE=" + JSON.stringify(res) + ";\n");
