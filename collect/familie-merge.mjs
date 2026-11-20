// Führt die Einträge von den Gemeinde-Websites (data/gemeinde-seiten.json) mit den Familienangeboten aus OpenStreetMap zusammen.
// Bekannte Einträge (gleiche Website oder gleicher Name) bekommen fehlende Links, neue werden ergänzt.
import { readFileSync, writeFileSync } from "node:fs";

const GEN = /\b(kita|kitas|kinderkrippe|krippe|kinderhort|hort|kindertagesstätte|kinderhaus|kinder|tagesstätte|tagesstruktur(en)?|spielgruppe|waldspielgruppe|gmbh|ag|verein|und|der|die|das|im|am|in|zum|zur|von|childcare|kinderbetreuung|bibliothek|gemeindebibliothek|ludothek|familienzentrum|the|de|la)\b/g;
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ");
const sig = (n, gname) => new Set(norm(n).replace(GEN, " ").split(/\s+/).filter(w => w.length > 2 && !norm(gname).split(/\s+/).includes(w)));
const host = u => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/$/, "")).toLowerCase(); } catch { return ""; } };
const DOC = /reglement|verordnung|ordnung\b|benutzungs|benützungs|gebühr|beitrag|vergünstigung|aufsicht|meldepflicht|notsituation|konto|katalog|onleihe|richtlinie|merkblatt|formular|antrag|tarif|^über die|^offizielle|^weitere|^website|^link$|kindergarten und schulen|^andere\b|\.pdf|\d{3}\.\d|^bibliotheken$|^f$|^zur\b|^zum\b|^hier$|vereinsliste|katalog|katalaog|digital|\(aktiv\)|vertrag|flyer|^schulen\b|im überblick|^unsere\b|kinderbetreuung im|^online|newsletter|anmeldung|^mehr\b|^weiter|^details|^infos?\b|^informationen|^kontakt|^angebot|^übersicht|^download|^jetzt\b|^startseite|^home$|leitbild|konzept|jahresbericht|^\W*$|mediopass|dieser|^private\b|erlass|verband|leistungsvereinbarung|präsentation|rechner|allgemein|^\d{6,}|^(spielgruppen|kitas|krippen|horte|tagesfamilien|kinderkrippen)\b|angebote\b|^betreuung\b|^(kinderkrippe|kita|hort|spielgruppe|gemeindebibliothek|bibliothek|jugendtreff|elternforum|tagesfamilienverein|kinderkrippenverein)$|subvention|gemeindeversammlung|^verein\b|kindertagesstätten$|liste\b|standorte|information|sheet|veranstaltungen|bestätigung|interessengruppe|schweiz\b|werden$|kinderbetreuung in|^kita und hort$|makerspace|buchstart|null|@|\.xn\b|\bfee\b|subsid|^tagesstruktur(en)?\s+hort$|^im \w+$|^abteilung\b|^regionalbibliothek$|^gemeinde- und schulbibliothek$|menüpl|unterstützung|^kimikrippen$|krippen ag$|primarschule$|^kurs\b|volksschule|\/|und spielgruppen|frühe förderung|^eine?n? |familienergänzende|finden$|leporello|_|^spielplatz|^projekt|^tagesbetreuung$|^kindertagesstätte$|beiträge|^kita kimi$|^kindertagesstätte kimi$|^\(|^kindergarten & |& tagesfamilie|^schulergänzende|^güxi kinderkrippen$|^tagesbetreuung und|öffnungszeiten|anlässe|datenschutz|^über uns|^wann\b|^die bibliothek|team$|blinde|e-medien|jugendzimmer|^hier\b|senior|^kanton\b|ein ort für|leihothek/i;
const pretty = h => h.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].replace(/\.(ch|com|org|net|swiss|info|li)$/, "").replace(/[-_.]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const clean = n => { n = n.replace(/\s*Externer Link wird in einem neuen Fenster geöffnet\.?/gi, "").replace(/\s*\((?:ausgewählt|pdf|extern|wird in einem neuen [^)]*|[a-z0-9-]+\.(?:ch|com|org)[^)]*)\)/gi, "").replace(/\s*[-–]\s*[a-z0-9-]+\.(?:ch|com|org)\b.*$/i, "").replace(/\s+/g, " ").trim();
  n = n.replace(/^[^,]{3,40}, Leiterin\s+/i, "").replace(/^Kita in [^,]+, Zürich\s+/i, "").replace(/^"(.*)"$/, "$1");
  n = n.replace(/\s+[A-ZÄÖÜ][\wäöü-]*(strasse|weg|gasse|platz|rain)\s+\d+\w?\b.*$/, "").replace(/\s+\(Hort\)$/, " (Hort)").trim();
  return /^[\w.-]+\.(ch|com|org|net|swiss)(\/\S*)?$/i.test(n) ? pretty(n) : n; };

export function mergeGemeindeSeiten(out, names) {
  // Quellen: Websites der Gemeinden und Standortlisten der Kita-Ketten
  const S = [];
  for (const f of ["data/gemeinde-seiten.json", "data/ketten.json"]) { try { S.push(...Object.entries(JSON.parse(readFileSync(f, "utf8")).g)); } catch {} }
  let added = 0, filled = 0;
  for (const [c, o] of S) {
    const gname = names[c] || "", list = (out[c] = out[c] || []);
    for (const it0 of o.items || []) {
      const it = { ...it0, k: it0.k === "treff" ? "zentrum" : it0.k };
      let n = clean(it.n);
      if (/glücklich aufwachsen/i.test(n)) n = "pop e poppa " + ((it.a || "").split(",")[1] || gname).trim();
      if (n.length < 4 || DOC.test(n)) continue;
      // Bibliotheken kommen meist schon aus OpenStreetMap: nur ergänzen, wo noch keine bekannt ist
      if (it.k === "bib" && (list.some(y => y.k === "bib") || !/bibliothek/i.test(n))) continue;
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
