// Übernimmt geprüfte Gemeinden (i-web und eventitem) aus data/discover.json in collect/gemeinden.json
import { readFileSync, writeFileSync } from "node:fs";
const G = JSON.parse(readFileSync("collect/gemeinden.json", "utf8"));
const D = JSON.parse(readFileSync("data/discover.json", "utf8"));
const have = new Set(Object.values(G).map(g => g.name));
const slug = s => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/[^a-z0-9]+/g, "");
let added = 0;
for (const d of D) {
  if (have.has(d.name) || d.name === "Würenlos" || !d.domain || !["iweb", "eventitem"].includes(d.system)) continue;
  let code = slug(d.name); while (G[code]) code += "x";
  const e = { name: d.name, bezirk: d.bezirk, domain: d.domain };
  if (d.system === "eventitem") Object.assign(e, { system: "eventitem", path: d.path, delay: 3000 });
  else if (d.path && d.path !== "/anlaesseaktuelles") e.path = d.path;
  e.lat = d.lat; e.lon = d.lon; G[code] = e; added++;
}
const order = Object.entries(G).sort((a, b) => a[1].bezirk.localeCompare(b[1].bezirk, "de") || a[1].name.localeCompare(b[1].name, "de"));
writeFileSync("collect/gemeinden.json", "{\n" + order.map(([c, g]) => "  " + JSON.stringify(c) + ": " + JSON.stringify(g)).join(",\n") + "\n}\n");
console.log("neu:", added, "total:", order.length);
