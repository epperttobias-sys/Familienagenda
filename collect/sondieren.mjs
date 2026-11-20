// Hilfsmittel: zeigt für Adressen aus data/sondieren.txt alle Links, Feeds und den Seitentext im Log (nichts wird gespeichert).
import { readFileSync } from "node:fs";
const UA = { "User-Agent": "Mozilla/5.0 (compatible; FamilienZuerichBot/1.0; +https://epperttobias-sys.github.io/fuer-familien-in-zuerich/)", "Accept-Language": "de-CH,de;q=0.9" };
const strip = h => h.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const LIM = +(process.env.LIM || 3000);
for (const line of readFileSync("data/sondieren.txt", "utf8").split("\n").map(s => s.trim()).filter(s => s && !s.startsWith("#"))) {
  const [u, mode = ""] = line.split(/\s+\|\s+/);
  console.log("\n########## " + u);
  try {
    const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(25000) });
    const t = await r.text();
    console.log("status", r.status, r.url, r.headers.get("content-type"), t.length);
    if (!/html/i.test(r.headers.get("content-type") || "")) { console.log(t.slice(0, LIM)); continue; }
    const feeds = [...t.matchAll(/<link[^>]+(?:rss|atom|calendar|json)[^>]*>/gi)].map(m => m[0]); if (feeds.length) console.log("FEEDS", feeds.join("\n"));
    if (/application\/ld\+json/.test(t)) console.log("JSONLD", [...t.matchAll(/<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1].slice(0, 600)).join("\n---\n"));
    const gen = (t.match(/<meta name="generator" content="([^"]*)"/i) || [])[1]; if (gen) console.log("GENERATOR", gen);
    const main = (t.match(/<main[\s\S]*<\/main>/i) || [t])[0];
    const seen = new Set(), L = [];
    for (const m of main.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) { if (seen.has(m[1])) continue; seen.add(m[1]); L.push(strip(m[2]).slice(0, 60) + " | " + m[1].slice(0, 160)); }
    console.log("LINKS " + L.length + "\n" + L.slice(0, +(process.env.NL || 400)).join("\n"));
    console.log("TEXT " + strip(main).slice(0, LIM));
    if (mode === "html") { const i = main.search(new RegExp(process.env.MARK || "veranst", "i")); console.log("HTML " + main.slice(Math.max(0, i), i + LIM).replace(/\s+/g, " ")); }
  } catch (e) { console.log("FEHLER", e.message); }
}
