// Feladatonkénti kézi kiegészítések a gépi kinyeréshez (kinyer.mjs).
// Ide kerül minden, amit a PDF szövegéből gépileg nem lehet kiolvasni: a kimaradó (képes) feladatok, az
// összecsúszott vagy rosszul tördelt bemeneti szövegek, a táblázatos hirdetések, és a tár rövid angol címei.
// Így a functions/feladattar/erettsegi/ fájljai mindig újra előállíthatók; azokat kézzel nem szerkesztjük.
//
// Egy bejegyzés mezői (mind elhagyható):
//   kihagy         { ok: "kep" | "kep_szoveg" | "egyeb", megjegyzes } – a feladat a kimaradt[] listába kerül
//   pre(sorok)     a feladat nyers sorainak átalakítása a feldolgozás előtt
//   post(f)        a kész feladat javítása (a visszatérési érték vagy maga az f)
//   megjegyzes     ellenőrizendő pont(ok) a megjegyzesek[] listába
//
// A vizsgaszöveget itt is szó szerint kell átvenni a feladatlapból; ahol formai beavatkozás kellett
// (táblázat sorokba, kép helyén álló jel), azt megjegyzés jelzi.

// ---------- segédfüggvények a bemeneti szöveg bekezdéseihez ----------
const bek = (f) => f.bemenet.bekezdesek;
/** Új bekezdés kezdődik a megadott szövegrészeknél (ha egy bekezdés belsejében állnak). */
const tor = (...reszek) => (f) => {
  for (const r of reszek) {
    const B = bek(f), i = B.findIndex((b) => b.includes(r));
    if (i < 0) throw new Error(`kezi.mjs (${f.id}): nem találom: ${r}`);
    const k = B[i].indexOf(r);
    if (k === 0) continue;   // már külön bekezdés
    B.splice(i, 1, B[i].slice(0, k).trim(), B[i].slice(k).trim());
  }
  return f;
};
/** A megadott szöveggel kezdődő bekezdést az előzőhöz fűzi. */
const egyesit = (...kezdetek) => (f) => {
  for (const r of kezdetek) {
    const B = bek(f), i = B.findIndex((b) => b.startsWith(r));
    if (i < 1) throw new Error(`kezi.mjs (${f.id}): nem találom a bekezdést: ${r}`);
    B.splice(i - 1, 2, B[i - 1] + " " + B[i]);
  }
  return f;
};
/** Az első bekezdés a bemenet címe. */
const cimKiemel = (f) => { f.bemenet.cim = bek(f).shift(); return f; };
/** A gép által címnek vett első sor mégis bekezdés (pl. több program közül az első neve). */
const cimVissza = (f) => { bek(f).unshift(f.bemenet.cim); f.bemenet.cim = null; return f; };
/** A címhez fűzi a következő bekezdést (két sorba tört cím). */
const cimFolytat = (f) => { f.bemenet.cim += " " + bek(f).shift(); return f; };
/** A bekezdések teljes cseréje (táblázatos vagy összekeveredett szöveg). */
const bekezdesek = (lista) => (f) => { f.bemenet.bekezdesek = lista; return f; };
/** Szövegcsere a bemenet bekezdéseiben. */
const csere = (mit, mire) => (f) => {
  let volt = false;
  f.bemenet.bekezdesek = bek(f).map((b) => { const u = b.split(mit).join(mire); if (u !== b) volt = true; return u; });
  if (!volt) throw new Error(`kezi.mjs (${f.id}): nem találom a cserélendőt: ${mit}`);
  return f;
};
/** A megadott szöveggel kezdődő bekezdés a teendő elejére kerül (a vizsgázóhoz szóló mondat a bemenet után). */
const teendobe = (kezdet) => (f) => {
  const B = bek(f), i = B.findIndex((b) => b.startsWith(kezdet));
  if (i < 0) throw new Error(`kezi.mjs (${f.id}): nem találom: ${kezdet}`);
  f.teendo = B.splice(i, 1)[0] + " " + f.teendo;
  return f;
};
/** Az első bekezdés elején álló cím leválasztása (a gép a címet az első bekezdéshez fűzte). */
const cimLevag = (cim) => (f) => {
  const B = bek(f);
  if (!B[0].startsWith(cim)) throw new Error(`kezi.mjs (${f.id}): az első bekezdés nem ezzel kezdődik: ${cim}`);
  const marad = B[0].slice(cim.length).trim();
  if (marad) B[0] = marad; else B.shift();
  f.bemenet.cim = cim;
  return f;
};
/** A megadott szöveggel kezdődő bekezdés a bemenet címe (pl. a szerzői sor után álló cím). */
const cimLesz = (kezdet, elotag = "") => (f) => {
  const B = bek(f), i = B.findIndex((b) => b.startsWith(kezdet));
  if (i < 0) throw new Error(`kezi.mjs (${f.id}): nem találom: ${kezdet}`);
  f.bemenet.cim = B.splice(i, 1)[0].slice(elotag.length).trim();
  return f;
};
const megjTorol = (re) => (f) => { f.megjegyzesek = f.megjegyzesek.filter((m) => !re.test(m)); return f; };
const lanc = (...fv) => (f) => fv.reduce((x, g) => g(x) || x, f);

export const KEZI = {
  // ---------- kimaradó feladatok (terv 5. fejezet; oldalképen ellenőrizve) ----------
  "2024-maj-kozep-W1": { kihagy: { ok: "kep", megjegyzes: "„Here’s a photo you took of your room” – a 2. irányító szempont (hol hagyhatta az olvasót a szobában) a fotóra épül." } },
  "2015-okt-kozep-W1": { kihagy: { ok: "kep", megjegyzes: "„He sent you a picture of the Museum of Science and Industry” – a helyzet a lapon lévő fotóra utal." } },
  "2016-okt-kozep-W1": { kihagy: { ok: "kep", megjegyzes: "„Here is a map of the area where the cinema is” – a térkép csak képként van a lapon; a 3. irányító szempont (ways of getting there) erre épül." } },
  "2018-okt-kozep-W1": { kihagy: { ok: "kep", megjegyzes: "„sent you this photo and some interesting facts about Holy Island” – a helyzet a lapon lévő fotóra utal." } },
  "2016-maj-kozep-W1": { kihagy: { ok: "kep_szoveg", megjegyzes: "A darab címe (The Curious Incident of the Dog in the Night-Time) csak a plakát képén áll; a szövegrétegben csak „The production won 7 Olivier Awards…” van, így a feladat (ask two questions about the play) kép nélkül nem érthető." } },
  "2009-maj-emelt-W2": { kihagy: { ok: "kep", megjegyzes: "„…about the following inventions:” – a találmányokat két fotó mutatja (laptop, mobiltelefon). Határeset: a teendő megnevezi őket („computers and mobile phones”), így kép nélkül is megírható lenne." } },

  // ---------- javítások ----------
  "2005-maj-kozep-W2": { post: (f) => { f.bemenet.bekezdesek = bek(f).flatMap((b) => b.split(/\s+(?=\d{1,2}\.\d{2} a\.m\.)/)); return f; } },
  "2005-maj2-emelt-W1": {
    // a meghívó után álló „You are surprised … to find out:” és a felsorolás a teendő része; a szószám a záró mondatban
    post: (f) => {
      const B = bek(f), i = B.findIndex((b) => b.startsWith("You are surprised"));
      const pontok = B.slice(i + 1).map((b) => b.replace(/^•\s*/, ""));
      f.bemenet.bekezdesek = B.slice(0, i);
      f.zaro_utasitas = f.teendo;
      f.teendo = B[i];
      f.iranyito_szempontok = pontok;
      f.bemenet.forras = "www.cardinspirations-usa.com";   // útmutató, FORRÁSOK / Íráskészség, Task A
      return megjTorol(/irányító szempontok/)(f);
    },
  },
  "2005-maj2-emelt-W2": { post: (f) => { f.bemenet.forras = "Citizenship for All, Edited by John Rowe, Stanley Thomas Publishing Ltd 1998."; return f; } },
  "2005-nov-kozep-W1": {
    fajta: "notice",   // a klub programismertetője (Mark levelét a lap nem idézi)
    post: tor("chill out in our", "access the internet", "practice karaoke", "engage in indoor-archery", "practice game skills", "participate in all sorts", "play snooker", "take part in weekend", "provides opportunities"),
  },
  "2007-okt-emelt-W1": {
    // a lapon a kew-i program áll felül, a filmes séta alatta; a -raw kimenet fordított sorrendben adja
    post: lanc(tor("On this walk we follow"), (f) => {
      const B = bek(f), i = B.indexOf("Gardens and a Green - Historic Kew");
      if (i !== 1 || B.length !== 3) throw new Error("kezi.mjs (2007-okt-emelt-W1): váratlan bekezdések");
      const film = f.bemenet.cim;
      f.bemenet.cim = B[1];
      f.bemenet.bekezdesek = [B[2], film, B[0]];
      return f;
    }),
  },
  "2007-okt-kozep-W1": { fajta: "advertisement" },   // a balett-előadás ismertetője (José e-mailjét a lap nem idézi)
  "2005-nov-emelt-W2": { fajta: "advertisement" },
  "2009-maj-emelt-W1": { fajta: "other" },           // négy turisztikai helyismertető (Robert e-mailjét a lap nem idézi)
  "2009-okt-emelt-W1": { post: cimKiemel },
  "2010-okt-emelt-W1": { post: cimLevag("Explore the best of the Norwegian Fjords!") },
  "2010-okt-kozep-W1": { fajta: "advertisement" },
  "2010-okt-emelt-W2": { fajta: "article" },   // online magazin híre („decided to comment on it”)
  "2012-okt-emelt-W1": { post: cimLevag("Work on a Penguin Rescue Project in Capetown, South Africa") },
  "2012-okt-kozep-W2": { post: cimLesz("Post subject: ", "Post subject: ") },
  "2013-maj-kozep-W1": { fajta: "advertisement" },   // a programhirdetés (Chris e-mailjét a lap nem idézi)
  "2015-maj-emelt-W1": { post: cimLesz("Part-time Librarian and Research Assistant") },
  "2017-okt-kozep-W1": { post: cimKiemel },
  "2020-maj-emelt-W1": { post: cimKiemel },
  "2020-okt-kozep-W1": { post: cimLevag("Are you considering doing yoga, deepening your yoga practice or becoming a certified yoga teacher?") },
  "2021-maj-kozep-W1": { fajta: "advertisement" },
  "2023-okt-kozep-W1": {
    post: (f) => {
      if (f.bemenet.cim !== "Pine bookshelf in Morley £25 (Discount for students)") throw new Error("kezi.mjs (2023-okt-kozep-W1): váratlan cím");
      f.bemenet.cim = "Pine bookshelf in Morley"; bek(f).unshift("£25 (Discount for students)"); return f;
    },
  },
  "2024-okt-kozep-W1": { post: cimKiemel },
  "2025-okt-emelt-W1": {
    // a kurzus kétsoros címe a bekezdések közé került, a címmezőben az intézmény neve állt
    post: (f) => {
      const B = bek(f);
      if (B[0] !== "Irish Lives in War and Revolution: Exploring" || B[1] !== "Ireland's History 1912-1923") throw new Error("kezi.mjs (2025-okt-emelt-W1): váratlan bekezdések");
      B.splice(0, 2, f.bemenet.cim);
      f.bemenet.cim = "Irish Lives in War and Revolution: Exploring Ireland's History 1912-1923";
      return f;
    },
  },
  "2025-okt-emelt-W2": { post: cimLesz("Schools let us down") },
  "2008-okt-emelt-W2": { post: lanc(tor("The use of performance enhancing"), cimKiemel) },
  "2009-okt-emelt-W2": {
    post: (f) => {
      f.teendo = "Write a letter of 200-250 words to Susan in which you give your opinion on how to behave at a job interview. Include the following points:";
      f.iranyito_szempontok = [
        "how to prepare for the interview;",
        "how to make a good impression: what to wear, how to behave, what questions to ask;",
        "any relevant personal experiences that either you or one of your friends have had.",
      ];
      return f;
    },
    megjegyzes: "A lapon a fő pontok „o” jellel, az alpontok (what to wear…) felsorolásjellel állnak; az alpontokat a 2. ponthoz fűztük.",
  },
  "2010-maj-kozep-W1": { post: tor("Shoot dates:", "Payment details:", "Cast details:", "Applications accepted") },
  "2011-maj-kozep-W1": {
    post: lanc(bekezdesek([
      "Email: REGINALD SPENCER spencermusic@yahoo.com",
      "Instruments: Voice, Guitar, Piano, Flute, Violin, Drums",
      "Ability Levels: Beginners to Advanced",
      "Style(s): classical, pop, jazz, rock, folk",
      "Qualifications: Music degree, 21 years music teaching",
      "Fee (30 minutes): £16.00",
      "Fee (60 minutes): £30.00",
    ]), (f) => { f.bemenet.cim = null; return f; }),
    megjegyzes: "A hirdetés a lapon táblázat; a sorait „fejléc: érték” alakban rögzítettük (a hangszerek vesszővel elválasztva).",
  },
  "2011-maj-kozep-W2": {
    megjegyzes: "A lapon egy mosolygó arc áll (Wingdings-jel); ☺ jellel rögzítettük.",
  },
  "2011-okt-emelt-W2": {
    post: (f) => { f.mufaj = "comment"; f.tipus = "vélemény"; return megjTorol(/műfaj/)(f); },
    megjegyzes: "A lap nem nevez meg műfajt („Write your opinion about Andrew’s story”); a kezdés („Andrew, ….”) fórumhozzászólásra utal, ezért comment.",
  },
  "2011-okt-kozep-W1": { post: egyesit("25th Wedding Anniversary") },
  "2012-maj-emelt-W2": {
    post: (f) => {
      f.bemenet.bekezdesek = bek(f).map((b) => (b === "Curfew1" ? "Curfew¹" : b));
      f.zaro_utasitas = "This is the title of your article: Law and Order at Home?";
      f.bemenet.bekezdesek.push("¹ Curfew: time when children must be home in the evening");
      return f;
    },
    megjegyzes: "A „Curfew” lábjegyzete a lap alján áll; a bemenet végére tettük (¹ jellel).",
  },
  "2012-maj-kozep-W1": { fajta: "advertisement", megjegyzes: "A lapon a bolt fotója áll, a nevével (Baggins Book Bazaar); a szövegrétegben csak a „The largest second-hand bookshop…” mondat van. A feladat nem a képre épül." },
  "2013-okt-emelt-W1": { post: tor("Beer tasting in Antwerp") },
  "2014-okt-kozep-W1": { megjegyzes: "A hirdetésben egy laptop fotója és a „Looks Like This” felirat áll (képként); a feladathoz szükséges adatok a szövegben vannak." },
  "2015-maj-emelt-W2": {
    // a „Begin like this:” után két sor áll: a fejléc és a kezdőmondat
    post: (f) => { const B = bek(f); if (B[B.length - 1] === "As I see it…") B.pop(); f.kezdes = "Nick 17\nAs I see it…"; return f; },
  },
  "2016-okt-kozep-W2": { megjegyzes: "A lapon a társasjáték (Labyrinth) fotója áll; a levél szövege leírja a játékot, a feladat nem a képre épül." },
  "2018-maj-emelt-W2": {
    post: egyesit("Like those big TV", "Children in Need and Red Nose Day"),
    megjegyzes: "A lapon a bekezdés végén egy szomorú arc áll (Wingdings-jel); ☹ jellel rögzítettük.",
  },
  "2019-maj-kozep-W1": { post: lanc(cimVissza, tor("Historical Walking Tour of Newcastle")) },
  "2019-okt-emelt-W1": { post: cimFolytat },
  "2019-okt-kozep-W1": {
    post: lanc(csere(" http://www.maketracks.net/rrr.html", ""), (f) => { f.bemenet.forras = "www.countours.co.uk; http://www.maketracks.net/rrr.html"; return f; }),
    megjegyzes: "A lapon két forrás áll (a szöveg végén és alatta); mindkettő a forrásba került.",
  },
  "2021-okt-emelt-W1": { post: lanc(cimVissza, egyesit("Borough Market is packed")) },
  "2022-maj-kozep-W1": { post: lanc(cimFolytat, tor("Free local pickup.")) },
  "2022-okt-emelt-W1": { post: egyesit("Friday night bowling parties") },
  "2022-okt-kozep-W1": {
    post: (f) => {
      const leiras = bek(f).find((b) => b.startsWith("Description "));
      f.bemenet.cim = null;
      f.bemenet.bekezdesek = [
        "Name: James", "Age: 19", "Languages: Hungarian-English", "City, State or Province: Santa Rosa, California",
        "Country: US", "Lessons: Conversation online", leiras.replace(/^Description /, "Description: "),
      ];
      return f;
    },
    megjegyzes: "A hirdetés a lapon táblázat; a sorait „fejléc: érték” alakban rögzítettük.",
  },
  "2023-maj-kozep-W1": {
    post: bekezdesek(["Visiting Ely Cathedral", "Taking part in a guided tour of Trinity College", "Going to a concert of the choir of King’s College", "Punting on the River Cam"]),
    megjegyzes: "A négy program a lapon képaláírás (fotók fölött); a szövegük teljes, a sorrend az oldalképről.",
  },
  "2024-maj-emelt-W1": { post: tor("“Our aim at the University Dance Society") },
  "2024-okt-emelt-W1": {
    post: lanc(cimKiemel, (f) => {
      const B = bek(f), i = B.findIndex((b) => b.startsWith("City Dog Shelter")), j = B.findIndex((b) => b.startsWith("Want to reserve"));
      B.splice(i, j - i,
        "City Dog Shelter – the place that takes care of and looks for responsible owners for cats and dogs lacking a home",
        "Food Relief – the place that offers immediate food relief services to those in need",
        "Christmas Box Operation – the organization that collects shoeboxes filled with love and toys at Christmas time");
      return f;
    }),
    megjegyzes: "A három szervezet a lapon három hasábban, fotók fölött áll; a szövegük teljes.",
  },
  "2026-okt-emelt-W1": { post: tor("What we offer:") },
  "2026-okt-kozep-W1": { post: lanc(cimFolytat, egyesit("Lagoon team."), tor("To apply email Sigrún")) },
  "2026-okt-kozep-W2": {
    // a PDF a „ti”, „ft”, „tt” ligatúrákat Unicode-megfelelő nélkül tárolja: a pdftotext kihagyja őket
    post: lanc(csere("excep onal", "exceptional"), csere("a er the", "after the"), csere("edi on", "edition"),
      csere("by the me of", "by the time of"), csere("plenty of me.", "plenty of time."), csere("forgo en", "forgotten"),
      csere("pre y urgent", "pretty urgent")),
    megjegyzes: "A PDF-ben a ti/ft/tt ligatúrák szövegrétege hibás; a szavakat (exceptional, after, edition, time, forgotten, pretty) az oldalkép alapján pótoltuk.",
  },
};

// ---------- a képes oldalak döntései (terv 4. fejezet, ellenőrzés 4.) ----------
// Minden feladat, amelynek oldalán az oldalkepek.py képet talált, itt szerepel: „diszito” = a kép csak illusztráció,
// a feladat nem épül rá, a bemeneti szöveg a szövegrétegben megvan; „kihagy” = a KEZI kihagy mezője dönt.
export const KEPDONTES = {
  "2005-maj2-emelt-W1": "diszito", "2005-maj2-emelt-W2": "diszito", "2007-okt-kozep-W1": "diszito",
  "2009-maj-emelt-W2": "kihagy", "2009-okt-kozep-W1": "diszito", "2010-maj-emelt-W1": "diszito",
  "2010-okt-emelt-W1": "diszito", "2011-maj-emelt-W1": "diszito", "2012-maj-emelt-W1": "diszito",
  "2012-maj-kozep-W1": "diszito", "2012-okt-emelt-W1": "diszito", "2013-okt-emelt-W1": "diszito",
  "2014-okt-kozep-W1": "diszito", "2015-okt-emelt-W1": "diszito", "2015-okt-kozep-W1": "kihagy",
  "2016-maj-kozep-W1": "kihagy", "2016-okt-kozep-W1": "kihagy", "2016-okt-kozep-W2": "diszito",
  "2017-maj-emelt-W1": "diszito", "2017-maj-kozep-W1": "diszito", "2017-okt-emelt-W1": "diszito",
  "2017-okt-kozep-W1": "diszito", "2018-maj-emelt-W1": "diszito", "2018-maj-emelt-W2": "diszito",
  "2018-maj-kozep-W1": "diszito", "2018-okt-emelt-W1": "diszito", "2018-okt-kozep-W1": "kihagy",
  "2018-okt-kozep-W2": "diszito", "2019-maj-emelt-W1": "diszito", "2019-maj-kozep-W1": "diszito",
  "2020-maj-emelt-W1": "diszito", "2020-maj-kozep-W1": "diszito", "2020-okt-emelt-W1": "diszito",
  "2020-okt-kozep-W1": "diszito", "2021-maj-emelt-W1": "diszito", "2021-maj-kozep-W1": "diszito",
  "2021-okt-emelt-W1": "diszito", "2021-okt-kozep-W1": "diszito", "2022-maj-emelt-W1": "diszito",
  "2022-maj-kozep-W1": "diszito", "2022-okt-emelt-W1": "diszito", "2023-maj-emelt-W1": "diszito",
  "2023-maj-kozep-W1": "diszito", "2023-okt-kozep-W1": "diszito", "2024-maj-kozep-W1": "kihagy",
  "2024-okt-emelt-W1": "diszito", "2024-okt-kozep-W1": "diszito", "2025-maj-emelt-W1": "diszito",
  "2025-maj-kozep-W1": "diszito", "2025-okt-emelt-W1": "diszito", "2025-okt-kozep-W1": "diszito",
  "2026-maj-kozep-W1": "diszito", "2026-okt-kozep-W1": "diszito",
};

// ---------- a tár rövid angol címei (≤ 80 karakter) ----------
export const CIMEK = {
  "2005-maj-emelt-W1": "Email to Ian about a conservation year in Africa",
  "2005-maj-emelt-W2": "Letter to Louise about exam stress",
  "2005-maj-kozep-W1": "Message answering an ad for a dog walker",
  "2005-maj-kozep-W2": "Report on the snowfall on 15 March",
  "2005-maj2-emelt-W1": "Email to Susan about Nicole's surprise wedding",
  "2005-maj2-emelt-W2": "Letter to Tony about student councils",
  "2005-nov-emelt-W1": "Job application to The Picture People",
  "2005-nov-emelt-W2": "Letter to Sean about a desert expedition",
  "2005-nov-kozep-W1": "Letter to Mark about the youth club programme",
  "2005-nov-kozep-W2": "Letter to Raoul about student jobs",
  "2006-febr-emelt-W1": "Letter to Gena about a balloon flight",
  "2006-febr-emelt-W2": "Letter to Gemma about a summer charity job",
  "2006-febr-kozep-W1": "Letter to Katie declining a housewarming party",
  "2006-febr-kozep-W2": "Letter to Samantha about becoming a model",
  "2006-maj-emelt-W1": "Letter to a building conservation project",
  "2006-maj-emelt-W2": "Letter to Frederic about fear of leaving school",
  "2006-maj-kozep-W1": "Email to Dimitri accepting a musical invitation",
  "2006-maj-kozep-W2": "Letter to Desperate Teen about a shoplifting sister",
  "2006-okt-emelt-W1": "Email applying for an assistant camera job",
  "2006-okt-emelt-W2": "Letter to Lisa about a neighbour's dogs",
  "2006-okt-kozep-W1": "Application to a US summer camp",
  "2006-okt-kozep-W2": "Letter to Michelle about becoming a vegetarian",
  "2007-maj-emelt-W1": "Letter to Nigel about an orangutan volunteer project",
  "2007-maj-emelt-W2": "Letter to Dean about test anxiety",
  "2007-maj-kozep-W1": "Email to Jerry about a computer game for sale",
  "2007-maj-kozep-W2": "Letter to Amelina about studying for an exam",
  "2007-okt-emelt-W1": "Letter to Robert choosing a London guided tour",
  "2007-okt-emelt-W2": "Letter to Raphael about taking a year off",
  "2007-okt-kozep-W1": "Email to José declining a ballet invitation",
  "2007-okt-kozep-W2": "Letter to Jane about a poorly paid babysitting job",
  "2008-maj-emelt-W1": "Application to an animal shelter",
  "2008-maj-emelt-W2": "Article: Lose weight – lose friends?",
  "2008-maj-kozep-W1": "Email to Jack accepting a cookout invitation",
  "2008-maj-kozep-W2": "Letter to Martha about choosing a career",
  "2008-okt-emelt-W1": "Letter to Mike about a charity fundraising job",
  "2008-okt-emelt-W2": "Article: To Win at All Costs?",
  "2008-okt-kozep-W1": "Email applying for a babysitting job",
  "2008-okt-kozep-W2": "Letter to Knit-Wit about an unpaid sweater",
  "2009-maj-emelt-W1": "Email to Robert about a weekend in London",
  "2009-maj-emelt-W2": "Article: New electronic gadgets – blessing or curse?",
  "2009-maj-kozep-W1": "Email to Sinead about a Dublin restaurant",
  "2009-maj-kozep-W2": "Letter to Bobby about starting a new school",
  "2009-okt-emelt-W1": "Email to Dr Chester about therapy dog work",
  "2009-okt-emelt-W2": "Letter to Susan about job interviews",
  "2009-okt-kozep-W1": "Email to Brian accepting a museum invitation",
  "2009-okt-kozep-W2": "Letter to Jane about mobile phones at school",
  "2010-maj-emelt-W1": "Letter to Jason about an art history course in Italy",
  "2010-maj-emelt-W2": "Letter to Madeleine about an expensive birthday invitation",
  "2010-maj-kozep-W1": "Email applying to be in a TV ad",
  "2010-maj-kozep-W2": "Letter to Alex about voluntary work",
  "2010-okt-emelt-W1": "Letter to James about a kayak holiday in Norway",
  "2010-okt-emelt-W2": "Article: Is this the solution? (blood tests at school)",
  "2010-okt-kozep-W1": "Email inviting Jane to a wildlife photo exhibition",
  "2010-okt-kozep-W2": "Email to Amy about a job interview",
  "2011-maj-emelt-W1": "Letter to Edna about a cookery course",
  "2011-maj-emelt-W2": "Letter to Alicia about a lucky mock exam",
  "2011-maj-kozep-W1": "Email to Mr Spencer about music lessons",
  "2011-maj-kozep-W2": "Letter to Lisa about internet safety for teenagers",
  "2011-okt-emelt-W1": "Email applying for a learning support job",
  "2011-okt-emelt-W2": "Comment on Andrew's dilemma about an offensive website",
  "2011-okt-kozep-W1": "Email to Andrew accepting an anniversary invitation",
  "2011-okt-kozep-W2": "Letter to Susan about a friend's eating disorder",
  "2012-maj-emelt-W1": "Email to Jeff about a rock climbing trip",
  "2012-maj-emelt-W2": "Article: Law and Order at Home?",
  "2012-maj-kozep-W1": "Email to Mr Hughes asking for book advice",
  "2012-maj-kozep-W2": "Comment to Jody about children watching TV",
  "2012-okt-emelt-W1": "Email applying for a penguin rescue project",
  "2012-okt-emelt-W2": "Letter to Ivan about noisy neighbours",
  "2012-okt-kozep-W1": "Email to Andy about a room in a shared flat",
  "2012-okt-kozep-W2": "Comment to Ladybird about self-study for an exam",
  "2013-maj-emelt-W1": "Email applying for a library job",
  "2013-maj-emelt-W2": "Letter to Brian about unfair wages",
  "2013-maj-kozep-W1": "Email to Chris accepting an astronomy evening",
  "2013-maj-kozep-W2": "Reply to Peter about pressure from a talented family",
  "2013-okt-emelt-W1": "Email to Don about a biking tour",
  "2013-okt-emelt-W2": "Letter to Tina about a drunk driver in the family",
  "2013-okt-kozep-W1": "Email applying for a kitchen hand job",
  "2013-okt-kozep-W2": "Letter to Myra about a summer acting job",
  "2014-maj-emelt-W1": "Letter applying for a summer camp job",
  "2014-maj-emelt-W2": "Comment on Celia's story about the school president",
  "2014-maj-kozep-W1": "Email to Steve about a bike for sale",
  "2014-maj-kozep-W2": "Letter to Marcus about what to wear for an exam",
  "2014-okt-emelt-W1": "Letter to Josh about charity work in North Carolina",
  "2014-okt-emelt-W2": "Message to Steve about helping a classmate",
  "2014-okt-kozep-W1": "Email to Ann about buying a laptop",
  "2014-okt-kozep-W2": "Letter to Erin about a wrong grade",
  "2015-maj-emelt-W1": "Email applying for a part-time library job",
  "2015-maj-emelt-W2": "Comment on Nick's dilemma at a party",
  "2015-maj-kozep-W1": "Email to Mr Gabaine about driving lessons",
  "2015-maj-kozep-W2": "Email to Tania about the student council",
  "2015-okt-emelt-W1": "Email applying for volunteer work in Nepal",
  "2015-okt-emelt-W2": "Reply to Alan about privacy at university",
  "2015-okt-kozep-W1": "Email to Stan about a museum in Manchester",
  "2015-okt-kozep-W2": "Email to Rachel about her sister's student loan",
  "2016-maj-emelt-W1": "Email to Herman about a cultural English course",
  "2016-maj-emelt-W2": "Reply to Eileen about skipping an audition",
  "2016-maj-kozep-W1": "Email to Mark accepting a theatre invitation",
  "2016-maj-kozep-W2": "Email to Jennifer about a party and her host family",
  "2016-okt-emelt-W1": "Email applying for a job at the Sherlock Holmes Museum",
  "2016-okt-emelt-W2": "Email to Eric about a cruel photo in an online group",
  "2016-okt-kozep-W1": "Email to Nick accepting a cinema invitation",
  "2016-okt-kozep-W2": "Email to Annie about a birthday present for Peter",
  "2017-maj-emelt-W1": "Email to Olga about dancing lessons",
  "2017-maj-emelt-W2": "Comment to Emily about a friend's online relationship",
  "2017-maj-kozep-W1": "Email applying to volunteer at Blue Cross",
  "2017-maj-kozep-W2": "Email to Amy about her rude cousin",
  "2017-okt-emelt-W1": "Email applying for volunteer work on an Icelandic farm",
  "2017-okt-emelt-W2": "Comment to Noah about plagiarism",
  "2017-okt-kozep-W1": "Email to Josh about a bike exhibition",
  "2017-okt-kozep-W2": "Email to Calvin about problems at a new school",
  "2018-maj-emelt-W1": "Email to Tony about an escape game",
  "2018-maj-emelt-W2": "Comment to Esther about charities",
  "2018-maj-kozep-W1": "Email to Ms Fielding about a barista course",
  "2018-maj-kozep-W2": "Comment to Francesca about her sister's debts",
  "2018-okt-emelt-W1": "Email applying for a landscape gardener job",
  "2018-okt-emelt-W2": "Comment on Sheldon's dilemma about a car",
  "2018-okt-kozep-W1": "Email to Brian about a trip to Holy Island",
  "2018-okt-kozep-W2": "Email to Heikki about a gap year in Nepal",
  "2019-maj-emelt-W1": "Message to Ms Swift about a photography course",
  "2019-maj-emelt-W2": "Comment to Patricia about monitoring teenagers",
  "2019-maj-kozep-W1": "Email to Liam choosing a Newcastle tour",
  "2019-maj-kozep-W2": "Comment to Benjamin about becoming a teacher",
  "2019-okt-emelt-W1": "Application to a creative writing workshop",
  "2019-okt-emelt-W2": "Reply to Greg about a false rumour",
  "2019-okt-kozep-W1": "Email to Ian about a walking break in the Highlands",
  "2019-okt-kozep-W2": "Email to Jessica about a vegetarian and a meat lover",
  "2020-maj-emelt-W1": "Email to Richard about a bookshop holiday",
  "2020-maj-emelt-W2": "Comment to Laura about her mother's behaviour",
  "2020-maj-kozep-W1": "Email to Rob about street performing at the Fringe",
  "2020-maj-kozep-W2": "Email to Max about starting a sport",
  "2020-okt-emelt-W1": "Message to Ian about skiing lessons",
  "2020-okt-emelt-W2": "Comment to George about a cheating girlfriend",
  "2020-okt-kozep-W1": "Email to Kushal about an online yoga course",
  "2020-okt-kozep-W2": "Letter to Heikki about a birthday present for his sister",
  "2021-maj-emelt-W1": "Email applying to be an online English tutor",
  "2021-maj-emelt-W2": "Comment to Sam about an expensive birthday present",
  "2021-maj-kozep-W1": "Email applying to be a camp counsellor",
  "2021-maj-kozep-W2": "Email to Max about his broken phone",
  "2021-okt-emelt-W1": "Email to Colin choosing a day out in London",
  "2021-okt-emelt-W2": "Comment to Claire about parents controlling phones",
  "2021-okt-kozep-W1": "Email applying for a café job in Reykjavik",
  "2021-okt-kozep-W2": "Comment to Mia about quitting the piano",
  "2022-maj-emelt-W1": "Email to Erin about a puppetry course",
  "2022-maj-emelt-W2": "Comment to Shane about his sister's job offer",
  "2022-maj-kozep-W1": "Email to Dave about an electric scooter for sale",
  "2022-maj-kozep-W2": "Email to Jan about online language lessons",
  "2022-okt-emelt-W1": "Email to Adam about joining the badminton club",
  "2022-okt-emelt-W2": "Reply to Josh about an overprotective mother",
  "2022-okt-kozep-W1": "Reply to James about a language exchange",
  "2022-okt-kozep-W2": "Email to Jasmin about a dog-walking job",
  "2023-maj-emelt-W1": "Email to Carl about ice skating courses",
  "2023-maj-emelt-W2": "Post replying to Ida about a fortune teller",
  "2023-maj-kozep-W1": "Message to Miranda about a day in Cambridge",
  "2023-maj-kozep-W2": "Comment to Eliza about pets and kitchen hygiene",
  "2023-okt-emelt-W1": "Email to Adam about an online cookery class",
  "2023-okt-emelt-W2": "Comment to Emma about the 100-day dress challenge",
  "2023-okt-kozep-W1": "Email to Miles about a second-hand bookshelf",
  "2023-okt-kozep-W2": "Comment to Mark about getting a pet",
  "2024-maj-emelt-W1": "Email to David about joining a student club",
  "2024-maj-emelt-W2": "Comment to Aneka about fireworks at a wedding",
  "2024-maj-kozep-W1": "Email to Ms Novak about a forgotten e-book reader",
  "2024-maj-kozep-W2": "Email to Pavel about his girlfriend's blue hair",
  "2024-okt-emelt-W1": "Email to Jake about a charity garage sale",
  "2024-okt-emelt-W2": "Comment to Alison about loyalty between friends",
  "2024-okt-kozep-W1": "Email to Sam accepting a 100th birthday invitation",
  "2024-okt-kozep-W2": "Comment to Alyssa about cheating in online exams",
  "2025-maj-emelt-W1": "Email to Mr Koopman about volunteering at a donkey sanctuary",
  "2025-maj-emelt-W2": "Email to Karl about using his cousin's paper",
  "2025-maj-kozep-W1": "Email to Ms Bennett about a book you forgot to return",
  "2025-maj-kozep-W2": "Email to Cynthia about a family dessert tradition",
  "2025-okt-emelt-W1": "Email to Dr Brady about an Irish history course",
  "2025-okt-emelt-W2": "Comment to Kathy about whether college is worth it",
  "2025-okt-kozep-W1": "Email to Rob about borrowing hiking equipment",
  "2025-okt-kozep-W2": "Comment to Annabel about lost headphones",
  "2026-maj-emelt-W1": "Email to Ms Josífková about a creative writing course",
  "2026-maj-emelt-W2": "Comment to Emily about photos posted by her mother",
  "2026-maj-kozep-W1": "Email to Dr Evans rescheduling a dental appointment",
  "2026-maj-kozep-W2": "Comment to Santokh about his sister's eating habits",
  "2026-okt-emelt-W1": "Email to Jake applying to share opinions on TV and podcasts",
  "2026-okt-emelt-W2": "Comment to Norman about drinking at a family wedding",
  "2026-okt-kozep-W1": "Email applying for a lifeguard job at Blue Lagoon",
  "2026-okt-kozep-W2": "Email to Max about a forgotten present for a teacher",
};
