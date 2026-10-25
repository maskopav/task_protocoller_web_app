// src/i18n/index.js
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Import namespaces
import enCommon from "./en/common.json";
import enTasks from "./en/tasks.json";
import enAdmin from "./en/admin.json";
import enIntro from "./en/intro.json";
import enUploads from "./en/uploads.json";
import enUploadTools from "./en/uploadTools.json";
import enNav from "./en/nav.json";

import csCommon from "./cs/common.json";
import csTasks from "./cs/tasks.json";
import csAdmin from "./cs/admin.json";
import csUploads from "./cs/uploads.json";
import csUploadTools from "./cs/uploadTools.json";
import csNav from "./cs/nav.json";

import deCommon from "./de/common.json";
import deTasks from "./de/tasks.json";
import deAdmin from "./de/admin.json";
import deUploads from "./de/uploads.json";
import deUploadTools from "./de/uploadTools.json";
import deNav from "./de/nav.json";


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
    ns: ["common", "tasks", "admin", "intro", "uploads", "uploadTools", "nav"],
    defaultNS: "common",
    resources: {
      en: {
        common: enCommon,
        tasks: enTasks,
        admin: enAdmin,
        intro: enIntro,
        uploads: enUploads,
        uploadTools: enUploadTools,
        nav: enNav
      },
      cs: {
        common: csCommon,
        tasks: csTasks,
        admin: csAdmin,
        uploads: csUploads,
        uploadTools: csUploadTools,
        nav: csNav
      },
      de: {
        common: deCommon,
        tasks: deTasks,
        admin: deAdmin,
        uploads: deUploads,
        uploadTools: deUploadTools,
        nav: deNav
      }
    },
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
