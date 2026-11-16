// Holt die Vereinslisten der Gemeinden (i-web) und behält Angebote für Kinder
import { readFileSync, writeFileSync } from "node:fs";
import { decode, strip, classifyClub } from "./lib.mjs";
const G = JSON.parse(readFileSync(new URL("./gemeinden.json", import.meta.url)));
const PATHS = ["/vereinsliste", "/vereine", "/vereineliste", "/vereinsverzeichnis"];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let old = {}; try { const t = readFileSync("site/vereine.js", "utf8"); old = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)).gemeinden || {}; } catch {}
const out = {}, info = [];
for (const [code, g] of Object.entries(G)) {
  if (g.system && g.system !== "iweb") { if (old[code]) out[code] = old[code]; continue; }
  let rows = null, path = null;
  for (const p of PATHS) {
    try {
      const r = await fetch("https://" + g.domain + p, { headers: { "User-Agent": "Familienagenda/1.0 (privates Familienprojekt)" }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) continue; const html = await r.text();
      const m = html.match(/data-entities="([^"]*)"/); if (!m) continue;
      const j = JSON.parse(decode(m[1])); const d = j.data || j;
      if (Array.isArray(d) && d.length && d[0].name && /\/verein\//.test(d[0].name)) { rows = d; path = p; break; }
    } catch {}
    await sleep(400);
  }
  if (!rows) { info.push(g.name + ": keine Liste"); if (old[code]) out[code] = old[code]; continue; }
  const list = [];
  for (const r of rows) {
    const n = strip(decode(r.name)).trim(), href = (r.name.match(/href="([^"]+)"/) || [])[1];
    const k = classifyClub(n); if (!k) continue;
    list.push({ n, k, o: strip(decode(r.ort || "")).trim(), u: href ? "https://" + g.domain + href : "https://" + g.domain + path });
  }
  list.sort((a, b) => a.n.localeCompare(b.n, "de"));
  out[code] = list; info.push(`${g.name}: ${rows.length} Vereine, ${list.length} für Kinder (${path})`);
  await sleep(600);
}
console.log(info.join("\n"));
writeFileSync("site/vereine.js", "window.VEREINE=" + JSON.stringify({ stand: new Date().toISOString().slice(0, 10), gemeinden: out }) + ";\n");
