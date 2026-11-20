// Führt die Einträge von den Gemeinde-Websites (data/gemeinde-seiten.json) mit den Familienangeboten aus OpenStreetMap zusammen.
// Bekannte Einträge (gleiche Website oder gleicher Name) bekommen fehlende Links, neue werden ergänzt.
import { readFileSync, writeFileSync } from "node:fs";

const GEN = /\b(kita|kitas|kinderkrippe|krippe|kinderhort|hort|kindertagesstätte|kinderhaus|kinder|tagesstätte|tagesstruktur(en)?|spielgruppe|waldspielgruppe|gmbh|ag|verein|und|der|die|das|im|am|in|zum|zur|von|childcare|kinderbetreuung|bibliothek|gemeindebibliothek|ludothek|familienzentrum|the|de|la)\b/g;
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ");
const sig = (n, gname) => new Set(norm(n).replace(GEN, " ").split(/\s+/).filter(w => w.length > 2 && !norm(gname).split(/\s+/).includes(w)));
const host = u => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/$/, "")).toLowerCase(); } catch { return ""; } };
const DOC = /reglement|verordnung|ordnung\b|benutzungs|benützungs|gebühr|beitrag|vergünstigung|aufsicht|meldepflicht|notsituation|konto|katalog|onleihe|richtlinie|merkblatt|formular|antrag|tarif|^über die|^offizielle|^weitere|^website|^link$|kindergarten und schulen|^andere\b|\.pdf|\d{3}\.\d|^bibliotheken$|^f$/i;
const clean = n => n.replace(/\s*Externer Link wird in einem neuen Fenster geöffnet\.?/gi, "").replace(/\s*\((?:ausgewählt|pdf|extern)[^)]*\)/gi, "").replace(/\s+/g, " ").trim();

export function mergeGemeindeSeiten(out, names) {
  // Quellen: Websites der Gemeinden und Standortlisten der Kita-Ketten
  const S = [];
  for (const f of ["data/gemeinde-seiten.json", "data/ketten.json"]) { try { S.push(...Object.entries(JSON.parse(readFileSync(f, "utf8")).g)); } catch {} }
  let added = 0, filled = 0;
  for (const [c, o] of S) {
    const gname = names[c] || "", list = (out[c] = out[c] || []);
    for (const it0 of o.items || []) {
      const it = { ...it0, k: it0.k === "treff" ? "zentrum" : it0.k };
      const n = clean(it.n); if (n.length < 4 || DOC.test(n)) continue;
      const h = it.w ? host(it.w) : "", s = sig(n, gname);
      const twin = list.find(y => y.k === it.k || (it.k === "kita" && y.k === "kita") ? (h && y.w && host(y.w) === h && !/globegarden\.ch$|kimikrippen\.ch$|guexi\.ch$/.test(h)) || (s.size && (() => { const t = sig(y.n, gname); return t.size && ([...s].every(w => t.has(w)) || [...t].every(w => s.has(w))); })()) : false);
      if (twin) {
        if (!twin.w && it.w) { twin.w = it.w; filled++; }
        if (!twin.u && it.u && it.u !== it.src) twin.u = it.u;
        if (!twin.a && it.a) twin.a = it.a;
        if (!twin.lat && it.lat) { twin.lat = it.lat; twin.lon = it.lon; }
        continue;
      }
      const x = { k: it.k, n, a: it.a || "", w: it.w || "", oh: "", src: "g" };
      if (it.u && it.u !== it.w) x.u = it.u;
      if (it.lat) { x.lat = it.lat; x.lon = it.lon; }
      list.push(x); added++;
    }
    list.sort((a, b) => a.k.localeCompare(b.k) || a.n.localeCompare(b.n, "de"));
  }
  return { added, filled };
}

// Direkt aufrufbar: node collect/familie-merge.mjs (ergänzt site/familie.js)
if (process.argv[1] && process.argv[1].endsWith("familie-merge.mjs")) {
  const F = JSON.parse(readFileSync("site/familie.js", "utf8").replace(/^[^=]*=\s*/, "").replace(/;\s*$/, ""));
  const G = JSON.parse(readFileSync("site/gemeinden.js", "utf8").replace(/^[^=]*=\s*/, "").replace(/;\s*$/, ""));
  // vorherige Ergänzungen entfernen, damit der Lauf wiederholbar ist
  for (const c in F.gemeinden) F.gemeinden[c] = F.gemeinden[c].filter(x => x.src !== "g");
  const r = mergeGemeindeSeiten(F.gemeinden, Object.fromEntries(Object.entries(G).map(([c, g]) => [c, g.name])));
  try { const FX = JSON.parse(readFileSync("data/familie-fix.json", "utf8"));
    for (const c in F.gemeinden) { F.gemeinden[c] = F.gemeinden[c].filter(x => !FX.hide.includes(c + "|" + x.n)); F.gemeinden[c].forEach(x => { const k = c + "|" + x.n; if (k in FX.url) x.w = FX.url[k]; }); } } catch {}
  writeFileSync("site/familie.js", "window.FAMILIE=" + JSON.stringify(F) + ";\n");
  console.log("Gemeinde-Seiten:", r);
}
