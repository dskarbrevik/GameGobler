import { describe, it, expect } from "vitest";
import { getConsoleIconUri } from "../consoleIcons";

describe("getConsoleIconUri", () => {
  it("returns a data URI for known system", () => {
    const uri = getConsoleIconUri("nes");
    expect(uri).toMatch(/^data:image\/svg\+xml,/);
  });

  it("returns fallback for unknown system", () => {
    const uri = getConsoleIconUri("unknownsystem999");
    expect(uri).toMatch(/^data:image\/svg\+xml,/);
  });

  it("is case-insensitive", () => {
    const lower = getConsoleIconUri("snes");
    const upper = getConsoleIconUri("SNES");
    expect(lower).toBe(upper);
  });

  it("normalises hyphens and spaces", () => {
    const a = getConsoleIconUri("game-gear");
    const b = getConsoleIconUri("gamegear");
    expect(a).toBe(b);
  });

  it("caches results", () => {
    const first = getConsoleIconUri("gba");
    const second = getConsoleIconUri("gba");
    expect(first).toBe(second);
  });

  it("maps handhelds to handheld icon", () => {
    const gb = getConsoleIconUri("gb");
    const gbc = getConsoleIconUri("gbc");
    expect(gb).toBe(gbc);
  });

  it("maps disc consoles distinctly from cartridge consoles", () => {
    const psx = getConsoleIconUri("psx");
    const nes = getConsoleIconUri("nes");
    expect(psx).not.toBe(nes);
  });

  it("maps clamshell handhelds", () => {
    const nds = getConsoleIconUri("nds");
    const n3ds = getConsoleIconUri("3ds");
    expect(nds).toBe(n3ds);
  });
});
