// Ausflugsziele aus OpenStreetMap für die Region (Bezirke Uster, Meilen, Pfäffikon, Hinwil)
import { readFileSync, writeFileSync } from "node:fs";
import { alleGemeinden } from "./alle.mjs";
import { wdTags, fillSites } from "./web.mjs";
const G = alleGemeinden();
const names = Object.values(G).map(g => g.name), code = Object.fromEntries(Object.entries(G).map(([c, g]) => [g.name, c]));
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&");
const re = `^(${names.map(esc).join("|")})( \\\\(ZH\\\\))?$`;
const BB = "(47.15,8.35,47.70,9.00)";
const q = `[out:json][timeout:240];(` +
  `nwr["tourism"~"^(zoo|museum|theme_park|attraction|viewpoint|aquarium)$"]["name"]${BB};` +
  `nwr["historic"~"^(castle|ruins|fort)$"]["name"]${BB};` +
  `nwr["man_made"="tower"]["tower:type"="observation"]${BB};` +
  `nwr["leisure"~"^(miniature_golf|trampoline_park|amusement_arcade|ice_rink|adventure_park|high_ropes_course)$"]["name"]${BB};` +
  `nwr["leisure"="sports_centre"]["sport"~"climbing|bouldering"]["name"]${BB};` +
  `nwr["animal_keeping"]["name"]["access"!="private"]${BB};nwr["farm"="petting_zoo"]${BB};` +
  `nwr["leisure"="firepit"]["name"]${BB};nwr["amenity"="bbq"]["name"]${BB};` +
  `);out center tags;rel["boundary"="administrative"]["admin_level"="8"]["name"~"${re}"]${BB};out geom;`;
const hosts = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
let data;
for (let round = 0; round < 4 && !data; round++) { if (round) await new Promise(r => setTimeout(r, 45000));
for (const h of hosts) {
  try { const r = await fetch(h, { method: "POST", headers: { "User-Agent": "Familienagenda/1.0 (github.com/epperttobias-sys/fuer-familien-in-zuerich)", "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
    if (!r.ok) throw new Error(r.status); data = await r.json(); console.log("ok", h); break; } catch (e) { console.log("fehler", h, e.message); }
}}
if (!data) { console.log("keine Daten, alte Liste bleibt"); process.exit(0); }
const bounds = [];
for (const e of data.elements) if (e.type === "relation" && e.tags && e.tags.boundary === "administrative")
  bounds.push({ name: e.tags.name.replace(/ \(ZH\)$/, ""), segs: (e.members || []).filter(m => m.type === "way" && m.geometry).map(m => m.geometry.map(p => [p.lon, p.lat])) });
const cross = (x, y, lines) => { let c = 0; for (const L of lines) for (let i = 1; i < L.length; i++) { const [x1, y1] = L[i - 1], [x2, y2] = L[i]; if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) c++; } return c; };
const SKIP = /^(ente|gans|huhn|hahn|pfau|ziege|esel|schaf|kuh|pferd)$|triebwagen|güterwagen|personenwagen|lokomotive|friedhof|denkmal|gedenk|grab|wegkreuz|bildstock|brunnen$|kapelle|kirche|parkplatz|bushaltestelle|haltestelle|hotel|restaurant|tankstelle|swisscom|antenne|funkturm|sendeturm|wasserturm|hochspannung|stall\b|schützenhaus/i;
function kind(t) {
  if (t.man_made === "tower") return "aussicht";
  if (t.tourism === "zoo" || t.tourism === "aquarium" || t.farm === "petting_zoo" || (t.animal_keeping && /tier|zoo|alpaka|lama|esel|ponny|pony|streichel|wildpark|vogel/i.test(t.name || ""))) return "tiere";
  if (t.tourism === "museum") return "museum";
  if (t.tourism === "theme_park" || t.leisure) return t.leisure === "firepit" ? "feuer" : "erlebnis";
  if (t.amenity === "bbq") return "feuer";
  if (t.historic) return "burg";
  if (t.tourism === "viewpoint" || t.man_made === "tower") return "aussicht";
  if (t.tourism === "attraction") return "sehens";
  return null;
}
const INDOOR = new Set(["museum"]);
const out = []; const seen = new Set();
for (const e of data.elements) {
  if (e.type === "relation" && e.tags && e.tags.boundary === "administrative") continue;
  const t = e.tags || {}, c = e.center || e; if (c.lat == null) continue;
  let name = t.name || (t.man_made === "tower" ? "Aussichtsturm" : ""); if (!name || SKIP.test(name)) continue;
  if (["private", "no"].includes(t.access)) continue;
  const k = kind(t); if (!k) continue;
  const b = bounds.find(b => cross(c.lon, c.lat, b.segs) % 2 === 1); if (!b || !code[b.name]) continue;
  const key = name + b.name; if (seen.has(key)) continue; seen.add(key);
  const wp = t.wikipedia && /^de:/.test(t.wikipedia) ? "https://de.wikipedia.org/wiki/" + encodeURIComponent(t.wikipedia.slice(3).replace(/ /g, "_")) : "";
  const indoor = INDOOR.has(k) || t.indoor === "yes" || t.leisure === "trampoline_park" || t.leisure === "amusement_arcade" || t.leisure === "sports_centre" || t.leisure === "ice_rink" ? 1 : 0;
  out.push({ g: code[b.name], k, n: name, lat: +c.lat.toFixed(5), lon: +c.lon.toFixed(5), d: (t.description || "").slice(0, 200),
    w: t.website || t["contact:website"] || t.url || "", _wd: wdTags(t), wp, oh: t.opening_hours || "", in: indoor, fee: t.fee === "no" ? 0 : t.fee === "yes" ? 1 : null });
}
out.sort((a, b) => a.k.localeCompare(b.k) || a.n.localeCompare(b.n, "de"));
const cnt = {}; out.forEach(x => cnt[x.k] = (cnt[x.k] || 0) + 1);
console.log("ausflugsziele:", out.length, JSON.stringify(cnt));
await fillSites(out);
writeFileSync("site/ausflug.js", "window.AUSFLUG=" + JSON.stringify({ stand: new Date().toISOString().slice(0, 10), ziele: out }) + ";\n");
