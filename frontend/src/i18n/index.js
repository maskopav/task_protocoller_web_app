// src/i18n/index.js
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Import namespaces
import enCommon from "./en/common.json";
import enTasks from "./en/tasks.json";
import enAdmin from "./en/admin.json";
import enIntro from "./en/intro.json";

import csCommon from "./cs/common.json";
import csTasks from "./cs/tasks.json";
import csAdmin from "./cs/admin.json";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "cs", label: "Čeština" },
];

// Languages offered when choosing a protocol's content language.
// All of these are selectable and create a real protocol variant.
// `implemented: false` means that language's task/admin text isn't
// translated yet, so i18next's fallbackLng ("en") is used and the
// content shows in English until someone fills in that language's
// JSON files under src/i18n/<code>/.
export const PROTOCOL_LANGUAGES = [
  { code: "en", label: "English", implemented: true },
  { code: "de", label: "Deutsch", implemented: false },
  { code: "it", label: "Italiano", implemented: false },
  { code: "fr", label: "Français", implemented: false },
  { code: "cs", label: "Čeština", implemented: false },
];

i18n
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    lng: "cs",
    ns: ["common", "tasks", "admin", "intro"],
    defaultNS: "common",
    resources: {
      en: {
        common: enCommon,
        tasks: enTasks,
        admin: enAdmin,
        intro: enIntro
      },
      cs: {
        common: csCommon,
        tasks: csTasks,
        admin: csAdmin
      }
    },
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
