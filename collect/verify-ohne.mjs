// Einmalige Prüfung: Familien- und Betreuungsangebote ohne Website (data/ohne.json).
// 1) OpenStreetMap-Tags mit Bearbeitungsdatum (E-Mail, Telefon, check_date)  2) naheliegende Domains testen.
import { readFileSync, writeFileSync } from "node:fs";
const L = JSON.parse(readFileSync("data/ohne.json", "utf8"));
const UA = { "User-Agent": "Mozilla/5.0 (compatible; Familienagenda/1.0; github.com/epperttobias-sys/fuer-familien-in-zuerich)", "Accept-Language": "de-CH,de" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 1. OSM
const BB = "(47.15,8.35,47.70,9.00)";
const q = `[out:json][timeout:300];(nwr["amenity"~"kindergarten|childcare|library|toy_library|community_centre|social_facility|swimming_pool"]${BB};nwr["leisure"~"sports_centre|water_park|swimming_pool|swimming_area|bathing_place"]${BB};nwr["social_facility:for"="child"]${BB};);out meta center;`;
let osm = [];
for (let round = 0; round < 4 && !osm.length; round++) { if (round) await sleep(45000);
  for (const h of ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]) {
    try { const r = await fetch(h, { method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
      if (!r.ok) throw new Error(r.status); osm = (await r.json()).elements; console.log("osm", osm.length); break; } catch (e) { console.log("fehler", h, e.message); } } }
const near = (a, e) => { const c = e.center || e; return c.lat && Math.abs(c.lat - a.lat) < 0.0015 && Math.abs(c.lon - a.lon) < 0.002; };
// 2. Domains
const slug = s => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/é|è/g, "e").replace(/['’"«»().,!]/g, "").replace(/&/g, "und").trim().replace(/\s+/g, "-");
const words = s => s.toLowerCase().replace(/kita|kinderkrippe|krippe|spielgruppe|kindergarten|hort|gmbh|ag\b|verein|[^a-zäöüé0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 3);
async function tryDomain(d, name) {
  try { const r = await fetch("https://" + d, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null; const t = (await r.text()).slice(0, 300000).toLowerCase();
    const w = words(name); if (!w.length || !w.every(x => t.includes(x))) return null;
    if (/domain (is )?for sale|domain kaufen|diese domain|parked|hostpoint|this domain/i.test(t.slice(0, 5000)) && t.length < 20000) return null;
    return r.url; } catch { return null; }
}
const out = [];
for (const a of L) {
  const e = osm.find(e => e.tags && e.tags.name === a.n && near(a, e)) || osm.find(e => e.tags && e.tags.name && e.tags.name.toLowerCase() === a.n.toLowerCase() && near(a, e));
  const t = (e && e.tags) || {};
  const r = { ...a, osm: e ? { ts: e.timestamp, v: e.version, check: t.check_date || t["check_date:opening_hours"] || "", mail: t.email || t["contact:email"] || "", tel: t.phone || t["contact:phone"] || "", oh: t.opening_hours || "", op: t.operator || "", disused: Object.keys(t).some(k => /^(disused|was|abandoned):/.test(k)) } : null };
  const mail = r.osm && r.osm.mail.split(";")[0].trim(); const md = mail && mail.split("@")[1];
  const cand = [];
  if (md && !/gmail|gmx|bluewin|hotmail|yahoo|outlook|icloud|sunrise|hispeed|swissonline|protonmail|me\.com/i.test(md)) cand.push(md, "www." + md);
  const s = slug(a.n), sg = slug(a.g);
  cand.push(s + ".ch", "www." + s + ".ch", s + "-" + sg + ".ch", s.replace(/-/g, "") + ".ch");
  for (const d of [...new Set(cand)]) { const u = await tryDomain(d, a.n); if (u) { r.found = u; r.via = d === md || d === "www." + md ? "mail" : "domain"; break; } await sleep(150); }
  out.push(r);
}
writeFileSync("data/ohne-check.json", JSON.stringify(out, null, 1));
console.log("gefunden", out.filter(x => x.found).length, "von", out.length);
