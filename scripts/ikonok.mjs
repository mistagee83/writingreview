// ══════════════════════════════════════════════════════
// WritingReview – alkalmazásikonok generálása
//
//   node scripts/ikonok.mjs
//
// Miért kódból és nem képszerkesztőből: így az ikon FORRÁSA a repóban
// van, nem egy megmagyarázhatatlan bináris. Ha változik a márkaszín,
// egy sort írunk át és újrafuttatjuk. Nincs hozzá külső könyvtár sem –
// a PNG-t a beépített zlib írja.
//
// A rajzolás előjeles távolságfüggvényekkel (SDF) megy, 4×4-es
// túlmintavételezéssel: így az élek simák, és nem kell betűrasterizáló
// egy ilyen egyszerű jelhez.
//
// A jel: sötét alap (a topbar színe), rajta világos lap két
// szövegsorral, és egy narancs pipa – „átnézett dolgozat".
// ══════════════════════════════════════════════════════

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const GYOKER = join(dirname(fileURLToPath(import.meta.url)), "..");
const KI = join(GYOKER, "public", "icons");

// ── márkaszínek (public/css/app.css :root) ──
const INK = [15, 15, 15, 255];
const PAPER = [245, 242, 236, 255];
const VONAL = [201, 194, 180, 255];
const ACCENT = [212, 80, 10, 255];

// ══════════════════════════════════════════
// SDF-EK – minden 512-es egységrácson
// ══════════════════════════════════════════

function lekerekitettSDF(px, py, x, y, w, h, r) {
  const cx = Math.abs(px - (x + w / 2)) - (w / 2 - r);
  const cy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
  const kx = Math.max(cx, 0);
  const ky = Math.max(cy, 0);
  return Math.min(Math.max(cx, cy), 0) + Math.hypot(kx, ky) - r;
}

/** Vastag vonalszakasz (kapszula) – a pipa két szárához. */
function kapszulaSDF(px, py, ax, ay, bx, by, r) {
  const dx = bx - ax;
  const dy = by - ay;
  const hossz2 = dx * dx + dy * dy;
  let t = hossz2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / hossz2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) - r;
}

// ══════════════════════════════════════════
// A JEL
// ══════════════════════════════════════════

/**
 * @param {boolean} teljesAlap true → sarok nélküli, éltől élig alap.
 *   Maszkolható ikonhoz és az iOS-hez kell: ott a rendszer vágja a
 *   formát, és egy saját lekerekítés csúnyán duplázódna.
 * @param {number} tartalek a tartalom zsugorítása (maszkolható ikonnál
 *   a belső ~80% a biztonságos zóna)
 */
function jel(teljesAlap, tartalek) {
  const alakok = [];

  alakok.push({
    szin: INK,
    sdf: (x, y) => teljesAlap
      ? lekerekitettSDF(x, y, 0, 0, 512, 512, 0)
      : lekerekitettSDF(x, y, 0, 0, 512, 512, 112)
  });

  // A tartalom a közép felé zsugorodik, hogy a maszk ne vágja le.
  //
  // FIGYELEM az iránnyal: nem az alakot skálázzuk, hanem a mintavételi
  // pontot transzformáljuk vissza az eredeti koordinátákba. Egy k-szorosra
  // zsugorított alakon a p pixel akkor van belül, ha a 256+(p-256)/k pont
  // az eredetin belül van. Szorzással épp NAGYOBB lett a jel.
  const k = tartalek;
  const tx = (v) => 256 + (v - 256) / k;

  alakok.push({
    szin: PAPER,
    sdf: (x, y) => lekerekitettSDF(tx(x), tx(y), 120, 84, 272, 344, 24)
  });

  const sorok = [
    [156, 140, 200], [156, 196, 168]
  ];
  for (const [sx, sy, sw] of sorok) {
    alakok.push({
      szin: VONAL,
      sdf: (x, y) => lekerekitettSDF(tx(x), tx(y), sx, sy, sw, 20, 10)
    });
  }

  // Pipa: két kapszula, kerek véggel
  alakok.push({
    szin: ACCENT,
    sdf: (x, y) => Math.min(
      kapszulaSDF(tx(x), tx(y), 178, 312, 232, 366, 22),
      kapszulaSDF(tx(x), tx(y), 232, 366, 352, 246, 22)
    )
  });

  return alakok;
}

// ══════════════════════════════════════════
// RASZTERIZÁLÁS
// ══════════════════════════════════════════

const MINTA = 4;   // 4×4 túlmintavételezés élenként

function rajzol(meret, alakok) {
  const puffer = Buffer.alloc(meret * meret * 4);
  const skala = 512 / meret;

  for (let py = 0; py < meret; py++) {
    for (let px = 0; px < meret; px++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (const alak of alakok) {
        // Fedés túlmintavételezéssel
        let fedes = 0;
        for (let sy = 0; sy < MINTA; sy++) {
          for (let sx = 0; sx < MINTA; sx++) {
            const x = (px + (sx + 0.5) / MINTA) * skala;
            const y = (py + (sy + 0.5) / MINTA) * skala;
            if (alak.sdf(x, y) < 0) fedes++;
          }
        }
        if (fedes === 0) continue;

        const al = (fedes / (MINTA * MINTA)) * (alak.szin[3] / 255);
        // "source over" összeolvasztás
        r = alak.szin[0] * al + r * (1 - al);
        g = alak.szin[1] * al + g * (1 - al);
        b = alak.szin[2] * al + b * (1 - al);
        a = al + a * (1 - al);
      }

      const i = (py * meret + px) * 4;
      puffer[i] = Math.round(r);
      puffer[i + 1] = Math.round(g);
      puffer[i + 2] = Math.round(b);
      puffer[i + 3] = Math.round(a * 255);
    }
  }
  return puffer;
}

// ══════════════════════════════════════════
// PNG ÍRÁS
// ══════════════════════════════════════════

const CRC_TABLA = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(puffer) {
  let c = 0xffffffff;
  for (const b of puffer) c = CRC_TABLA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(tipus, adat) {
  const hossz = Buffer.alloc(4);
  hossz.writeUInt32BE(adat.length);
  const test = Buffer.concat([Buffer.from(tipus, "ascii"), adat]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(test));
  return Buffer.concat([hossz, test, crc]);
}

function png(meret, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(meret, 0);
  ihdr.writeUInt32BE(meret, 4);
  ihdr[8] = 8;    // bitmélység
  ihdr[9] = 6;    // színtípus: RGBA
  ihdr[10] = 0;   // tömörítés: deflate
  ihdr[11] = 0;   // szűrés
  ihdr[12] = 0;   // nem interlaced

  // Soronként egy szűrőbájt (0 = nincs szűrés)
  const sorok = Buffer.alloc((meret * 4 + 1) * meret);
  for (let y = 0; y < meret; y++) {
    sorok[y * (meret * 4 + 1)] = 0;
    rgba.copy(sorok, y * (meret * 4 + 1) + 1, y * meret * 4, (y + 1) * meret * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(sorok, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// ══════════════════════════════════════════
// GENERÁLÁS
// ══════════════════════════════════════════

const IKONOK = [
  // A manifest "any" ikonjai: saját lekerekítéssel
  { fajl: "icon-192.png", meret: 192, teljesAlap: false, tartalek: 1 },
  { fajl: "icon-512.png", meret: 512, teljesAlap: false, tartalek: 1 },

  // Maszkolható: éltől élig alap, a tartalom a belső biztonságos zónában.
  // A rendszer vágja körre/squircle-re, ezért nem rajzolunk sarkot.
  { fajl: "icon-maskable-512.png", meret: 512, teljesAlap: true, tartalek: 0.72 },

  // iOS a manifestet a főképernyőn nem használja – ez kell neki.
  // Szintén éltől élig, mert az iOS a saját maszkját teszi rá.
  { fajl: "apple-touch-icon.png", meret: 180, teljesAlap: true, tartalek: 0.86 },

  { fajl: "favicon-32.png", meret: 32, teljesAlap: false, tartalek: 1 }
];

mkdirSync(KI, { recursive: true });

for (const { fajl, meret, teljesAlap, tartalek } of IKONOK) {
  const adat = png(meret, rajzol(meret, jel(teljesAlap, tartalek)));
  writeFileSync(join(KI, fajl), adat);
  console.log(`  ${fajl.padEnd(26)} ${meret}×${meret}  ${(adat.length / 1024).toFixed(1)} kB`);
}
console.log(`\n${IKONOK.length} ikon elkészült: public/icons/`);
