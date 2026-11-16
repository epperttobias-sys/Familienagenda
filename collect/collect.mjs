// Läuft jede Nacht: holt alle Gemeinden und schreibt site/events.json.
import { readFile, writeFile } from "node:fs/promises";
import { collectSite, merge } from "./lib.mjs";

const root = new URL("..", import.meta.url);
const path = p => new URL(p, root);
const readJson = async (p, fallback) => { try { return JSON.parse(await readFile(path(p), "utf8")); } catch { return fallback; } };

const DELAY_MS = 400;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Familienagenda/1.0 (privates Familienprojekt, sammelt einmal pro Nacht)" }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${res.status} bei ${url}`);
  return res.text();
}

const sites = await readJson("collect/gemeinden.json", {});
const cache = await readJson("data/cache.json", {});
const previous = await readJson("site/events.json", { events: [] });
previous.events ??= [];
const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });

const events = [], status = {};
for (const [code, site] of Object.entries(sites)) {
  try {
    const r = await collectSite(code, site, { fetchText, cache, today, wait: () => sleep(site.delay ?? DELAY_MS) });
    events.push(...r.events);
    status[code] = { name: site.name, bezirk: site.bezirk, domain: site.domain, ok: true, count: r.events.length };
    console.log(`${site.name}: ${r.rows} Events gelesen, ${r.events.length} für Kinder`);
  } catch (err) {
    // Fällt eine Gemeinde aus, bleiben ihre bisherigen Events stehen.
    const old = previous.events.filter(e => e.gemeinden[0] === code && e.bis >= today);
    events.push(...old);
    status[code] = { name: site.name, bezirk: site.bezirk, domain: site.domain, ok: false, count: old.length };
    console.error(`${site.name} fehlgeschlagen: ${err.message}`);
  }
}

await writeFile(path("data/cache.json"), JSON.stringify(cache) + "\n");
if (!Object.values(status).some(s => s.ok)) {
  console.error("Keine Gemeinde erreichbar, die bisherigen Daten bleiben bestehen.");
  process.exit(1);
}
const merged = merge(events);
const out = JSON.stringify({ stand: today, gemeinden: status, events: merged }, null, 1);
await writeFile(path("site/events.json"), out + "\n");
await writeFile(path("site/events.js"), "window.FAMILIENAGENDA = " + out + ";\n");
console.log(`Fertig: ${merged.length} Anlässe`);
