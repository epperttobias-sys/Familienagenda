// Baut site/events.js aus Rohdaten, die im Browser gesammelt wurden (data/raw/<code>.json).
import { readFile, writeFile, readdir } from "node:fs/promises";
import { merge } from "./lib.mjs";
const root = new URL("..", import.meta.url), p = x => new URL(x, root);
const sites = JSON.parse(await readFile(p("collect/gemeinden.json"), "utf8"));
const stand = process.argv[2];
const events = [], status = {};
const files = (await readdir(p("data/raw"))).filter(f => f.endsWith(".json"));
for (const f of files) {
  const r = JSON.parse(await readFile(p("data/raw/" + f), "utf8"));
  const site = sites[r.code];
  for (const [id, von, bis, name, ort, time, amin, amax, label, path] of r.ev)
    if (!(parseInt(time, 10) >= 20 && amin === null))
    events.push({ gemeinden: [r.code], id: `${r.code}-${id}`, name, von, bis, ort, veranstalter: "", time, age: amin === null ? null : { min: amin, max: amax, label }, url: `https://${site.domain}${path || (r.tpl ? r.tpl.replace('{e}', id.split('-')[0]).replace('{d}', id.split('-')[1]) : '/_rte/anlass/' + id)}` });
  status[r.code] = { name: site.name, bezirk: site.bezirk, domain: site.domain, ok: true, count: r.ev.length };
}
const ordered = Object.fromEntries(Object.keys(sites).filter(c => status[c]).map(c => [c, status[c]]));
const merged = merge(events);
const out = JSON.stringify({ stand, gemeinden: ordered, events: merged });
await writeFile(p("site/events.json"), out + "\n");
await writeFile(p("site/events.js"), "window.FAMILIENAGENDA = " + out + ";\n");
console.log(Object.keys(ordered).length, "Gemeinden,", merged.length, "Anlässe");
