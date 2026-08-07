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

import deCommon from "./de/common.json";
import deTasks from "./de/tasks.json";
import deAdmin from "./de/admin.json";


export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "cs", label: "Čeština" },
  { code: "de", label: "Deutsch" },
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
      },
      de: {
        common: deCommon,
        tasks: deTasks,
        admin: deAdmin
      }
    },
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
