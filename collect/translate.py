"""Übersetzt Inhalte (Event-Titel, Beschreibungen) mit Opus-MT (Helsinki-NLP, CC-BY 4.0) ins Englische.

Liest die Daten in site/, übersetzt nur neue Texte (Cache in data/en-cache.json)
und schreibt site/en.js mit window.I18N_EN = {Deutsch: Englisch}.
"""
import json, re, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE, CACHE = ROOT / "site", ROOT / "data" / "en-cache.json"


def load(name):
    s = (SITE / name).read_text(encoding="utf-8")
    s = re.sub(r"^\s*(//[^\n]*\n)*\s*window\.[A-Z_]+\s*=\s*", "", s).strip().rstrip(";")
    return json.loads(s)


def texts():
    out = set()
    ev = load("events.js")
    for e in ev.get("events", []):
        out.add(e.get("name", ""))
    for z in load("ausflug.js").get("ziele", []):
        out.add(z.get("d", ""))
    for lst in load("spielplaetze.js").get("gemeinden", {}).values():
        for p in lst:
            out.add(p.get("desc", ""))
    for p in load("essen-plus.js"):
        out.add(p.get("t", ""))
    return sorted(t.strip() for t in out if t and re.search(r"[A-Za-zÄÖÜäöü]{3}", t))


# Schweizerdeutsch und Mundart vor der Übersetzung ins Hochdeutsche bringen
CH = [
    (r"\bChliinsch?te\b", "Kleinsten"), (r"\bChliine\b", "Kleinen"), (r"\bChlii\b", "klein"), (r"\bChinde?r\b", "Kinder"), (r"\bChind\b", "Kind"),
    (r"\bFiire\b", "Feiern"), (r"\bSinge\b", "Singen"), (r"\bmit de\b", "mit den"), (r"\bfür d\b", "für die"), (r"\bGschichte\b", "Geschichten"),
    (r"\bGschichtli\b", "Geschichten"), (r"\bVärsli\b", "Verse"), (r"\bSamichlaus\b", "Nikolaus"), (r"\bChlaus\b", "Nikolaus"), (r"\bChilbi\b", "Jahrmarkt"),
    (r"\bRäbeliechtli(umzug|-Umzug)?\b", "Rübenlaternen-Umzug"), (r"\bRäbe\b", "Rüben"), (r"\bZmorge\b", "Frühstück"), (r"\bZmittag\b", "Mittagessen"),
    (r"\bZnacht\b", "Abendessen"), (r"\bZvieri\b", "Zvieri-Snack"), (r"\bKafi\b", "Café"), (r"\bGigampfi\b", "Wippe"), (r"\bChrabbel", "Krabbel"),
    (r"\bChile\b", "Kirche"), (r"\bChilegass\b", "Kirchgasse"), (r"\bLiechtli\b", "Lichter"), (r"\bGrittibänz\b", "Grittibänz (Brotmännchen)"),
    (r"\bLismi\b", "Strickcafé"), (r"\bBuchstart\b", "Buchstart"), (r"\bhüeti\b", "betreuung"), (r"\bHüeti\b", "Betreuung"), (r"\bBabysitterkurs\b", "Babysitter-Kurs"),
    (r"\bTschutte\b", "Fussball spielen"), (r"\bTschutti\b", "Fussball"), (r"\bGumpe\b", "Hüpfen"), (r"\bluege\b", "schauen"),
]
# Nach der Übersetzung
POST = [
    (r"\bLudothek\b", "toy library"), (r"\bludothek\b", "toy library"), (r"\bSt\. Nicholas\b", "St Nicholas"), (r"\bSanta Claus\b", "St Nicholas"),
    (r"\bFather Christmas\b", "St Nicholas"), (r"\bturnip lantern(s)? parade\b", "turnip lantern parade"), (r"\bFasnacht\b", "carnival"),
]


def prep(t):
    s = t
    if len(s) > 4 and s.upper() == s and re.search(r"[A-ZÄÖÜ]{4}", s):
        s = s.capitalize()
    s = re.sub(r"\b([A-ZÄÖÜ]{5,})\b", lambda m: m.group(1).capitalize(), s)
    for a, b in CH:
        s = re.sub(a, b, s)
    return s


def post(t):
    for a, b in POST:
        t = re.sub(a, b, t)
    return t.strip()


def main():
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    want = texts()
    todo = [t for t in want if t not in cache]
    print(f"{len(want)} Texte, davon neu: {len(todo)}", flush=True)
    if todo:
        from transformers import MarianMTModel, MarianTokenizer
        import torch
        torch.set_num_threads(4)
        name = "Helsinki-NLP/opus-mt-de-en"
        tok = MarianTokenizer.from_pretrained(name)
        model = MarianMTModel.from_pretrained(name).eval()
        t0, B = time.time(), 32
        # nach Länge sortiert ist schneller
        order = sorted(todo, key=len)
        for i in range(0, len(order), B):
            batch = order[i:i + B]
            src = [prep(t) for t in batch]
            enc = tok(src, return_tensors="pt", padding=True, truncation=True, max_length=400)
            with torch.no_grad():
                gen = model.generate(**enc, num_beams=3, max_new_tokens=400)
            for de, en in zip(batch, tok.batch_decode(gen, skip_special_tokens=True)):
                cache[de] = post(en)
            if i // B % 10 == 0:
                print(f"  {i + len(batch)}/{len(order)} ({time.time() - t0:.0f}s)", flush=True)
        CACHE.parent.mkdir(exist_ok=True)
        CACHE.write_text(json.dumps(cache, ensure_ascii=False, sort_keys=True, indent=0), encoding="utf-8")
    used = {t: cache[t] for t in want if t in cache and cache[t] and cache[t] != t}
    (SITE / "en.js").write_text(
        "// Automatisch übersetzt mit Opus-MT (Helsinki-NLP, CC-BY 4.0). Nicht von Hand bearbeiten.\n"
        "window.I18N_EN=" + json.dumps(used, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"site/en.js: {len(used)} Übersetzungen")


if __name__ == "__main__":
    sys.exit(main())
