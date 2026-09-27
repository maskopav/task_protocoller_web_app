// src/main.jsx
import React from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import { AppProvider } from "./context/AppProvider.jsx";
import { logger } from "./utils/frontendLogger";
import { cleanupExpiredAndUploaded } from "./utils/offlineStorage";

// Participant recordings are health data sitting unencrypted in IndexedDB;
// purge uploaded and expired (48h) ones on every app start. Never throws.
cleanupExpiredAndUploaded();

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