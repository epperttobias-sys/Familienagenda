// Einmalig: Kandidaten-Websites prüfen (data/probe2.json) – antwortet die Seite, stehen Name und Ort darauf?
import { readFileSync, writeFileSync } from "node:fs";
const L = JSON.parse(readFileSync("data/probe2.json", "utf8"));
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "Accept-Language": "de-CH,de" };
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const words = n => norm(n).replace(/\b(kita|kinderkrippe|krippe|spielgruppe|kindergarten|kinderhort|hort|gmbh|ag|verein|restaurant|ristorante|pizzeria|cafe|bibliothek|ludothek|hallenbad|freibad|bad|zentrum|the|und|der|die|das|zum|zur|im|am)\b/g, " ").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
async function one(c) {
  try { const r = await fetch(c.u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
    const t = norm((await r.text()).slice(0, 500000));
    const w = words(c.n), name = w.length ? w.filter(x => t.includes(x)).length / w.length : 0;
    const ort = t.includes(norm(c.g.replace(/ (am|an der|bei) .*/, "")));
    const closed = /(definitiv|endgultig|dauerhaft) geschlossen|betrieb eingestellt|wir haben (unsere|die) (kita|krippe|spielgruppe|restaurant) geschlossen|domain (is )?for sale|domain kaufen/.test(t);
    return { ...c, s: r.status, f: r.url, name: Math.round(name * 100) / 100, ort, closed };
  } catch (e) { return { ...c, s: -1, e: String(e.cause && e.cause.code || e.name) }; }
}
const out = []; let i = 0;
await Promise.all(Array.from({ length: 8 }, async () => { while (i < L.length) out.push(await one(L[i++])); }));
writeFileSync("data/probe2-out.json", JSON.stringify(out, null, 1));
console.log(out.length);
