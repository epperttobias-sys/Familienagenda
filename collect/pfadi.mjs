// Pfadi-Abteilungen im Kanton Zürich aus dem Pfadi-Finder der Pfadibewegung Schweiz (pfadi.swiss),
// pro Gemeinde zugeordnet (Gemeindegrenzen aus OpenStreetMap), mit der Website der Abteilung.
// Ergänzt die Vereinslisten (site/vereine.js): fehlende Abteilungen dazu, fehlende Websites ergänzt.
import { readFileSync, writeFileSync } from "node:fs";
import { alleGemeinden } from "./alle.mjs";
const G = alleGemeinden();
const names = Object.values(G).map(g => g.name), code = Object.fromEntries(Object.entries(G).map(([c, g]) => [g.name, c]));
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&");
const re = `^(${names.map(esc).join("|")})( \\\\(ZH\\\\))?$`;
const BB = "(47.15,8.35,47.70,9.00)", UA = { "User-Agent": "Familienagenda/1.0 (github.com/epperttobias-sys/fuer-familien-in-zuerich)" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async u => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(r.status); return r.text(); };
const dec = s => s.replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

// 1. alle Abteilungen mit Standort
const base = "https://pfadi.swiss/de/finder-embed/";
const list = await get(base + "find/?bg=ffffff");
const ab = [];
for (const p of list.split('<article class="pfadi-item"').slice(1)) {
  const h = p.match(/href="\.\/(detail\/[^"]+)">([^<]+)/), ll = p.match(/data-lat="([\d.]+)" data-lng="([\d.]+)"/);
  if (!h || !ll) continue;
  const lat = +ll[1], lon = +ll[2];
  if (lat < 47.15 || lat > 47.70 || lon < 8.35 || lon > 9.0) continue;
  const stufen = (p.match(/<p>([^<]*stufe[^<]*)<\/p>/) || [])[1] || "";
  ab.push({ n: dec(h[2]), url: base + h[1], lat, lon, stufen: dec(stufen).replace(/,\s*$/, "") });
}
console.log("Abteilungen im Raum Zürich:", ab.length);

// 2. Gemeindegrenzen
const q = `[out:json][timeout:300];rel["boundary"="administrative"]["admin_level"="8"]["name"~"${re}"]${BB};out geom;`;
let data;
for (let round = 0; round < 4 && !data; round++) { if (round) await sleep(45000);
  for (const h of ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]) {
    try { const r = await fetch(h, { method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
      if (!r.ok) throw new Error(r.status); data = await r.json(); break; } catch (e) { console.log("fehler", h, e.message); } } }
if (!data) { console.log("keine Gemeindegrenzen, nichts geändert"); process.exit(0); }
const bounds = data.elements.map(e => ({ name: e.tags.name.replace(/ \(ZH\)$/, ""), segs: (e.members || []).filter(m => m.type === "way" && m.geometry).map(m => m.geometry.map(p => [p.lon, p.lat])) }));
const cross = (x, y, lines) => { let c = 0; for (const L of lines) for (let i = 1; i < L.length; i++) { const [x1, y1] = L[i - 1], [x2, y2] = L[i]; if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) c++; } return c; };

// 3. Website von der Detailseite
const t = readFileSync("site/vereine.js", "utf8"), V = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
const norm = s => s.toLowerCase().replace(/pfadi(abteilung|korps)?|abteilung|\bpfa\b|[^a-zäöü0-9]+/g, " ").replace(/\s+/g, " ").trim();
let neu = 0, web = 0;
for (const a of ab) {
  const b = bounds.find(b => cross(a.lon, a.lat, b.segs) % 2 === 1); if (!b || !code[b.name]) continue;
  const c = code[b.name];
  let w = "";
  try { const d = await get(a.url); w = (d.match(/<strong>Webseite<\/strong>\s*<br\/?>\s*<a href="(https?:\/\/[^"]+)"/) || [])[1] || ""; } catch {}
  await sleep(400);
  const L = V.gemeinden[c] = V.gemeinden[c] || [];
  const key = norm(a.n), hit = L.find(v => v.k === "pfadi" && /pfadi|pfa\b|scout/i.test(v.n) && key && (norm(v.n).includes(key) || key.includes(norm(v.n))));
  if (hit) { if (!hit.w && w) { hit.w = w; web++; } continue; }
  L.push({ n: /pfadi|scout/i.test(a.n) ? a.n : "Pfadi " + a.n, k: "pfadi", o: "", u: w, w });
  neu++;
}
for (const c in V.gemeinden) V.gemeinden[c].sort((a, b) => a.n.localeCompare(b.n, "de"));
writeFileSync("site/vereine.js", "window.VEREINE=" + JSON.stringify(V) + ";\n");
console.log("neu:", neu, "Website ergänzt:", web);
