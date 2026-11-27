// 1. hangolási változat: a pontskála kalibrálása (az alapmérésben a Claude 5 pontos szempontnál
// sosem adott 3-nál többet, és ugyanazt a hibát több szempontnál is levonta).
export const leiras = "sávleírás a pontokhoz, a szinthez mért teljesítés, nincs kettős levonás";

export function prompt(feladat, szoveg, alapPrompt) {
  return `${alapPrompt}

# A PONTOZÁS KALIBRÁLÁSA (fontos)
6. A pontszám azt méri, mennyire teljesíti a dolgozat az ADOTT SZINT (és évfolyam) elvárását,
   nem azt, mennyire hibátlan vagy anyanyelvi. Egy jó, a szintnek megfelelő diákdolgozat
   a szempont maximumának 80–100%-át kapja, akkor is, ha van benne néhány hiba.
   Szempontonként ehhez a sávhoz igazodj (a maximum arányában):
   - 100%: a szinten teljes mértékben teljesíti a szempontot; az apró, a megértést nem
     zavaró hibák nem zárják ki.
   - 80%: jól teljesíti, kisebb, nem visszatérő gyengeségekkel.
   - 60%: elfogadhatóan teljesíti, de érezhető, visszatérő gyengeségekkel.
   - 40%: csak részben teljesíti; a gyengeségek a megértést vagy a feladatot is érintik.
   - 20%: alig teljesíti.
   - 0%: hiányzik, vagy nem a feladatra válaszol.
   Félpont adható. Használd a teljes skálát: a jól sikerült dolgozat kapjon magas pontot.
7. Egy hibát csak EGY szempontnál vonj le, ott, ahová tartozik (a helyesírást és a
   nyelvtani hibát a nyelvtannál/szókincsnél, a bekezdésezést a szerkezetnél). A tartalmi
   pontszámot ne csökkentse a nyelvi hiba, és a szerkezetit se a tartalmi gyengeség.
8. A tartalomnál az a kérdés, hogy a dolgozat a feladatra válaszol-e, világos-e az
   álláspontja, és alátámasztja-e. Az érvek eredetiségét vagy mélységét a szinthez mérd:
   egy diáktól nem várható szakértői érvelés.
9. A "hibak" listája és a pontozás független: attól, hogy sok apró hibát gyűjtöttél ki,
   a pontszám nem lesz alacsonyabb, ha a hibák a szinten megszokottak és nem zavarják a megértést.`;
}
