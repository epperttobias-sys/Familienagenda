// Ermittelt alle Gemeinden im Kanton Zürich mit Bezirk und prüft, welches Website-System sie verwenden.
import { readFileSync, writeFileSync } from "node:fs";
const UA = { "User-Agent": "Familienagenda/1.0 (github.com/epperttobias-sys/fuer-familien-in-zuerich)" };
const hosts = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const q = `[out:json][timeout:300];area["ISO3166-2"="CH-ZH"]->.zh;rel(area.zh)["boundary"="administrative"]["admin_level"="6"];out geom;rel(area.zh)["boundary"="administrative"]["admin_level"="8"];out center tags;`;
let data;
for (let round = 0; round < 3 && !data; round++) for (const h of hosts) {
  try { const r = await fetch(h, { method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
    if (!r.ok) throw new Error(r.status); data = await r.json(); console.log("ok", h); break; } catch (e) { console.log("fehler", h, e.message); }
}
if (!data) { console.log("Overpass nicht erreichbar"); process.exit(1); }
const cross = (x, y, lines) => { let c = 0; for (const L of lines) for (let i = 1; i < L.length; i++) { const [x1, y1] = L[i - 1], [x2, y2] = L[i]; if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) c++; } return c; };
const bez = data.elements.filter(e => e.tags && e.tags.admin_level === "6").map(e => ({ name: e.tags.name.replace(/^Bezirk /, ""), segs: (e.members || []).filter(m => m.type === "way" && m.geometry).map(m => m.geometry.map(p => [p.lon, p.lat])) }));
const gem = data.elements.filter(e => e.tags && e.tags.admin_level === "8" && e.center).map(e => {
  const b = bez.find(b => cross(e.center.lon, e.center.lat, b.segs) % 2 === 1);
  return { name: e.tags.name.replace(/ \(ZH\)$/, ""), bezirk: b ? b.name : "?", website: e.tags.website || e.tags["contact:website"] || "", lat: +e.center.lat.toFixed(3), lon: +e.center.lon.toFixed(3) };
});
console.log("Bezirke:", bez.map(b => b.name).join(", "), "| Gemeinden:", gem.length);
const slug = s => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ /g, "-").replace(/[^a-z0-9-]/g, "");
async function get(url) { try { const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) }); return r.ok ? { url: r.url, html: await r.text() } : null; } catch { return null; } }
const isIweb = h => /data-entities="/.test(h) && /_rte\/anlass\//.test(h);
const isItem = h => /class="[^"]*event-item/.test(h) && /\/event\/\d+\/eventdate\/\d+/.test(h);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = [];
for (const g of gem) {
  const cands = [];
  if (g.website) cands.push(g.website.replace(/^http:/, "https:").replace(/\/$/, ""));
  cands.push(`https://www.${slug(g.name)}.ch`, `https://www.${slug(g.name)}-zh.ch`);
  let res = { ...g, domain: "", system: "", path: "" };
  for (const c of cands) {
    const home = await get(c); if (!home) continue;
    const domain = new URL(home.url).host; res.domain = domain;
    const t = await get(`https://${domain}/anlaesseaktuelles`);
    if (t && isIweb(t.html)) { res.system = "iweb"; break; }
    const links = [...new Set([...home.html.matchAll(/href="([^"#]+)"/g)].map(m => m[1]).filter(h => /veranstaltung|anl(a|ä|ae)ss|agenda|event|kalender/i.test(h)))].slice(0, 8);
    for (const l of links) {
      let u; try { u = new URL(l, home.url); } catch { continue; } if (u.host !== domain) continue;
      const p = await get(u.href); await sleep(300); if (!p) continue;
      if (isIweb(p.html)) { res.system = "iweb"; res.path = u.pathname; break; }
      if (isItem(p.html)) { res.system = "eventitem"; res.path = u.pathname; break; }
    }
    break;
  }
  out.push(res); console.log(`${res.bezirk} | ${res.name} | ${res.domain || "-"} | ${res.system || "?"} ${res.path}`);
  await sleep(300);
}
writeFileSync("data/discover.json", JSON.stringify(out, null, 1));
const c = {}; out.forEach(x => c[x.system || "unbekannt"] = (c[x.system || "unbekannt"] || 0) + 1); console.log(JSON.stringify(c));
