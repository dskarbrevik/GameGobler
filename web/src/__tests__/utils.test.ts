import { describe, it, expect } from "vitest";
import { formatBytes, formatPercent } from "../utils";

describe("formatBytes", () => {
  it("returns '0 B' for zero", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1.0 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1073741824)).toBe("1.0 GB");
  });

  it("formats with decimals", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
  });
});

describe("formatPercent", () => {
  it("returns 0 when total is 0", () => {
    expect(formatPercent(100, 0)).toBe(0);
  });

  it("calculates percentage", () => {
    expect(formatPercent(50, 200)).toBe(25);
  });

  it("rounds to nearest integer", () => {
    expect(formatPercent(1, 3)).toBe(33);
  });

  it("returns 100 when used equals total", () => {
    expect(formatPercent(1024, 1024)).toBe(100);
  });
});
