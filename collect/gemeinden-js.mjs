// Schreibt site/gemeinden.js mit allen Gemeinden des Kantons für die Seite
import { writeFileSync } from "node:fs";
import { alleGemeinden } from "./alle.mjs";
const A = alleGemeinden();
writeFileSync("site/gemeinden.js", "window.GEMEINDEN=" + JSON.stringify(A) + ";\n");
console.log("Gemeinden:", Object.keys(A).length);
