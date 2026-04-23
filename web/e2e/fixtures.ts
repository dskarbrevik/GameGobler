/**
 * Centralized mock data for Playwright E2E tests.
 * Shapes match the Python API models / TypeScript types exactly.
 */

export const SETTINGS = {
  library_path: "/home/user/roms",
  unzip_on_transfer: false,
  schema_version: 1,
};

export const SETTINGS_EMPTY = {
  library_path: "",
  unzip_on_transfer: false,
  schema_version: 1,
};

export const VERSION = {
  version: "0.1.2",
  latest: null,
  update_available: false,
  release_url: null,
};

export const VERSION_WITH_UPDATE = {
  version: "0.1.2",
  latest: "0.2.0",
  update_available: true,
  release_url: "https://github.com/dskarbrevik/GameGobler/releases/tag/v0.2.0",
};

export const SYSTEMS = [
  { name: "gba", path: "/home/user/roms/gba", game_count: 42, total_size: 536_870_912 },
  { name: "nes", path: "/home/user/roms/nes", game_count: 128, total_size: 67_108_864 },
  { name: "snes", path: "/home/user/roms/snes", game_count: 85, total_size: 268_435_456 },
  { name: "nds", path: "/home/user/roms/nds", game_count: 23, total_size: 2_147_483_648 },
  { name: "n64", path: "/home/user/roms/n64", game_count: 17, total_size: 134_217_728 },
  { name: "gb", path: "/home/user/roms/gb", game_count: 64, total_size: 16_777_216 },
  { name: "gbc", path: "/home/user/roms/gbc", game_count: 38, total_size: 33_554_432 },
  { name: "megadrive", path: "/home/user/roms/megadrive", game_count: 56, total_size: 134_217_728 },
];

export const GBA_GAMES = [
  {
    name: "Metroid Fusion (USA).gba",
    size: 8_388_608,
    has_cover: true,
    meta: {
      title: "Metroid Fusion",
      regions: ["USA"],
      languages: [],
      release_type: null,
      release_num: null,
      revision: null,
      features: [],
      date: null,
      is_bios: false,
      extension: "gba",
    },
  },
  {
    name: "Pokemon - Fire Red Version (USA, Europe) (Rev 1).gba",
    size: 16_777_216,
    has_cover: true,
    meta: {
      title: "Pokemon - Fire Red Version",
      regions: ["USA", "Europe"],
      languages: [],
      release_type: null,
      release_num: null,
      revision: "Rev 1",
      features: [],
      date: null,
      is_bios: false,
      extension: "gba",
    },
  },
  {
    name: "The Legend of Zelda - The Minish Cap (USA).gba",
    size: 16_777_216,
    has_cover: false,
    meta: {
      title: "The Legend of Zelda - The Minish Cap",
      regions: ["USA"],
      languages: [],
      release_type: null,
      release_num: null,
      revision: null,
      features: [],
      date: null,
      is_bios: false,
      extension: "gba",
    },
  },
  {
    name: "GBA BIOS (World).bin",
    size: 16_384,
    has_cover: false,
    meta: {
      title: "GBA BIOS",
      regions: ["World"],
      languages: [],
      release_type: null,
      release_num: null,
      revision: null,
      features: [],
      date: null,
      is_bios: true,
      extension: "bin",
    },
  },
];

export const DEVICES = [
  {
    device_id: "/Volumes/EMUROMS",
    device_type: "volume",
    label: "EMUROMS",
    storage: {
      "/Volumes/EMUROMS": {
        path: "/Volumes/EMUROMS",
        free: 26_843_545_600,
        total: 31_457_280_000,
      },
    },
  },
];

export const DEVICES_EMPTY: typeof DEVICES = [];

export const VOLUME_STATUS = {
  fstype: "exfat",
  is_initialized: true,
  systems: [
    { name: "gba", game_count: 5 },
    { name: "nes", game_count: 12 },
    { name: "snes", game_count: 3 },
  ],
  bios_count: 2,
};

export const DEVICE_FILES = [
  { name: "gba", path: "/gba", is_dir: true },
  { name: "nes", path: "/nes", is_dir: true },
  { name: "snes", path: "/snes", is_dir: true },
  { name: "bios", path: "/bios", is_dir: true },
  { name: "readme.txt", path: "/readme.txt", is_dir: false },
];

export const DEVICE_GAMES_GBA = [
  {
    name: "Metroid Fusion (USA).gba",
    size: 8_388_608,
    has_cover: true,
    system: "gba",
    meta: {
      title: "Metroid Fusion",
      regions: ["USA"],
      languages: [],
      release_type: null,
      release_num: null,
      revision: null,
      features: [],
      date: null,
      is_bios: false,
      extension: "gba",
    },
  },
];

export const INSTALLED_GAMES = [
  ...DEVICE_GAMES_GBA,
];

export const SEARCH_RESULTS = [
  {
    name: "Metroid Fusion (USA).gba",
    size: 8_388_608,
    has_cover: true,
    system: "gba",
    meta: {
      title: "Metroid Fusion",
      regions: ["USA"],
      languages: [],
      release_type: null,
      release_num: null,
      revision: null,
      features: [],
      date: null,
      is_bios: false,
      extension: "gba",
    },
  },
  {
    name: "Metroid - Zero Mission (USA).gba",
    size: 8_388_608,
    has_cover: false,
    system: "gba",
    meta: {
      title: "Metroid - Zero Mission",
      regions: ["USA"],
      languages: [],
      release_type: null,
      release_num: null,
      revision: null,
      features: [],
      date: null,
      is_bios: false,
      extension: "gba",
    },
  },
];

export const DISCOVER_VOLUMES = [
  { path: "/Volumes/EMUROMS", label: "EMUROMS", fstype: "exfat", size: 31_457_280_000 },
  { path: "/Volumes/SANDISK", label: "SANDISK", fstype: "fat32", size: 15_728_640_000 },
];

export const SCRAPE_SUPPORTED = ["gba", "nes", "snes", "gb", "gbc", "n64", "nds", "megadrive"];

export const COVER_STATS = {
  total: 42,
  with_cover: 30,
  cover_dir: "/home/user/roms/gba/covers",
};

export const LIBRARY_PATH = "/home/user/roms";

/**
 * Filenames returned by GET /api/devices/games (string[], not objects).
 * This is the per-system list of game filenames on the device.
 */
export const DEVICE_GAME_NAMES_GBA = ["Metroid Fusion (USA).gba"];

/**
 * Files returned when browsing a subdirectory on a device (e.g. /gba).
 */
export const DEVICE_FILES_SUBDIR = [
  { name: "Metroid Fusion (USA).gba", path: "/gba/Metroid Fusion (USA).gba", is_dir: false },
  { name: "Pokemon - Fire Red Version (USA, Europe) (Rev 1).gba", path: "/gba/Pokemon - Fire Red Version (USA, Europe) (Rev 1).gba", is_dir: false },
];

/**
 * Extended GBA game list with diverse metadata for filter/sort tests.
 * Includes games with different regions, release types, features, and languages.
 */
export const GBA_GAMES_EXTENDED = [
  ...GBA_GAMES,
  {
    name: "Advance Wars (Europe) (Beta).gba",
    size: 4_194_304,
    has_cover: false,
    meta: {
      title: "Advance Wars",
      regions: ["Europe"],
      languages: ["En", "De", "Fr"],
      release_type: "Beta",
      release_num: null,
      revision: null,
      features: ["Rumble"],
      date: null,
      is_bios: false,
      extension: "gba",
    },
  },
  {
    name: "Mario Kart - Super Circuit (Japan).gba",
    size: 12_582_912,
    has_cover: true,
    meta: {
      title: "Mario Kart - Super Circuit",
      regions: ["Japan"],
      languages: ["Ja"],
      release_type: null,
      release_num: null,
      revision: "Rev 2",
      features: [],
      date: null,
      is_bios: false,
      extension: "gba",
    },
  },
];
