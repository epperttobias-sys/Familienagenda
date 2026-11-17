"""Schulferien der Volksschule pro Gemeinde aus den Listen des Kantons Zürich.

Liest data/ferien/kanton_JJJJ_JJJJ.xlsx (Volksschulamt) und schreibt site/ferien.js.
Für Schuljahre ohne Liste kommen die Empfehlungen des Kantons dazu (ohne Sportferien).
"""
import glob, json, re, datetime, os
import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
t = open(os.path.join(ROOT, "site/gemeinden.js"), encoding="utf-8").read()
GEM = json.loads(t[t.index("{"):t.rindex("}") + 1])

# Gemeinden, deren Schule anders heisst (Zusammenschlüsse)
MAP = {
    "Aeugst am Albis": "Aeugst", "Buch am Irchel": "Flaachtal", "Flaach": "Flaachtal", "Volken": "Flaachtal",
    "Berg am Irchel": "Flaachtal", "Dorf": "Flaachtal", "Kleinandelfingen": "Andelfingen",
    "Freienstein-Teufen": "Rorbas-Freienstein-Teufen", "Rorbas": "Rorbas-Freienstein-Teufen",
    "Wasterkingen": "Unteres Rafzerfeld", "Wil": "Unteres Rafzerfeld", "Hüntwangen": "Unteres Rafzerfeld",
    "Dänikon": "Dänikon-Hüttikon", "Hüttikon": "Dänikon-Hüttikon",
    "Niederweningen": "Wehntal", "Oberweningen": "Wehntal", "Schleinikon": "Wehntal", "Schöfflisdorf": "Wehntal",
    "Geroldswil": "Oetwil-Geroldswil", "Oetwil an der Limmat": "Oetwil-Geroldswil",
    "Bauma": "Bauma-Sternenberg", "Elsau": "Elsau-Schlatt", "Schlatt": "Elsau-Schlatt",
    "Wiesendangen": "Wiesendangen-Bertschikon", "Winterthur": "Stadt Winterthur", "Zürich": "Zürich-Uto",
}
KEYS = ["h", "w", "s", "f", "heu", "so"]  # Herbst, Weihnachten, Sport, Frühling, Heuferien, Sommer
TYP = {"PSP": "Primarschule", "SSP": "Sekundarschule", "SP": "Schule", "GSP": "Schule", "KSB": "Schulkreis"}

def d(x):
    return x.date().isoformat() if isinstance(x, datetime.datetime) else None

def norm(s):
    return re.sub(r"\s+", " ", (s or "").strip())

jahre = []
for fn in sorted(glob.glob(os.path.join(ROOT, "data/ferien/kanton_*.xlsx"))):
    y = re.search(r"(\d{4})_(\d{4})", fn).groups()
    ws = openpyxl.load_workbook(fn, data_only=True).worksheets[0]
    rows = []
    for r in ws.iter_rows(min_row=4, values_only=True):
        if not r[0] or not r[3]:
            continue
        f = {}
        for i, k in enumerate(KEYS):
            a, b = d(r[5 + 2 * i]), d(r[6 + 2 * i])
            if a and b:
                if a > b:  # Tippfehler in der Liste, z.B. 28.10. statt 28.09.
                    x = datetime.date.fromisoformat(a)
                    a = (x.replace(month=x.month - 1) if x.month > 1 else x.replace(year=x.year - 1, month=12)).isoformat()
                    if a > b:
                        continue
                f[k] = [a, b]
        rows.append({"typ": norm(r[2]), "n": norm(r[3]), "f": f})
    g = {}
    for code, info in GEM.items():
        name = info["name"]
        target = MAP.get(name, name)
        main = next((x for x in rows if x["n"] == target and x["typ"] != "SSP"), None) \
            or next((x for x in rows if x["n"] == target), None) \
            or next((x for x in rows if x["typ"] == "SSP" and target in x["n"]), None)
        if not main:
            print("ohne Schule:", name)
            continue
        e = {"n": TYP.get(main["typ"], "Schule") + " " + main["n"], "f": main["f"]}
        stem = target.split("-")[0].split(" ")[0][:7]
        sek = next((x for x in rows if x["typ"] == "SSP" and x is not main and (target in x["n"] or x["n"].startswith(stem))), None)
        if sek and sek["f"] != main["f"]:
            e["sek"] = {"n": "Sekundarschule " + sek["n"], "f": sek["f"]}
        g[code] = e
    jahre.append({"sj": y[0] + "/" + y[1][2:], "g": g})
    print(fn, len(g), "Gemeinden")

# Empfehlungen des Kantons (Volksschulamt, Feriendaten bis SJ 2032/33), Sportferien legen die Gemeinden fest
EMPF = [
    {"sj": "2027/28", "f": {"h": ["2027-10-11", "2027-10-22"], "w": ["2027-12-20", "2027-12-31"], "f": ["2028-04-17", "2028-04-28"], "so": ["2028-07-17", "2028-08-18"]}},
    {"sj": "2028/29", "f": {"h": ["2028-10-09", "2028-10-20"], "w": ["2028-12-25", "2029-01-05"], "f": ["2029-04-23", "2029-05-04"], "so": ["2029-07-16", "2029-08-17"]}},
]
have = {j["sj"] for j in jahre}
out = {"stand": datetime.date.today().isoformat(), "jahre": jahre, "empf": [e for e in EMPF if e["sj"] not in have],
       "quelle": "https://www.zh.ch/de/bildung/bildungssystem/schulferien.html"}
open(os.path.join(ROOT, "site/ferien.js"), "w", encoding="utf-8").write("window.FERIEN=" + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("ok")
