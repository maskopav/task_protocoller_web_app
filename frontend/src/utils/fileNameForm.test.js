import { describe, expect, it } from "vitest";
import { fileNameForm } from "./fileNameForm";

describe("fileNameForm", () => {
  it("strips accents and spaces", () => {
    expect(fileNameForm("Fakultní nemocnice Brno")).toBe("FakultninemocniceBrno");
    expect(fileNameForm("Pitié-Salpêtrière")).toBe("Pitie-Salpetriere");
    expect(fileNameForm("Müller Klinikum")).toBe("MullerKlinikum");
  });
  it("keeps letters, digits, underscore and hyphen", () => {
    expect(fileNameForm("Clinic_A-2")).toBe("Clinic_A-2");
  });
  it("drops symbols and punctuation", () => {
    expect(fileNameForm("St. Anne's (Brno) & Co.")).toBe("StAnnesBrnoCo");
  });
  it("matches the Olomouc example", () => {
    expect(fileNameForm("Olomouc University Hospital")).toBe("OlomoucUniversityHospital");
  });
  it("returns an empty string when nothing survives", () => {
    expect(fileNameForm("ěščř ů")).toBe("escr" + "u");
    expect(fileNameForm("日本語 !!")).toBe("");
    expect(fileNameForm("")).toBe("");
    expect(fileNameForm(null)).toBe("");
    expect(fileNameForm(undefined)).toBe("");
  });
});
