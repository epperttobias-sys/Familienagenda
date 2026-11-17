// Prüft einzelne Seiten: Anzahl Treffer typischer Muster und ein Ausschnitt
const UA = { "User-Agent": "Familienagenda/1.0 (github.com/epperttobias-sys/fuer-familien-in-zuerich)" };
const URLS = (process.env.URLS || "").split(/\s+/).filter(Boolean);
for (const u of URLS) {
  try { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) }); const h = await r.text();
    const c = re => (h.match(re) || []).length;
    const i = h.search(/\/event\/\d+\/eventdate\/\d+|"start_date"|<item>/);
    console.log(`== ${u} ${r.status} len=${h.length} event-item=${c(/event-item/g)} eventdate=${c(/\/eventdate\/\d+/g)} items=${c(/<item>/g)} tribe=${c(/"start_date"/g)}`);
    if (i >= 0) console.log(h.slice(Math.max(0, i - 700), i + 300).replace(/\s+/g, " "));
  } catch (e) { console.log(`== ${u} FEHLER ${e.message}`); }
}
