import { describe, it, expect, vi } from "vitest";

vi.mock("../utils/logger.js", () => ({ logToFile: vi.fn() }));

import { buildQuestionnaireAnswersCsv, buildTaskResultsCsv } from "./sessionArchiveBuilder.js";

// CSV text -> array of rows (every cell is quoted by buildCsv; no embedded
// newlines in these fixtures, so a line split is enough).
function parseCsv(text) {
  return text
    .replace(/^﻿/, "")
    .split("\r\n")
    .map((line) => line.slice(1, -1).split('","').map((c) => c.replace(/""/g, '"')));
}

const params = {
  title: "Language background",
  questions: [
    { id: 1001, text: "Native language" },
    { id: 1002, text: "How often do you speak it?" },
    { id: 1003, text: "Age of acquisition" },
  ],
};

const questionnaireRow = {
  session_id: 7,
  protocol_task_id: 55,
  repeat_index: 1,
  created_at: "2026-10-09 15:00:00",
  category: "languageQuestionnaire",
  task_type: "questionnaire",
  params: JSON.stringify(params),
  payload: JSON.stringify({
    taskType: "questionnaire",
    answers: {
      1001: ["Čeština", "English"],
      "1002__Čeština": "Daily",
      1003: "Age (years)",
      "1003__freeText__Age (years)": "0",
    },
  }),
};

const sdmtRow = {
  session_id: 7,
  protocol_task_id: 56,
  repeat_index: 1,
  created_at: "2026-10-09 15:05:00",
  category: "sdmt",
  task_type: "cognitive",
  params: null,
  payload: JSON.stringify({ result: { correctTaps: 40, totalTaps: 41 } }),
};

describe("buildQuestionnaireAnswersCsv", () => {
  it("exports questionnaires identified by task type, not category", () => {
    const rows = parseCsv(buildQuestionnaireAnswersCsv([questionnaireRow, sdmtRow]));
    const [header, ...data] = rows;

    expect(header).toEqual([
      "session_id", "questionnaire", "protocol_task_id", "repeat_index",
      "question_id", "question_text", "answer", "created_at",
    ]);
    expect(data).toHaveLength(4);
    expect(data.every((r) => r[1] === "Language background")).toBe(true);
  });

  it("labels plain, per-language and free-text answer keys with the question text", () => {
    const data = parseCsv(buildQuestionnaireAnswersCsv([questionnaireRow])).slice(1);
    const byId = Object.fromEntries(data.map((r) => [r[4], r]));

    expect(byId["1001"][5]).toBe("Native language");
    expect(byId["1001"][6]).toBe("Čeština; English");
    expect(byId["1002__Čeština"][5]).toBe("How often do you speak it? [Čeština]");
    expect(byId["1003__freeText__Age (years)"][5]).toBe("Age of acquisition [free text: Age (years)]");
    expect(byId["1003__freeText__Age (years)"][6]).toBe("0");
  });

  it("falls back to the payload's taskType when the task type is unknown", () => {
    const orphan = { ...questionnaireRow, task_type: null, params: null, category: null };
    const data = parseCsv(buildQuestionnaireAnswersCsv([orphan])).slice(1);

    expect(data).toHaveLength(4);
    expect(data.find((r) => r[4] === "1001")[5]).toBe("1001"); // no definition -> raw key
  });
});

describe("buildTaskResultsCsv", () => {
  it("keeps non-questionnaire results and leaves questionnaires out", () => {
    const data = parseCsv(buildTaskResultsCsv([questionnaireRow, sdmtRow])).slice(1);

    expect(data).toHaveLength(1);
    expect(data[0][1]).toBe("sdmt");
  });
});
