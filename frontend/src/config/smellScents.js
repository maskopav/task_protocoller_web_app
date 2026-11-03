// Scents available to the smell test are whatever pictures sit in
// assets/smellIcons/ — the file name is the scent key (hot_dog.png → "hot_dog"),
// so adding a scent is just dropping in a picture. Labels come from
// tasks:smell.scents.<key> if translated, otherwise from the file name.
const files = import.meta.glob("../assets/smellIcons/*.{png,jpg,jpeg,webp,svg}", {
  eager: true,
  query: "?url",
  import: "default",
});

export const SMELL_IMAGES = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.split("/").pop().replace(/\.\w+$/, ""), url])
);

// Always offered as the last option, never picked in the editor
export const NO_SCENT_KEY = "no_scent";
export const SMELL_OPTION_COUNT = 4;

export const SMELL_SCENT_KEYS =Object.keys(SMELL_IMAGES).filter((k) => k !== NO_SCENT_KEY).sort();

const humanize = (key) => key.charAt(0).toUpperCase() + key.slice(1).replace(/[_-]+/g, " ");

// t should be fixed to the protocol's language (i18n.getFixedT(lang, "tasks"))
export const scentLabel = (key, t) =>
  key === NO_SCENT_KEY
    ? t("smell.noScent", { defaultValue: "No scent" })
    : t(`smell.scents.${key}`, { defaultValue: humanize(key) });

// All language variants of a protocol share one copy of its questions, saved in
// the language they were authored in. So on the participant's screen scent
// labels are rebuilt from their keys in the participant's language, and the
// default question text ("Which smell do you detect?" in any language) is
// swapped for this language's. Custom question text and options without a
// scent key (an image path or emoji) are shown as written.
// t: fixed to the "tasks" namespace; defaultTexts: the default question text
// in every language.
export const localizeSmellQuestion = (question, t, defaultTexts) => {
  const keyOf = (label) => {
    const raw = question.optionImages?.[label];
    return /^\w+$/.test(raw ?? "") ? raw : null;
  };
  const labels = (question.options || []).map((label) => (keyOf(label) ? scentLabel(keyOf(label), t) : label));
  const text = (question.text ?? "").trim();
  return {
    ...question,
    text: !text || defaultTexts.has(text) ? t("smell.questionText", { defaultValue: question.text }) : question.text,
    options: labels,
    optionImages: Object.fromEntries(
      (question.options || []).map((label, i) => [labels[i], question.optionImages?.[label]])
    ),
  };
};
