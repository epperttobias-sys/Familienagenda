// Prüft noch fehlende Gemeinden gezielt: bekannte Domains und mehrere typische Agenda-Pfade
import { readFileSync, writeFileSync } from "node:fs";
const D = JSON.parse(readFileSync("data/discover.json", "utf8"));
const G = JSON.parse(readFileSync("collect/gemeinden.json", "utf8"));
const have = new Set(Object.values(G).map(g => g.name));
const EXTRA = { "Aeugst am Albis": ["www.aeugst-albis.ch"], "Hausen am Albis": ["www.hausen.ch"], "Oetwil an der Limmat": ["www.oetwil-limmat.ch", "www.oetwil.ch"],
  "Thalheim an der Thur": ["www.thalheim.ch"], "Wettswil am Albis": ["www.wettswil.ch"], "Winterthur": ["stadt.winterthur.ch"], "Zürich": ["www.stadt-zuerich.ch"],
  "Gossau": ["www.gossau-zh.ch"], "Rickenbach": ["www.rickenbach-zh.ch"], "Schlatt": ["www.schlatt-zh.ch"], "Dorf": ["www.dorf.ch"] };
const UA = { "User-Agent": "Familienagenda/1.0 (github.com/epperttobias-sys/fuer-familien-in-zuerich)" };
async function get(url) { try { const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) }); return r.ok ? { url: r.url, html: await r.text() } : null; } catch { return null; } }
const isIweb = h => /data-entities="/.test(h) && /_rte(\\)?\/anlass(\\)?\//.test(h);
const isItem = h => /class="[^"]*event-item/.test(h) && /\/event\/\d+\/eventdate\/\d+/.test(h);
const PATHS = ["/anlaesseaktuelles", "/anlaesse", "/veranstaltungen", "/agenda", "/anlaesseliste", "/veranstaltungskalender", "/events", "/anlass"];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = [];
for (const d of D) {
  if (have.has(d.name) || d.name === "Würenlos") continue;
  const doms = [...new Set([...(EXTRA[d.name] || []), d.domain].filter(Boolean))];
  let found = null, info = [];
  for (const dom of doms) {
    const home = await get("https://" + dom); if (!home) { info.push(dom + ":-"); continue; }
    const host = new URL(home.url).host;
    for (const p of PATHS) { const r = await get(`https://${host}${p}`); await sleep(200); if (r && isIweb(r.html)) { found = { domain: host, system: "iweb", path: p }; break; } if (r && isItem(r.html)) { found = { domain: host, system: "eventitem", path: new URL(r.url).pathname }; break; } }
    if (found) break;
    const gen = (home.html.match(/<meta[^>]+name="generator"[^>]+content="([^"]+)"/i) || [])[1] || "";
    const links = [...new Set([...home.html.matchAll(/href="([^"#]+)"/g)].map(m => m[1]).filter(h => /veranstalt|anl(a|ä|ae)ss|agenda|event|kalender/i.test(h)))].slice(0, 6);
    info.push(`${host} gen=${gen.slice(0, 30)} links=${links.join(" ")}`);
  }
  res.push({ ...d, ...(found || {}), info });
  console.log(`${d.name}: ${found ? found.system + " " + found.domain + found.path : "– " + info.join(" | ").slice(0, 300)}`);
}
writeFileSync("data/probe.json", JSON.stringify(res, null, 1));
