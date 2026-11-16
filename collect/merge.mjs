// Fügt die Teilergebnisse der Bezirke zusammen und schreibt site/events.json und site/events.js
import { readFile, writeFile, readdir } from "node:fs/promises";
import { merge } from "./lib.mjs";
const root = new URL("..", import.meta.url), path = p => new URL(p, root);
const readJson = async (p, f) => { try { return JSON.parse(await readFile(path(p), "utf8")); } catch { return f; } };
const sites = await readJson("collect/gemeinden.json", {});
const previous = await readJson("site/events.json", { events: [], gemeinden: {} });
const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });
const status = {}, events = [];
let files = []; try { files = (await readdir(path("data/parts/"))).filter(f => f.endsWith(".json")); } catch {}
for (const f of files) { const p = await readJson("data/parts/" + f, null); if (!p) continue; Object.assign(status, p.status); events.push(...p.events); }
for (const [code, s] of Object.entries(sites)) if (!status[code]) {
  const old = (previous.events || []).filter(e => e.gemeinden[0] === code && e.bis >= today);
  events.push(...old); status[code] = { name: s.name, bezirk: s.bezirk, domain: s.domain, ok: false, count: old.length };
}
if (!Object.values(status).some(s => s.ok)) { console.error("Keine Gemeinde erreichbar, die bisherigen Daten bleiben bestehen."); process.exit(1); }
const merged = merge(events);
const out = JSON.stringify({ stand: today, gemeinden: status, events: merged }, null, 1);
await writeFile(path("site/events.json"), out + "\n");
await writeFile(path("site/events.js"), "window.FAMILIENAGENDA = " + out + ";\n");
console.log(`Fertig: ${merged.length} Anlässe aus ${Object.keys(status).length} Gemeinden (${files.length} Bezirke)`);
