import { describe, it, expect } from "vitest";
import { absoluteApiAddress } from "./serverAddress";

describe("F-090: absoluteApiAddress", () => {
  it("resolves a relative base against the page, dropping hash and query", () => {
    expect(absoluteApiAddress("./api", "https://host/app/?x=1#/clinics/1/computers")).toBe("https://host/app/api");
  });
  it("keeps an absolute base and drops a trailing slash", () => {
    expect(absoluteApiAddress("https://api.example.com/v1/", "https://host/app/")).toBe("https://api.example.com/v1");
  });
  it("gives an empty string for an empty base", () => {
    expect(absoluteApiAddress("", "https://host/app/")).toBe("");
    expect(absoluteApiAddress(undefined, "https://host/app/")).toBe("");
  });
});
