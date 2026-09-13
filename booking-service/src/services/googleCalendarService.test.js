import { describe, it, expect } from "vitest";
import { extractTeamNotes, buildManagedDescription } from "./googleCalendarService.js";

describe("extractTeamNotes", () => {
  it("returns an empty string when there is no existing description", () => {
    expect(extractTeamNotes(null)).toBe("");
    expect(extractTeamNotes(undefined)).toBe("");
    expect(extractTeamNotes("")).toBe("");
  });

  it("returns an empty string when the description has no marker yet", () => {
    expect(extractTeamNotes("Available\nRef: abc123")).toBe("");
  });

  it("returns everything after the marker", () => {
    const description =
      "Booked\nRef: abc123" +
      "\n\n--- Team notes (edit freely below — preserved on updates) ---\n" +
      "Pavla is covering this slot";
    expect(extractTeamNotes(description)).toBe("Pavla is covering this slot");
  });

  it("preserves blank lines and further edits within the notes section", () => {
    const description =
      "Booked" +
      "\n\n--- Team notes (edit freely below — preserved on updates) ---\n" +
      "Line one\n\nLine two";
    expect(extractTeamNotes(description)).toBe("Line one\n\nLine two");
  });
});

describe("buildManagedDescription", () => {
  it("joins system lines and appends the marker with no notes when there's no prior description", () => {
    const result = buildManagedDescription(["Available"], null);
    expect(result).toBe(
      "Available\n\n--- Team notes (edit freely below — preserved on updates) ---\n"
    );
  });

  it("carries forward team notes from an existing description", () => {
    const existing =
      "Available" +
      "\n\n--- Team notes (edit freely below — preserved on updates) ---\n" +
      "Room key is with reception";
    const result = buildManagedDescription(["Booked", "Ref: abc123"], existing);
    expect(result).toBe(
      "Booked\nRef: abc123" +
      "\n\n--- Team notes (edit freely below — preserved on updates) ---\n" +
      "Room key is with reception"
    );
  });

  it("drops team notes that were never there rather than inventing a section", () => {
    const result = buildManagedDescription(["Available"], "Available\nRef: old");
    expect(result).toBe(
      "Available\n\n--- Team notes (edit freely below — preserved on updates) ---\n"
    );
  });
});
