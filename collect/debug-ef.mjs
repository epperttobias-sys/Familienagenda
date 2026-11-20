const UA = { "User-Agent": "Familienagenda/1.0 (privates Familienprojekt, Test)" };
const get = async u => { const r = await fetch(u, { headers: UA }); console.log("GET", r.status, u); return r.text(); };
const h = await get("https://eventfrog.ch/de/events/kanton-zuerich/veranstaltungen-kinder-familien.html");
const i = h.indexOf('/de/p/kinderveranstaltungen/'); console.log(h.slice(i - 2500, i + 2500).replace(/\s+/g, " "));
console.log("PAGING", [...h.matchAll(/href="([^"]*(?:page|seite|offset)[^"]*)"/gi)].map(m => m[1]).slice(0, 10));
console.log("LD", (h.match(/application\/ld\+json[^>]*>([\s\S]{0,1500})/) || [])[1]);
const h2 = await get("https://eventfrog.ch/de/events/kanton-zuerich/veranstaltungen-kinder-familien.html?page=2");
console.log("p2 links", [...h2.matchAll(/href="(\/de\/p\/[^"]+)"/g)].slice(0, 5).map(m => m[1]));
