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
import enRecording from "./en/recording.json";
import enStudies from "./en/studies.json";
import enClinics from "./en/clinics.json";
import enUsers from "./en/users.json";
import enLibrary from "./en/library.json";

import csCommon from "./cs/common.json";
import csTasks from "./cs/tasks.json";
import csAdmin from "./cs/admin.json";
import csUploads from "./cs/uploads.json";
import csUploadTools from "./cs/uploadTools.json";
import csNav from "./cs/nav.json";
import csRecording from "./cs/recording.json";
import csStudies from "./cs/studies.json";
import csClinics from "./cs/clinics.json";
import csUsers from "./cs/users.json";
import csLibrary from "./cs/library.json";

import deCommon from "./de/common.json";
import deTasks from "./de/tasks.json";
import deAdmin from "./de/admin.json";
import deUploads from "./de/uploads.json";
import deUploadTools from "./de/uploadTools.json";
import deNav from "./de/nav.json";
import deRecording from "./de/recording.json";
import deStudies from "./de/studies.json";
import deClinics from "./de/clinics.json";
import deUsers from "./de/users.json";
import deLibrary from "./de/library.json";


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
    ns: ["common", "tasks", "admin", "intro", "uploads", "uploadTools", "nav", "recording", "studies", "clinics", "users", "library"],
    defaultNS: "common",
    resources: {
      en: {
        common: enCommon,
        tasks: enTasks,
        admin: enAdmin,
        intro: enIntro,
        uploads: enUploads,
        uploadTools: enUploadTools,
        nav: enNav,
        recording: enRecording,
        studies: enStudies,
        clinics: enClinics,
        users: enUsers,
        library: enLibrary
      },
      cs: {
        common: csCommon,
        tasks: csTasks,
        admin: csAdmin,
        uploads: csUploads,
        uploadTools: csUploadTools,
        nav: csNav,
        recording: csRecording,
        studies: csStudies,
        clinics: csClinics,
        users: csUsers,
        library: csLibrary
      },
      de: {
        common: deCommon,
        tasks: deTasks,
        admin: deAdmin,
        uploads: deUploads,
        uploadTools: deUploadTools,
        nav: deNav,
        recording: deRecording,
        studies: deStudies,
        clinics: deClinics,
        users: deUsers,
        library: deLibrary
      }
    },
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
