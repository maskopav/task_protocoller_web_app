// src/main.jsx
import React from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import { AppProvider } from "./context/AppProvider.jsx";
import { logger } from "./utils/frontendLogger";
// Runs i18n.init() as a side effect. Previously this only happened because
// api/auth.js or ProtocolLanguageSelector.jsx incidentally pulled it into the
// one shared bundle -- harmless when everything was one file, but with
// route-level code-splitting (see App.jsx) any page that doesn't import one
// of those (e.g. ParticipantInterfacePage) never loaded it at all, so
// useTranslation() got an uninitialized i18next instance. Import it directly
// here so it always runs before anything renders, regardless of which page
// loads first.
import "./i18n";

// 1. Catch synchronous runtime errors
window.onerror = function(message, source, lineno, colno, error) {
  logger.fatal('Unhandled Global Error', error || { message, source, lineno, colno });
};

// 2. Catch unhandled asynchronous promise rejections
window.addEventListener('unhandledrejection', event => {
  logger.fatal('Unhandled Promise Rejection', event.reason);
});

createRoot(document.getElementById("root")).render(
  <StrictMode> 
    <HashRouter> 
      <AppProvider> 
        <App /> 
      </AppProvider> 
    </HashRouter> 
  </StrictMode> 
);