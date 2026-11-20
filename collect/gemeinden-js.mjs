// Schreibt site/gemeinden.js mit allen Gemeinden des Kantons für die Seite
import { writeFileSync } from "node:fs";
import { alleGemeinden } from "./alle.mjs";
const A = alleGemeinden();
// Mittelpunkt jeder Gemeinde für «In der Nähe» (aus gemeinden.json, sonst Median der OSM-Orte)
import { readFileSync } from "node:fs";
const XY = JSON.parse(readFileSync("collect/gemeinden-coords.json", "utf8"));
for (const k in A) if (XY[k]) { A[k].lat = XY[k][0]; A[k].lon = XY[k][1]; }
writeFileSync("site/gemeinden.js", "window.GEMEINDEN=" + JSON.stringify(A) + ";\n");
console.log("Gemeinden:", Object.keys(A).length);
