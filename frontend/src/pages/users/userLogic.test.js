import { describe, expect, it } from "vitest";
import { clinicIds, filterClinics, profileChanged, profileError, toggleClinic } from "./userLogic";

describe("userLogic", () => {
  it("toggles a clinic in and out", () => {
    expect(toggleClinic([1, 2], 3)).toEqual([1, 2, 3]);
    expect(toggleClinic([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it("lists clinic ids of a user", () => {
    expect(clinicIds({ sites: [{ id: 4 }, { id: 7 }] })).toEqual([4, 7]);
    expect(clinicIds({})).toEqual([]);
  });

  it("filters clinics by name, ignoring case", () => {
    const sites = [{ id: 1, name: "Olomouc" }, { id: 2, name: "Brno" }];
    expect(filterClinics(sites, " olo ")).toEqual([sites[0]]);
    expect(filterClinics(sites, "")).toBe(sites);
  });

  it("validates the profile", () => {
    expect(profileError({ name: " ", email: "a@b.cz" })).toBe("nameRequired");
    expect(profileError({ name: "Eva", email: "nope" })).toBe("emailInvalid");
    expect(profileError({ name: "Eva", email: "eva@b.cz" })).toBe("");
  });

  it("detects profile changes after trimming", () => {
    const u = { name: "Eva", email: "eva@b.cz" };
    expect(profileChanged(u, { name: " Eva ", email: "eva@b.cz" })).toBe(false);
    expect(profileChanged(u, { name: "Eva K", email: "eva@b.cz" })).toBe(true);
  });
});
