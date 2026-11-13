// A diák nyugtája a feladatlinken (iras.html) és a közös visszajelzés-nézet.
// Regresszió (2026-11-13, élő próba a prodon): a nyugtán a diák saját linkje csak másolható/QR volt,
// nem kattintható, és ha a diák visszajött, a jóváhagyott visszajelzést sem mutatta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const olvas = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const iras = olvas("../public/iras.html");
const vj = olvas("../public/visszajelzes.html");

const fuggvenyTorzs = (src, nev) => {
  const eleje = src.indexOf(`function ${nev}(`);
  assert.ok(eleje >= 0, `nincs ${nev}`);
  return src.slice(eleje, src.indexOf("\n  }\n", eleje));
};

test("a nyugtán a diák linkje kattintható (a visszajelzés-oldalra mutat), a QR és a másolás megmarad", () => {
  const torzs = fuggvenyTorzs(iras, "nyugtaMutat");
  assert.match(torzs, /<a [^>]*id="btn-megnyit"[^>]*href="\$\{esc\(url\)\}"/);
  assert.match(torzs, /visszajelzes\.html\?d=\$\{encodeURIComponent\(nyugta\.diakToken\)\}/);
  assert.match(torzs, /qrSvg\(url/);
  assert.match(torzs, /id="btn-masol"/);
});

test("visszatéréskor a nyugta megkérdezi a szervert, és jóváhagyás után ott mutatja a visszajelzést", () => {
  const torzs = fuggvenyTorzs(iras, "nyugtaMutat");
  assert.match(torzs, /await diakVisszajelzes\(\{ token: nyugta\.diakToken \}\)/);
  assert.match(torzs, /adat\.allapot === 'kesz'\) keszNyugta\(adat\)/);
  assert.match(torzs, /visszajelzesHtml\(adat\)/);
  assert.match(torzs, /id="btn-frissit"/);
  // a mentett nyugta ellenőriz, a friss beadás utáni nem (akkor biztosan várakozik)
  assert.match(iras, /nyugtaMutat\(mentettNyugta, \{ ellenoriz: true \}\)/);
  assert.match(iras, /nyugtaMutat\(nyugta\);/);
  // nincs folyamatos lekérdezés
  assert.ok(!/setInterval/.test(iras));
});

test("a két diákoldal ugyanazt a közös nézetet használja", () => {
  for (const [lap, src] of [["iras.html", iras], ["visszajelzes.html", vj]]) {
    assert.match(src, /import \{ visszajelzesHtml[^}]*\} from '\.\/js\/visszajelzes-nezet\.js'/, lap);
  }
  assert.ok(!vj.includes("function rajzol("), "a régi, lapba épített rajzolás kikerült");
});

test("a közös nézet: jegy, pontok, tanári szöveg, a diák szövege – HTML-escape-pel", async () => {
  const { visszajelzesHtml } = await import("../public/js/visszajelzes-nezet.js");
  const html = visszajelzesHtml({
    cim: "Levél <b>", becenev: "Kék Sárkány", beadva: "2026-11-13T08:00:00Z", lejar: "2026-11-27T08:00:00Z",
    szoveg: "Dear <Tom>,", visszajelzes: {
      jegy: 4, jegy_tipus: "jegy", szoveg: "Szép munka.\nFigyelj az igeidőkre.", jovahagyva: "2026-11-13T09:00:00Z",
      osszpontszam: 16, max_pontszam: 20, szazalek: 80,
      szempontok: [{ cim: "Tartalom", pont: 4, max: 5, megjegyzes: "Jó" }]
    }
  });
  assert.ok(html.includes("Levél &lt;b&gt;"));
  assert.ok(html.includes("Dear &lt;Tom&gt;,"));
  assert.ok(html.includes("Szép munka.<br/>Figyelj az igeidőkre."));
  assert.ok(html.includes("Tartalom"));
  assert.ok(html.includes("80%"));
  // szempontok nélkül nincs pontozás-táblázat
  const ures = visszajelzesHtml({ cim: "", becenev: "x", szoveg: "y", visszajelzes: { szoveg: "z", szempontok: [] } });
  assert.ok(!ures.includes("<table"));
});
