// A diák írófelülete (iras.html): mentésjelzés, visszavonás, törlésvédelem, íróüzem.
// Regresszió (2026-11-23): egy diák véletlenül kijelölte és törölte az egész szövegét; az automatikus
// mentés az üres szöveget mentette el, és újratöltés után semmi nem maradt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = await import("../public/js/iras-szerkeszto.js");
const iras = readFileSync(new URL("../public/iras.html", import.meta.url), "utf8");

test("nagy törlés: a kijelölés + törlés és a felülírás igen, a sima javítás nem", () => {
  const hosszu = "Dear Ben, ".repeat(30);                       // 300 karakter
  assert.equal(m.nagyTorles(hosszu, ""), true);                  // mindent törölt
  assert.equal(m.nagyTorles(hosszu, "a"), true);                 // kijelölt mindent, és begépelt egy betűt
  assert.equal(m.nagyTorles(hosszu, hosszu.slice(0, 190)), true); // 110 karakter egyszerre
  assert.equal(m.nagyTorles(hosszu, hosszu.slice(0, -1)), false); // egy Backspace
  assert.equal(m.nagyTorles(hosszu, hosszu.slice(0, -30)), false); // egy mondat, a szöveg nagy része megvan
  assert.equal(m.nagyTorles("Dear Ben, I am fine.", ""), true);  // rövid szövegnél a fele is számít (20+ karakter)
  assert.equal(m.nagyTorles("Dear Ben", ""), false);             // néhány szó: nem kell sáv
  assert.equal(m.nagyTorles("", "abc"), false);
});

test("a megőrzött változat a hosszabb marad; a sáv csak akkor látszik, ha érdemben több", () => {
  assert.equal(m.megorzendo("", "A hosszú szöveg"), "A hosszú szöveg");
  assert.equal(m.megorzendo("A hosszú szöveg, sok munka", "rövid"), "A hosszú szöveg, sok munka");
  const orzott = "x".repeat(200);
  assert.equal(m.visszaallithato(orzott, ""), true);
  assert.equal(m.visszaallithato(orzott, orzott), false);         // már visszaállt
  assert.equal(m.visszaallithato(orzott, "x".repeat(190)), false); // újraírta: nincs mit felajánlani
  assert.equal(m.visszaallithato("", ""), false);
  assert.equal(m.visszaallithato("   ", ""), false);
});

test("bekezdés- és szószám-sáv", () => {
  assert.equal(m.bekezdesSzam(""), 0);
  assert.equal(m.bekezdesSzam("Dear Ben,\n\nThanks.\nBye,\n  \nAnna"), 4);
  assert.equal(m.szoSav(50, null, null), null);
  assert.deepEqual(m.szoSav(60, 80, 120), { szazalek: 50, allapot: "keves" });
  assert.deepEqual(m.szoSav(100, 80, 120), { szazalek: 83, allapot: "jo" });
  assert.deepEqual(m.szoSav(130, 80, 120), { szazalek: 100, allapot: "sok" });
  assert.deepEqual(m.szoSav(40, 80, null), { szazalek: 50, allapot: "keves" });
});

test("a tároló próbája: privát ablakban (kivétel) nem működik", () => {
  const jo = new Map();
  assert.equal(m.taroloMukodik({ setItem: (k, v) => jo.set(k, v), removeItem: (k) => jo.delete(k) }), true);
  assert.equal(jo.size, 0, "a próbakulcs nem marad ott");
  assert.equal(m.taroloMukodik({ setItem: () => { throw new Error("QuotaExceeded"); }, removeItem: () => {} }), false);
});

test("az írófelület bekötése: mentésjelzés, visszavonás, törlésvédelem, íróüzem", () => {
  // látható mentés + figyelmeztetés + azonnali mentés a lap elhagyásakor
  assert.match(iras, /id="mentes-allapot"/);
  assert.match(iras, /id="mentes-hiba"/);
  assert.match(iras, /taroloMukodik\(ls\)/);
  assert.match(iras, /addEventListener\('pagehide', azonnalMent\)/);
  assert.match(iras, /addEventListener\('beforeunload', bezarasElott\)/);
  // a mentés eredményét ellenőrzi (a régi kód csendben elnyelte a hibát)
  assert.match(iras, /ls\.setItem\(PISZKOZAT, mezo\.value\); return true;/);
  // visszavonás: a böngésző saját visszavonása, tartalékként a megőrzött szöveg
  assert.match(iras, /document\.execCommand\('undo'\)/);
  // törlésvédelem: a nagy törlés előtti szöveg külön kulcsra kerül, és visszaállításkor a jelzések szinkronban
  assert.match(iras, /nagyTorles\(elozo, mezo\.value\)/);
  assert.match(iras, /ls\.setItem\(TOROLT, orzott\)/);
  assert.match(iras, /figyelo\.szinkron\(\)/);
  assert.match(iras, /id="torles-sav"/);
  // a beadás után a megőrzött változat törlődik, az íróüzem bezárul
  assert.match(iras, /ls\.removeItem\(TOROLT\)/);
  // íróüzem: ugyanaz a szövegmező (a beillesztés-tiltás így változatlan), Esc-re kilép
  assert.equal((iras.match(/<textarea/g) || []).length, 1);
  assert.match(iras, /classList\.add\('iro-uzem'\)/);
  assert.match(iras, /e\.key === 'Escape'/);
});
