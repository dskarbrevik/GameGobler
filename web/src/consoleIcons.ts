/**
 * Minimal SVG icons for retro game consoles.
 * Each returns a data URI suitable for <img src=...>.
 * Icons are simple monochrome silhouettes.
 */

const svgCache = new Map<string, string>();

function makeDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function icon(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

// ─── Icon Definitions ────────────────────────────────

// Generic controller (fallback)
const CONTROLLER = icon(
  `<rect x="8" y="20" width="48" height="28" rx="14" fill="none"/>
   <circle cx="22" cy="34" r="4"/>
   <circle cx="42" cy="34" r="3"/>
   <circle cx="48" cy="28" r="3"/>
   <circle cx="36" cy="28" r="3"/>
   <line x1="28" y1="26" x2="28" y2="30"/>
   <line x1="26" y1="28" x2="30" y2="28"/>`
);

// Handheld (Game Boy style)
const HANDHELD = icon(
  `<rect x="16" y="4" width="32" height="56" rx="4"/>
   <rect x="20" y="8" width="24" height="20" rx="2"/>
   <circle cx="32" cy="42" r="5"/>
   <line x1="22" y1="38" x2="22" y2="42"/>
   <line x1="20" y1="40" x2="24" y2="40"/>`
);

// Clamshell handheld (DS/3DS style)
const CLAMSHELL = icon(
  `<rect x="12" y="2" width="40" height="26" rx="3"/>
   <rect x="16" y="5" width="32" height="18" rx="1"/>
   <rect x="12" y="36" width="40" height="26" rx="3"/>
   <rect x="16" y="39" width="32" height="14" rx="1"/>
   <line x1="12" y1="30" x2="52" y2="30"/>
   <circle cx="48" cy="56" r="2"/>`
);

// Home console box (NES/SNES/Genesis style)
const CONSOLE_BOX = icon(
  `<rect x="6" y="16" width="52" height="20" rx="3"/>
   <rect x="12" y="20" width="20" height="8" rx="1"/>
   <circle cx="46" cy="30" r="3"/>
   <line x1="6" y1="36" x2="6" y2="44"/>
   <line x1="58" y1="36" x2="58" y2="44"/>`
);

// Disc console (PlayStation/Saturn/Dreamcast style)
const DISC_CONSOLE = icon(
  `<rect x="4" y="20" width="56" height="16" rx="4"/>
   <circle cx="28" cy="28" r="8"/>
   <circle cx="28" cy="28" r="3"/>
   <rect x="46" y="24" width="10" height="4" rx="1"/>`
);

// TV/Monitor (arcade/computer style)
const MONITOR = icon(
  `<rect x="8" y="6" width="48" height="36" rx="3"/>
   <rect x="12" y="10" width="40" height="28" rx="1"/>
   <rect x="24" y="42" width="16" height="4"/>
   <rect x="18" y="46" width="28" height="4" rx="2"/>`
);

// Portable disc (PSP style)
const PORTABLE_WIDE = icon(
  `<rect x="4" y="14" width="56" height="36" rx="8"/>
   <rect x="16" y="18" width="32" height="24" rx="2"/>
   <circle cx="10" cy="32" r="4"/>
   <circle cx="54" cy="32" r="2"/>
   <circle cx="54" cy="26" r="2"/>`
);

// ─── System → Icon mapping ───────────────────────────

const SYSTEM_ICON_MAP: Record<string, string> = {
  // Nintendo handhelds
  gb: HANDHELD,
  gbc: HANDHELD,
  gba: HANDHELD,
  gamegear: HANDHELD,
  gg: HANDHELD,
  lynx: HANDHELD,
  ngp: HANDHELD,
  ngpc: HANDHELD,
  wonderswan: HANDHELD,
  wonderswancolor: HANDHELD,
  pokemini: HANDHELD,
  supervision: HANDHELD,
  gamate: HANDHELD,

  // Clamshell handhelds
  nds: CLAMSHELL,
  "3ds": CLAMSHELL,
  n3ds: CLAMSHELL,
  dsi: CLAMSHELL,

  // PSP / Vita
  psp: PORTABLE_WIDE,
  psvita: PORTABLE_WIDE,

  // Nintendo home consoles
  nes: CONSOLE_BOX,
  famicom: CONSOLE_BOX,
  fds: CONSOLE_BOX,
  snes: CONSOLE_BOX,
  sfc: CONSOLE_BOX,
  n64: CONSOLE_BOX,
  gc: CONSOLE_BOX,
  gamecube: CONSOLE_BOX,
  wii: CONSOLE_BOX,
  wiiu: CONSOLE_BOX,
  switch: CONSOLE_BOX,
  virtualboy: CONSOLE_BOX,
  satellaview: CONSOLE_BOX,
  sufami: CONSOLE_BOX,
  sgb: CONSOLE_BOX,
  "super gameboy": CONSOLE_BOX,

  // Sega home consoles
  mastersystem: CONSOLE_BOX,
  sms: CONSOLE_BOX,
  megadrive: CONSOLE_BOX,
  genesis: CONSOLE_BOX,
  "sega32x": CONSOLE_BOX,
  "32x": CONSOLE_BOX,
  segacd: DISC_CONSOLE,
  saturn: DISC_CONSOLE,
  dreamcast: DISC_CONSOLE,
  sg1000: CONSOLE_BOX,

  // Sony
  psx: DISC_CONSOLE,
  ps1: DISC_CONSOLE,
  ps2: DISC_CONSOLE,
  ps3: DISC_CONSOLE,

  // Microsoft
  xbox: DISC_CONSOLE,
  xbox360: DISC_CONSOLE,

  // NEC
  pcengine: CONSOLE_BOX,
  tg16: CONSOLE_BOX,
  "turbografx-16": CONSOLE_BOX,
  pcenginecd: DISC_CONSOLE,
  tgcd: DISC_CONSOLE,
  pcfx: DISC_CONSOLE,
  supergrafx: CONSOLE_BOX,

  // SNK
  neogeo: CONSOLE_BOX,
  neogeocd: DISC_CONSOLE,

  // Atari
  atari2600: CONSOLE_BOX,
  atari5200: CONSOLE_BOX,
  atari7800: CONSOLE_BOX,
  atarijaguar: CONSOLE_BOX,
  atarist: MONITOR,

  // Computers
  amiga: MONITOR,
  amiga600: MONITOR,
  amiga1200: MONITOR,
  amigacd32: DISC_CONSOLE,
  c64: MONITOR,
  c128: MONITOR,
  vic20: MONITOR,
  pet: MONITOR,
  msx: MONITOR,
  msx2: MONITOR,
  zxspectrum: MONITOR,
  amstradcpc: MONITOR,
  bbc: MONITOR,
  bbcmicro: MONITOR,
  x68000: MONITOR,
  pc88: MONITOR,
  pc98: MONITOR,
  sharp: MONITOR,
  fm7: MONITOR,
  fmtowns: DISC_CONSOLE,
  apple2: MONITOR,
  apple2gs: MONITOR,
  macintosh: MONITOR,
  dos: MONITOR,
  pc: MONITOR,
  scummvm: MONITOR,
  ti99: MONITOR,
  dragon32: MONITOR,
  samcoupe: MONITOR,
  trs80: MONITOR,
  coco: MONITOR,
  adam: MONITOR,
  ags: MONITOR,
  easyrpg: MONITOR,
  openbor: MONITOR,
  pico8: MONITOR,
  tic80: MONITOR,
  uzebox: CONSOLE_BOX,

  // Coleco / Mattel / misc
  colecovision: CONSOLE_BOX,
  intellivision: CONSOLE_BOX,
  vectrex: CONSOLE_BOX,
  odyssey2: CONSOLE_BOX,
  channelf: CONSOLE_BOX,
  astrocade: CONSOLE_BOX,
  arcadia: CONSOLE_BOX,
  creativision: CONSOLE_BOX,

  // Arcade
  arcade: MONITOR,
  mame: MONITOR,
  fbneo: MONITOR,
  naomi: MONITOR,
  atomiswave: MONITOR,
  model2: MONITOR,
  model3: MONITOR,

  // 3DO / CD-i / Nuon
  "3do": DISC_CONSOLE,
  cdi: DISC_CONSOLE,
  nuon: DISC_CONSOLE,

  // BIOS / misc
  bios: CONTROLLER,
  ports: MONITOR,
};

/**
 * Get a data URI for the console icon matching the given system name.
 * Falls back to a generic controller icon.
 */
export function getConsoleIconUri(systemName: string): string {
  const key = systemName.toLowerCase().replace(/[\s\-_]/g, "");
  if (svgCache.has(key)) return svgCache.get(key)!;

  // Try exact match, then try common aliases
  let svg = SYSTEM_ICON_MAP[key];
  if (!svg) {
    // Try partial matches for hyphenated ES-DE folder names
    const normalized = systemName.toLowerCase();
    for (const [k, v] of Object.entries(SYSTEM_ICON_MAP)) {
      if (normalized.includes(k) || k.includes(normalized)) {
        svg = v;
        break;
      }
    }
  }

  const uri = makeDataUri(svg ?? CONTROLLER);
  svgCache.set(key, uri);
  return uri;
}
