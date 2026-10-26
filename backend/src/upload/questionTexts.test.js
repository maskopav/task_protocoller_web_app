import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { questionTextsFromSnapshot, readQuestionTexts } from "./questionTexts.js";
import { writeZip } from "../../test/fixtures/zipWriter.js";

const dirs = [];
afterAll(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const snapshot = {
  defaultLanguage: "cs",
  protocols: [{
    name: "PD", project: "Proj",
    tasks: [{ type: "QUESTIONNAIRE", questions: [
      { questionKey: "p1_t1_q1", questionTextKey: "p1_t1_q1_text", questionOptions: ["p1_t1_q1_o1", "p1_t1_q1_o2"] },
      { questionKey: "p1_t1_q2", questionTextKey: "p1_t1_q2_text" },
    ] }],
  }],
  strings: { cs: { p1_t1_q1_text: "Kouříte?", p1_t1_q1_o2: "Ne", p1_t1_q2_text: "Poznámka" }, en: { p1_t1_q1_text: "Smoke?" } },
};
const meta = {
  protocolName: "PD", protocolProject: "Proj",
  answerMaps: [{ p1_t1_q1: ["p1_t1_q1_o2"], p1_t1_q2: "free text", p1_t9_q1: "x" }],
};

describe("questionTextsFromSnapshot", () => {
  it("maps question keys and option keys to text in the default language", () => {
    expect(questionTextsFromSnapshot(snapshot, meta)).toEqual({
      p1_t1_q1: "Kouříte?", p1_t1_q1_o2: "Ne", p1_t1_q2: "Poznámka",
    });
  });
  it("returns {} without strings", () => {
    expect(questionTextsFromSnapshot({ protocols: [] }, meta)).toEqual({});
  });
});

describe("readQuestionTexts", () => {
  it("reads the snapshot from a ZIP, and returns {} for a broken file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qtexts-"));
    dirs.push(dir);
    const file = path.join(dir, "s.zip");
    fs.writeFileSync(file, writeZip([{ name: "task_configuration_snapshot.json", data: JSON.stringify(snapshot) }]));
    expect((await readQuestionTexts(file, meta)).p1_t1_q1).toBe("Kouříte?");
    fs.writeFileSync(file, "not a zip");
    expect(await readQuestionTexts(file, meta)).toEqual({});
    expect(await readQuestionTexts(path.join(dir, "missing.zip"), meta)).toEqual({});
  });
});
