// Avatárok (2026-11-24/25, spec „Fiókbeállítások” → „Avatár”): a tanár egy kész rajzot választ, feltöltés nincs.
// A users/{uid}.avatar csak az itteni azonosítók egyike lehet (vagy hiányzik → monogram). Tiszta modul:
// a hub kliense, a functions (copy-shared) és az appok (másolat, mint a shared/sso.js) is ezt használja.
// A képek a hubon élnek: <hub>/brand/avatars/<id>.svg (96×96, kerek alap a rajzzal).
// ÚJ AVATÁR: SVG a hub/brand/avatars/-ba + egy sor ide; törölni nem szabad (a mentett azonosító megmaradna).

export const AVATARS = Object.freeze([
  { id: 'owl', label: 'Owl' }, { id: 'apple', label: 'Apple' }, { id: 'book', label: 'Book' },
  { id: 'pencil', label: 'Pencil' }, { id: 'globe', label: 'Globe' }, { id: 'chalkboard', label: 'Chalkboard' },
  { id: 'bell', label: 'Bell' }, { id: 'microscope', label: 'Microscope' }, { id: 'palette', label: 'Palette' },
  { id: 'music-note', label: 'Music note' }, { id: 'paper-plane', label: 'Paper plane' }, { id: 'cactus', label: 'Cactus' },
  { id: 'fox', label: 'Fox' }, { id: 'turtle', label: 'Turtle' }, { id: 'bee', label: 'Bee' },
  { id: 'mug', label: 'Mug' }, { id: 'lightbulb', label: 'Light bulb' }, { id: 'rocket', label: 'Rocket' },
  { id: 'compass', label: 'Compass' }, { id: 'sunflower', label: 'Sunflower' },
]);

// Csak admin-fiók választhatja (a hub tulajdonosáé; a szerver ellenőrzi).
export const ADMIN_AVATARS = Object.freeze([{ id: 'sneaker', label: 'Sneaker' }]);

const ALL = new Set([...AVATARS, ...ADMIN_AVATARS].map((a) => a.id));
const ADMIN_ONLY = new Set(ADMIN_AVATARS.map((a) => a.id));

export const HUB_ORIGIN = 'https://mrandrewshub.com';

// Ismert azonosító-e (megjelenítéshez: ismeretlen → monogram).
export const isAvatar = (id) => typeof id === 'string' && ALL.has(id);

// Választhatja-e ez a fiók (mentéshez).
export const canChoose = (id, { admin = false } = {}) => isAvatar(id) && (admin || !ADMIN_ONLY.has(id));

// A kép címe, vagy null (→ monogram). A hubon belül relatív, az appokban a hub címével: avatarSrc(id, HUB_ORIGIN).
export const avatarSrc = (id, base = '') => (isAvatar(id) ? `${base}/brand/avatars/${id}.svg` : null);

// Monogram: a név vagy az e-mail első betűje.
export const initialOf = (name, email) => (String(name || email || '?').trim().charAt(0) || '?').toUpperCase();
