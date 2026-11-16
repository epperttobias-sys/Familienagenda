// Alle Gemeinden des Kantons (auch ohne Event-Sammlung): Code, Name, Bezirk, Domain
import { readFileSync } from "node:fs";
export function alleGemeinden() {
  const G = JSON.parse(readFileSync(new URL("./gemeinden.json", import.meta.url)));
  let D = []; try { D = JSON.parse(readFileSync(new URL("../data/discover.json", import.meta.url))); } catch {}
  const slug = s => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/[^a-z0-9]+/g, "");
  const out = {}, have = new Set();
  for (const [c, g] of Object.entries(G)) { out[c] = { name: g.name, bezirk: g.bezirk, domain: g.domain }; have.add(g.name); }
  for (const d of D) { if (have.has(d.name) || d.name === "Würenlos") continue; let c = slug(d.name); while (out[c]) c += "x"; out[c] = { name: d.name, bezirk: d.bezirk, domain: d.domain || "" }; have.add(d.name); }
  return out;
}
