// Monatlich: Standorte grosser Kita-Ketten aus ihren Sitemaps (globegarden, KiMi, fugu, Güxi, pop e poppa).
// Adresse von der Standortseite, Koordinaten und Gemeinde über geo.admin.ch. Schreibt data/ketten.json
// im gleichen Format wie data/gemeinde-seiten.json.
import { readFileSync, writeFileSync } from "node:fs";

const G = JSON.parse(readFileSync("site/gemeinden.js", "utf8").replace(/^[^=]*=\s*/, "").replace(/;\s*$/, ""));
const byName = Object.fromEntries(Object.entries(G).map(([c, g]) => [g.name.toLowerCase(), c]));
const UA = { "User-Agent": "Mozilla/5.0 (compatible; FamilienZuerichBot/1.0; +https://epperttobias-sys.github.io/fuer-familien-in-zuerich/)", "Accept-Language": "de-CH,de;q=0.9" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dec = s => s.replace(/&amp;/g, "&").replace(/&#0?39;|&rsquo;/g, "'").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));
const txt = h => dec(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const ADR = /([A-ZÄÖÜ][a-zäöüé-]+(?:strasse|str\.|weg|gasse|platz|rain|halde|hof|acker|matt|wies|ring|allee|steig|berg|graben|park|boulevard)\s+\d+[a-z]?|Boulevard [A-Z][a-z]+ \d+)\s*,?\s*(8\d{3})\s+([A-ZÄÖÜ][\wäöüéè.-]+(?: [a-zA-Zäöü.-]+){0,3})/;

const CHAINS = [
  { name: "globegarden", sitemap: "https://www.globegarden.ch/?sitemap=kitas&type=1533906435&cHash=59fc915ec52b707a8bae796aec3652bc", keep: /\/locations\/[^/]+\/?$/ },
  { name: "KiMi Krippen", sitemap: "https://www.kimikrippen.ch/kimi_standort-sitemap.xml", keep: /kimi_standort\/[^/]+\/?$/ },
  { name: "Kita fugu", sitemap: "https://www.kitafugu.ch/local-sitemap.xml", keep: /kitafugu\.ch\/[^/]+\/?$/ },
  { name: "Güxi", sitemap: "https://www.guexi.ch/sitemap_index.xml", keep: /\/standorte\/[^/]+\/?$/ },
  { name: "pop e poppa", sitemap: "https://www.popepoppa.ch/sitemap_index.xml", keep: /\/(standorte|kitas?|locations?)\/[^/]+\/?$/ },
];

async function get(u) { const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error("HTTP " + r.status); await sleep(500); return r.text(); }
async function locs(u, depth = 0) {
  const x = await get(u); const L = [...x.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => dec(m[1]));
  if (/<sitemapindex/i.test(x) && depth < 1) { const out = []; for (const s of L) { try { out.push(...await locs(s, depth + 1)); } catch {} } return out; }
  return L;
}
async function geo(q) {
  const r = await fetch("https://api3.geo.admin.ch/rest/services/api/SearchServer?type=locations&origins=address&limit=1&sr=4326&searchText=" + encodeURIComponent(q), { headers: UA, signal: AbortSignal.timeout(10000) });
  const a = (await r.json()).results?.[0]?.attrs; return a ? [+a.lat.toFixed(5), +a.lon.toFixed(5)] : null;
}
async function gemeinde(lat, lon) {
  const u = `https://api3.geo.admin.ch/rest/services/api/MapServer/identify?geometryType=esriGeometryPoint&geometry=${lon},${lat}&sr=4326&layers=all:ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill&tolerance=0&returnGeometry=false&imageDisplay=10,10,96&mapExtent=${lon - 0.01},${lat - 0.01},${lon + 0.01},${lat + 0.01}`;
  const j = await (await fetch(u, { headers: UA, signal: AbortSignal.timeout(10000) })).json();
  const p = j.results?.[0]?.attributes; return p ? { name: p.gemname || p.label, kt: p.kanton || p.kt_kz } : null;
}

const out = {}, log = [];
for (const ch of CHAINS) {
  let urls = []; try { urls = (await locs(ch.sitemap)).filter(u => ch.keep.test(u)); } catch (e) { log.push(ch.name + ": " + e.message); continue; }
  urls = [...new Set(urls.map(u => u.replace(/\/$/, "")))].filter(u => !/\/(en|fr|it)\//.test(u));
  let n = 0;
  for (const u of urls) {
    try {
      const h = await get(u), t = txt((h.match(/<main[\s\S]*?<\/main>/i) || [h])[0]);
      const a = t.match(ADR); if (!a) continue;
      const title = txt((h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || (h.match(/<title>([^<]*)/i) || [])[1] || "").split(/ [|–-] /)[0].trim();
      const p = await geo(`${a[1]} ${a[2]} ${a[3]}`); if (!p) continue;
      const gm = await gemeinde(p[0], p[1]); if (!gm) continue;
      const code = byName[String(gm.name).toLowerCase()] || byName[String(gm.name).replace(/ \(ZH\)$/, "").toLowerCase()]; if (!code) continue;
      let name = title && title.length < 70 ? title : `${ch.name} ${a[3]}`;
      if (!name.toLowerCase().includes(ch.name.split(" ")[0].toLowerCase().slice(0, 4))) name = `${ch.name} ${name}`;
      (out[code] = out[code] || { items: [] }).items.push({ k: "kita", n: name, w: u, a: `${a[1]}, ${a[3]}`, lat: p[0], lon: p[1], src: u });
      n++;
    } catch {}
  }
  log.push(`${ch.name}: ${urls.length} Seiten, ${n} Standorte im Kanton Zürich`);
}
writeFileSync("data/ketten.json", JSON.stringify({ stand: new Date().toISOString().slice(0, 10), g: out }, null, 1));
console.log(log.join("\n"));
