// Einmalige Prüfung einer Linkliste (data/probe.txt: "Label | URL" pro Zeile) → data/probe.json
// Liefert Status, Ziel-URL, Seitentitel, Schliessungs-Hinweise und bei Ratgeber-Seiten die externen Links.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
mkdirSync("data/raw", { recursive: true });
const L = readFileSync("data/probe.txt", "utf8").split("\n").map(l => l.split(" | ")).filter(x => x[1]);
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "Accept-Language": "de-CH,de" };
const SKIP = /kinderregion|kidzh|kinderthur|facebook|instagram|twitter|x\.com|linkedin|youtube|google|whatsapp|pinterest|tiktok|apple\.com|mailto|tel:|wp\.me|wordpress|cookie|swisstopo|sbb\.ch|search\.ch|tripadvisor|maps\./i;
async function probe(u) {
  try { const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(25000) });
    const t = (await r.text()).slice(0, 400000);
    // RAW: nur Links zu Agenda/Veranstaltungen speichern (ganze Seiten können Schlüssel enthalten)
    if (/^RAW/.test(L.find(x => x[1] === u)?.[0] || "")) {
      const links = [...new Set([...t.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]{0,200}?)<\/a>/gi)].map(m => { const tx = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); return tx + " | " + m[1]; })
        .filter(x => /wp-json|rest|api|veranstalt|agenda|anl[aä]ss|event|kalender|termine|freizeit|leben|ical|\.ics|webcal|feed|json|page=|seite|weiter|next/i.test(x)))].slice(0, 60);
      const sys = [/i-web|iweb|_rte\//i.test(t) && "iweb", /eventitem|event-item/i.test(t) && "eventitem", /govis|gov\.ch/i.test(t) && "govis", /onegov/i.test(t) && "onegov", /typo3/i.test(t) && "typo3", /wp-content/i.test(t) && "wordpress"].filter(Boolean);
      const head = /json|calendar/i.test(r.headers.get("content-type") || "") ? t.replace(/pk\.[A-Za-z0-9._-]{20,}|AIza[0-9A-Za-z_-]{20,}/g, "[key]").slice(0, 3000) : "";
      const sample = t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/pk\.[A-Za-z0-9._-]{20,}|AIza[0-9A-Za-z_-]{20,}/g, "[key]");
      const ev = (sample.match(/<(li|article|div)[^>]*class="[^"]*(event|termin|agenda|calendar|views-row)[^"]*"[\s\S]{0,1500}/i) || [""])[0].slice(0, 1500);
      writeFileSync("data/raw/" + u.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "_").slice(0, 120) + ".json", JSON.stringify({ f: r.url, ct: r.headers.get("content-type"), sys, links, head, ev }, null, 1));
    }
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
