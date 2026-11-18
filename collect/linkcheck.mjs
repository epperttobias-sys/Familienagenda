// Prüft alle Restaurant-Websites: antwortet die Seite noch? Ergebnis in data/linkcheck.json
import { readFileSync, writeFileSync } from "node:fs";
const load = (f, k) => { const t = readFileSync(f, "utf8"); return JSON.parse(t.slice(t.indexOf("=") + 1).trim().replace(/;$/, "")); };
const E = load("site/essen.js").orte, P = load("site/essen-plus.js"), W = load("site/essen-web.js"), G = load("site/gemeinden.js");
const L = [];
E.forEach(z => z.w && L.push({ src: "osm", n: z.n, g: (G[z.g] || {}).name, u: z.w }));
P.forEach(p => L.push({ src: "plus", n: p.n, g: p.gn, u: p.w || "", q: p.q || "" }));
Object.entries(W).forEach(([k, u]) => { const [n, g] = k.split("|"); L.push({ src: "web", n, g, u }); });
const UA = { "User-Agent": "Mozilla/5.0 (compatible; Familienagenda-Linkcheck/1.0)", "Accept-Language": "de-CH,de" };
async function check(u) {
  if (!u) return { s: 0 };
  try { const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
    const t = r.ok ? (await r.text()).slice(0, 200000) : "";
    const closed = /(definitiv|endgültig)\s+geschlossen|haben\s+(unser|das)\s+(restaurant|lokal|café|kafi)\s+geschlossen|domain\s+(is\s+)?for\s+sale|diese domain|domain kaufen|parked|wir sagen (adieu|tschüss)|letzter öffnungstag/i.test(t);
    return { s: r.status, f: r.url !== u ? r.url : undefined, closed: closed || undefined }; }
  catch (e) { return { s: -1, e: String(e.cause && e.cause.code || e.name) }; }
}
const out = []; let i = 0;
async function worker() { while (i < L.length) { const x = L[i++]; const r = await check(x.u); const q = x.q ? await check(x.q) : null; out.push({ ...x, ...r, qs: q && q.s }); } }
await Promise.all(Array.from({ length: 8 }, worker));
out.sort((a, b) => a.n.localeCompare(b.n, "de"));
writeFileSync("data/linkcheck.json", JSON.stringify({ stand: new Date().toISOString(), out }, null, 1));
const bad = out.filter(x => x.u && (x.s < 200 || x.s >= 400 || x.closed));
console.log("geprüft", out.length, "Probleme", bad.length); bad.forEach(x => console.log(x.s, x.closed ? "GESCHLOSSEN?" : "", x.n, "|", x.g, "|", x.u, x.e || ""));
