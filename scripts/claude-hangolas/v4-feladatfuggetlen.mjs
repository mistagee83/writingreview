// 4. hangolási változat: a tanár SAJÁT rubrikája marad (ahogy a prodban), és a prompt feladatfüggetlen mércét kap.
// Tanulság a v2/v3-ból: a Claude-ot a kitalált tartalmi elvárások tették szigorúvá (amit a feladat nem kért),
// a sávok jelentésének pontosítása viszont működött. Itt ezért nincs kitalált irányító szempont: csak az számít,
// amit a feladat és a tanár szempontjai ténylegesen kérnek. A v1-ből hiányzott a feladat félreértésének szabálya
// (Lili öt témás első változata ott is magas tartalmi pontot kapott) – ez itt kifejezetten benne van.
export const leiras = "saját rubrika + feladatfüggetlen sávok: csak azt kéri számon, amit a feladat kér";

export function prompt(feladat, szoveg, alapPrompt) {
  return `${alapPrompt}

# A PONTOZÁS MÉRCÉJE (minden szempontnál)
6. Csak azt kérd számon, amit a feladat leírása és a tanár szempontjai ténylegesen kérnek. Amit a feladat
   nem kér (például tágabb összefüggést, javaslatot, helyi példákat, meghatározott számú érvet), annak
   hiányáért ne vonj le; ha a diák mégis megteszi, az erősség.
7. A pont a szempont maximumának arányában ehhez a sávhoz igazodjon:
   - 90–100%: amit a feladat erre a szempontra nézve kér, azt a diák a szintnek megfelelően teljesíti;
     az apró, a megértést nem zavaró hibák ezt nem zárják ki.
   - 70–80%: nagyrészt teljesíti, egy-két érezhető gyengeséggel.
   - 50–60%: részben teljesíti, visszatérő gyengeségekkel.
   - 20–40%: csak kis részben teljesíti, vagy a gyengeségek a megértést is nehezítik.
   - 0–10%: nem teljesíti, vagy hiányzik.
   Félpont adható. Lejjebb csak olyan hiány vagy hiba miatt menj, amely ehhez a szemponthoz tartozik.
8. A tartalomnál / feladatteljesítésnél az a kérdés, hogy a diák azt csinálta-e, amit a feladat kért
   (pl. a megadott lehetőségek közül választott, állást foglalt, indokolta, a kért műfajban és terjedelemben
   írt). Ha igen, és a kifejtés releváns és érthető, az a felső sáv: nem kell részletes vagy szakértői érvelés,
   és egy-egy nem teljesen következetes mondat nem viszi lejjebb. Ha a feladat egy LÉNYEGES kérését nem
   teljesíti (pl. egy helyett több témáról ír felszínesen, más műfajt ír, félreérti a feladatot, vagy
   jelentősen eltér a kért terjedelemtől), az legfeljebb az 50–60%-os sáv.
9. A szerkezetnél: logikus, követhető gondolatmenet, kapcsolódó mondatok, de bekezdések nélkül: 60–70%.
   Ennél lejjebb akkor menj, ha a gondolatmenet sem követhető mindenütt.
10. Egy hibát csak EGY szempontnál vonj le, ott, ahová tartozik (a nyelvi hibát a nyelvtannál vagy
    a szókincsnél, a bekezdésezést a szerkezetnél). A "hibak" listájának hossza önmagában nem csökkenti
    a pontot.`;
}
