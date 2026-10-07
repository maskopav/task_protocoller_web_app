import { describe, it, expect, afterAll } from "vitest";
import i18n from "../i18n";
import { getAllParams, getDefaultParams, getResolvedParams, translateTaskInstructions, translateTaskTitle } from "./translations";

describe("getDefaultParams", () => {
  afterAll(() => i18n.changeLanguage("cs"));

  it("keeps the configured default when the language offers it", async () => {
    await i18n.changeLanguage("en");
    expect(getDefaultParams("reading").topic).toBe("northWind");
  });

  it("offers the same reading topic key in cs as in en", async () => {
    await i18n.changeLanguage("cs");
    expect(getDefaultParams("reading").topic).toBe("northWind");
  });

  it("leaves params without translated options untouched", async () => {
    await i18n.changeLanguage("cs");
    expect(getDefaultParams("reading").repeat).toBe(1);
  });
});

describe("standard questionnaire title/instructions", () => {
  afterAll(() => i18n.changeLanguage("cs"));

  it("uses the generic Czech questionnaire text when the type has no Czech copy", async () => {
    await i18n.changeLanguage("cs");
    expect(translateTaskInstructions("hhies")).toBe(i18n.t("questionnaire.instructions", { ns: "tasks" }));
    expect(translateTaskTitle("feedback", { title: "Zpětná vazba" })).toBe(
      i18n.t("questionnaire.title", { ns: "tasks", title: "Zpětná vazba" })
    );
    expect(translateTaskInstructions("hhies")).not.toBe("Please answer the following questions.");
  });

  it("keeps the type's own English text", async () => {
    await i18n.changeLanguage("en");
    expect(translateTaskInstructions("rbdsq")).toBe("Please answer the following questions.");
    expect(translateTaskTitle("rbdsq", { title: "RBD-SQ" })).toBe("Questionnaire: RBD-SQ");
  });
});

describe("getResolvedParams (cs)", () => {
  it("translates phoneme and syllable values like en", async () => {
    await i18n.changeLanguage("cs");
    expect(getResolvedParams("phonation", { phoneme: "a" }).phoneme).toBe("aaa");
    expect(getResolvedParams("syllableRepeating", { syllable: "pataka" }).syllable).toBe("pa-ta-ka");
  });
});

// Protocol editor: admin UI in one language, protocol content in another
describe("explicit protocol language (lng)", () => {
  afterAll(() => i18n.changeLanguage("cs"));

  it("lists option values in the protocol language, labels in the UI language", async () => {
    await i18n.changeLanguage("en");
    const topic = getAllParams("reading", "cs").topic;
    expect(topic.values.find((v: any) => v.key === "northWind").label).toBe("Slunce a vítr");
    expect(topic.label).toBe(getAllParams("reading").topic.label);
  });

  it("resolves the reading text in the protocol language", async () => {
    await i18n.changeLanguage("en");
    expect(getResolvedParams("reading", { topic: "northWind" }, "cs").text).toMatch(/^Jednou se slunce a vítr/);
    expect(getResolvedParams("reading", { topic: "northWind" }).text).not.toMatch(/^Jednou/);
  });
});
