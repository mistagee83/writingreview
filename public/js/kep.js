// ══════════════════════════════════════════════════════
// WritingReview – kliensoldali képméretezés
//
// Egy telefonos fotó 3-8 MB, a Gemini viszont amúgy is lecsökkenti.
// Feltöltés előtti átméretezés nélkül fizetünk a Storage-ért, a
// letöltési sávszélért és a Function memóriájáért is – a diák pedig
// mobilnetről vár.
// ══════════════════════════════════════════════════════

const MAX_OLDAL = 1500;   // px, a hosszabbik oldalra
const KVALITAS = 0.85;    // JPEG
const MAX_MERET = 10 * 1024 * 1024;  // a Storage-szabály korlátja

/**
 * Képet átméretez, PDF-et változatlanul hagy.
 * Ha bármi elhasal, az eredeti fájlt adja vissza – jobb feltölteni
 * egy nagy képet, mint elbukni a beadáson.
 */
export async function atmeretez(file) {
  if (!file.type.startsWith("image/")) return file;

  try {
    // imageOrientation: a telefonos fotók EXIF-fel állnak fejre
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    const arany = Math.min(1, MAX_OLDAL / Math.max(bitmap.width, bitmap.height));
    if (arany === 1 && file.size <= MAX_MERET) {
      bitmap.close();
      return file;
    }

    const w = Math.round(bitmap.width * arany);
    const h = Math.round(bitmap.height * arany);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", KVALITAS)
    );
    if (!blob) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: Date.now()
    });
  } catch (e) {
    console.warn("Az átméretezés nem sikerült, eredeti fájl megy fel:", e);
    return file;
  }
}

/** Emberi méret-kijelzés. */
export function meret(bajt) {
  if (bajt < 1024) return `${bajt} B`;
  if (bajt < 1024 * 1024) return `${Math.round(bajt / 1024)} kB`;
  return `${(bajt / 1024 / 1024).toFixed(1)} MB`;
}

export function tulNagy(file) {
  return file.size > MAX_MERET;
}
