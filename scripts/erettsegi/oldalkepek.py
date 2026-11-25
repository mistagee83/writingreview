# Az írásfeladatok oldalainak képfelmérése (a terv 4. fejezete, ellenőrzés 4.).
#
# Minden feladatlap IV. (íráskészség) részének feladatoldalain felsorolja a beágyazott képeket
# (helyük és az oldalhoz mért méretük), és a képes oldalakat PNG-be rajzolja, hogy ember is
# megnézhesse: a bemeneti szöveg (hirdetés, poszt) szövegként van-e a PDF-ben, vagy csak képként.
#
# Használat (PyMuPDF kell: pip install pymupdf):
#   python scripts/erettsegi/oldalkepek.py <forrásmappa> [png-mappa]
# Kimenet: scripts/erettsegi/oldalkepek.json (a kinyerő és az ellenőrző olvassa).
# A forráslistát a forraslista.json adja (a kinyer.mjs --lista írja).
import json, os, re, sys
import pymupdf

ITT = os.path.dirname(os.path.abspath(__file__))
forras = sys.argv[1]
png = sys.argv[2] if len(sys.argv) > 2 else None
lista = json.load(open(os.path.join(ITT, 'forraslista.json'), encoding='utf-8'))
IRAS = re.compile(r'IV\. ?(összetevő|vizsgarész)|Angol nyelv IV\.')
TASK = re.compile(r'^(?:Task|TASK) ([0-9AB])\s*$', re.M)

ki = {}
for lap in lista:
    doc = pymupdf.open(os.path.join(forras, lap['feladatlap']))
    oldalak = []
    for i, page in enumerate(doc):
        szoveg = page.get_text()
        if not IRAS.search(szoveg):
            continue
        cimkek = TASK.findall(szoveg)
        # csak a feladatot tartalmazó oldal kell (az utasítás „Write …” sora), a válaszoldal nem
        if not cimkek or not re.search(r'\bwords\b|^\s*Begin\b', szoveg, re.M):
            continue
        terulet = page.rect.width * page.rect.height
        kepek = []
        for info in page.get_image_info():
            x0, y0, x1, y1 = info['bbox']
            arany = (x1 - x0) * (y1 - y0) / terulet
            if arany < 0.005:          # logó, apró díszítés
                continue
            # a kép területén lévő szöveg (ha van, a kép mögött/fölött szövegréteg is van)
            belso = page.get_text('text', clip=pymupdf.Rect(x0, y0, x1, y1)).strip()
            kepek.append({'bbox': [round(x0), round(y0), round(x1), round(y1)],
                          'arany': round(arany, 3), 'szoveg_a_kepen': len(belso)})
        oldalak.append({'oldal': i + 1, 'feladatok': cimkek, 'kepek': kepek})
        if png and kepek:
            os.makedirs(png, exist_ok=True)
            page.get_pixmap(dpi=70).save(os.path.join(png, f"{lap['id']}-o{i + 1}.png"))
    ki[lap['id']] = oldalak

with open(os.path.join(ITT, 'oldalkepek.json'), 'w', encoding='utf-8') as f:
    json.dump(ki, f, ensure_ascii=False, indent=1)
print(len(ki), 'lap;', sum(1 for v in ki.values() for o in v if o['kepek']), 'képes feladatoldal')
