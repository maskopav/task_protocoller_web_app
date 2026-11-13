import { describe, it, expect } from "vitest";
import { linkBase, joinLink } from "./appReleaseLogic.js";

describe("linkBase", () => {
  it("uses PUBLIC_BASE_URL, without a trailing slash", () => {
    expect(linkBase("https://malenia.example/koubic/", "http://10.0.0.1:10001/#/app-release"))
      .toEqual({ base: "https://malenia.example/koubic", fallback: false });
  });

  it("falls back to the app's own directory, keeping a path prefix", () => {
    expect(linkBase(null, "https://malenia.example/koubic/#/app-release")).toEqual({ base: "https://malenia.example/koubic", fallback: true });
    expect(linkBase(null, "https://malenia.example/koubic/index.html?x=1#/app-release")).toEqual({ base: "https://malenia.example/koubic", fallback: true });
    expect(linkBase(null, "https://malenia.example/koubic#/app-release")).toEqual({ base: "https://malenia.example/koubic", fallback: true });
    expect(linkBase(null, "http://192.168.122.183:10001#/app-release")).toEqual({ base: "http://192.168.122.183:10001", fallback: true });
    expect(linkBase("", "http://192.168.122.183:10001/#/app-release")).toEqual({ base: "http://192.168.122.183:10001", fallback: true });
  });
});

describe("joinLink", () => {
  it("joins with exactly one slash", () => {
    expect(joinLink("https://h/koubic", "api/version/download/latest/install-windows-x64.zip"))
      .toBe("https://h/koubic/api/version/download/latest/install-windows-x64.zip");
    expect(joinLink("https://h/koubic/", "/api/x")).toBe("https://h/koubic/api/x");
  });
});
