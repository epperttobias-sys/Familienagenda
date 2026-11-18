// Einmalige Prüfung einer Linkliste (data/probe.txt: "Label | URL" pro Zeile) → data/probe.json
// Liefert Status, Ziel-URL, Seitentitel, Schliessungs-Hinweise und bei Ratgeber-Seiten die externen Links.
import { readFileSync, writeFileSync } from "node:fs";
const L = readFileSync("data/probe.txt", "utf8").split("\n").map(l => l.split(" | ")).filter(x => x[1]);
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "Accept-Language": "de-CH,de" };
const SKIP = /kinderregion|kidzh|kinderthur|facebook|instagram|twitter|x\.com|linkedin|youtube|google|whatsapp|pinterest|tiktok|apple\.com|mailto|tel:|wp\.me|wordpress|cookie|swisstopo|sbb\.ch|search\.ch|tripadvisor|maps\./i;
async function probe(u) {
  try { const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(25000) });
    const t = (await r.text()).slice(0, 400000);
    const title = (t.match(/<title[^>]*>([^<]*)/i) || [])[1]?.trim().slice(0, 120);
    const closed = (t.match(/[^.<>]{0,60}(definitiv geschlossen|endgültig geschlossen|dauerhaft geschlossen|für immer geschlossen|haben (unser|das) (restaurant|lokal|café|kafi) geschlossen|wir sagen (adieu|tschüss|danke)|letzter öffnungstag|betrieb eingestellt|neue pächter|domain (is )?for sale|domain kaufen)[^.<>]{0,60}/i) || [])[0];
    let ext; if (/kinderregion|kidzh|kinderthur|zuerich\.com|myswitzerland/.test(r.url)) ext = [...new Set([...t.matchAll(/href="(https?:\/\/[^"#]+)"/g)].map(m => m[1]).filter(h => !SKIP.test(h) && !h.includes(new URL(r.url).host)))].slice(0, 8);
    return { s: r.status, f: r.url, title, closed, ext }; }
  catch (e) { return { s: -1, e: String(e.cause && e.cause.code || e.name) }; }
}
const out = []; let i = 0;
async function worker() { while (i < L.length) { const [l, u] = L[i++]; out.push({ l, u, ...(await probe(u)) }); } }
await Promise.all(Array.from({ length: 8 }, worker));
out.sort((a, b) => a.l.localeCompare(b.l, "de"));
writeFileSync("data/probe.json", JSON.stringify(out, null, 1));
console.log(out.length);
