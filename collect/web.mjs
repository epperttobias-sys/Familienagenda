// Offizielle Websites ergänzen: über Wikidata (OSM-Tags wikidata, brand:wikidata, operator:wikidata, wikipedia)
const UA = { "User-Agent": "Familienagenda/1.0 (github.com/epperttobias-sys/fuer-familien-in-zuerich)" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function j(url) { for (let i = 0; i < 3; i++) { try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) }); if (r.ok) return await r.json(); } catch {} await sleep(2000 * (i + 1)); } return null; }
// Wikipedia-Titel (de:...) -> Wikidata-ID
export async function wpToQ(titles) {
  const out = {}, L = [...new Set(titles.filter(Boolean))];
  for (let i = 0; i < L.length; i += 50) {
    const part = L.slice(i, i + 50);
    const d = await j("https://de.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&format=json&titles=" + encodeURIComponent(part.join("|")));
    if (!d || !d.query) continue; const norm = {}; (d.query.normalized || []).concat(d.query.redirects || []).forEach(x => norm[x.to] = (norm[x.to] || []).concat(norm[x.from] || [x.from]));
    for (const p of Object.values(d.query.pages || {})) { const q = p.pageprops && p.pageprops.wikibase_item; if (!q) continue; out[p.title] = q; (norm[p.title] || []).forEach(t => out[t] = q); }
    await sleep(500);
  }
  return out;
}
// Wikidata-IDs -> offizielle Website (P856)
export async function qToSite(ids) {
  const out = {}, L = [...new Set(ids.filter(x => /^Q\d+$/.test(x || "")))];
  for (let i = 0; i < L.length; i += 50) {
    const d = await j("https://www.wikidata.org/w/api.php?action=wbgetentities&props=claims&format=json&ids=" + L.slice(i, i + 50).join("|"));
    if (!d || !d.entities) continue;
    for (const [q, e] of Object.entries(d.entities)) { const c = e.claims && e.claims.P856; if (!c) continue;
      const v = c.map(x => x.mainsnak && x.mainsnak.datavalue && x.mainsnak.datavalue.value).filter(Boolean); const de = v.find(u => /\.ch\b/.test(u)) || v[0]; if (de) out[q] = de; }
    await sleep(500);
  }
  return out;
}
// Tags eines OSM-Objekts -> Liste möglicher Wikidata-Quellen
export function wdTags(t) { return { own: t.wikidata || "", wp: t.wikipedia && /^de:/.test(t.wikipedia) ? t.wikipedia.slice(3) : "", brand: t["brand:wikidata"] || "", op: t["operator:wikidata"] || "" }; }
// Fehlende Websites ergänzen. items: [{w, _wd:{own,wp}}]; nur die eigene Website, keine allgemeinen Seiten von Marke oder Betreiber
export async function fillSites(items) {
  const need = items.filter(x => !x.w && x._wd);
  const qs = await wpToQ(need.map(x => x._wd.wp));
  need.forEach(x => { if (!x._wd.own && x._wd.wp && qs[x._wd.wp]) x._wd.own = qs[x._wd.wp]; });
  const site = await qToSite(need.map(x => x._wd.own));
  let n = 0; need.forEach(x => { const u = site[x._wd.own]; if (u) { x.w = u; n++; } });
  items.forEach(x => delete x._wd);
  console.log("websites über wikidata ergänzt:", n, "von", need.length);
  return n;
}

const GENERIC = /^(gmail|googlemail|bluewin|hotmail|outlook|live|gmx|gmx\.net|yahoo|icloud|me|mac|sunrise|swissonline|hispeed|greenmail|protonmail|proton|web|freesurf|tele2|datacomm|vtxmail|bluemail|swisscom|msn|aol|mail|t-online|quickline|netplus|ggaweb|sunrise|eblcom|vtx|solnet)\./i;
// E-Mail-Domain eines Vereins -> Website (nur wenn keine allgemeine Mail-Adresse und die Seite antwortet). Die E-Mail selbst wird nicht gespeichert.
export async function siteFromMail(mail, gemeindeDomain) {
  const d = (mail.split("@")[1] || "").toLowerCase().trim(); if (!d || GENERIC.test(d) || !/\.[a-z]{2,}$/.test(d)) return "";
  const base = gemeindeDomain.replace(/^www\./, ""); if (d === base || d.endsWith("." + base)) return "";
  for (const u of ["https://www." + d, "https://" + d]) { try { const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(15000) }); if (r.ok) return u; } catch {} }
  return "";
}
