import { describe, it, expect } from "vitest";
import { SMELL_IMAGES, SMELL_SCENT_KEYS, NO_SCENT_KEY, scentLabel, localizeSmellQuestion } from "./smellScents";
import i18n from "../i18n";
import cs from "../i18n/cs/tasks.json";

// Mimics i18next: returns defaultValue when the key isn't translated
const t = (key, { defaultValue }) => (key === "smell.scents.rose" ? "Růže" : defaultValue);

describe("smellScents", () => {
  it("discovers pictures by file name, keeping 'No scent' out of the pickable list", () => {
    expect(SMELL_IMAGES[NO_SCENT_KEY]).toBeTruthy();
    expect(SMELL_SCENT_KEYS).not.toContain(NO_SCENT_KEY);
  });

  it("labels a scent from its translation, else from its file name", () => {
    expect(scentLabel("rose", t)).toBe("Růže");
    expect(scentLabel("hot_dog", t)).toBe("Hot dog");
    expect(scentLabel(NO_SCENT_KEY, t)).toBe("No scent");
  });

  // A new picture in assets/smellIcons/ also needs a Czech label, otherwise
  // Czech protocols silently show the English file-name fallback
  it("has a Czech label for every scent picture", () => {
    const tCs = i18n.getFixedT("cs", "tasks");
    expect(SMELL_SCENT_KEYS.filter((k) => !cs.smell.scents[k])).toEqual([]);
    expect(scentLabel("pine", tCs)).toBe("Jehličí");
    expect(scentLabel(NO_SCENT_KEY, tCs)).toBe("Nic necítím");
  });

  // Every language variant of a protocol stores the same questions, in the
  // language they were authored in
  it("shows an authored question's labels and default text in the participant's language", () => {
    const defaultTexts = new Set(["en", "cs"].map((l) => i18n.getFixedT(l, "tasks")("smell.questionText")));
    const authoredInCs = {
      id: "s1", text: "Jakou vůni cítíte?",
      options: ["Jehličí", "🍓 vlastní", "Nic necítím"],
      optionImages: { "Jehličí": "pine", "🍓 vlastní": "🍓", "Nic necítím": NO_SCENT_KEY },
    };
    const en = localizeSmellQuestion(authoredInCs, i18n.getFixedT("en", "tasks"), defaultTexts);
    expect(en.text).toBe("Which smell do you detect?");
    expect(en.options).toEqual(["Pine", "🍓 vlastní", "No scent"]); // emoji option kept as written
    expect(en.optionImages).toEqual({ Pine: "pine", "🍓 vlastní": "🍓", "No scent": NO_SCENT_KEY });

    const back = localizeSmellQuestion(en, i18n.getFixedT("cs", "tasks"), defaultTexts);
    expect(back.options).toEqual(authoredInCs.options);
    expect(back.text).toBe("Jakou vůni cítíte?");

    // Custom question text stays as written
    expect(localizeSmellQuestion({ ...authoredInCs, text: "Co cítíte u č. 1?" },
      i18n.getFixedT("en", "tasks"), defaultTexts).text).toBe("Co cítíte u č. 1?");
  });
});
