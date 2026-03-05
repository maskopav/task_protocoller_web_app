// src/main.jsx
/* import React from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom"; //
import App from "./App.jsx";
import { AppProvider } from "./context/AppProvider.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <HashRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </HashRouter>
  </StrictMode>
); */

// Temporary change in frontend/src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
// import App from './App.jsx' // Comment this out
import VideoRecorderTest from './VideoRecorderTest.jsx' // Add this
import './pages/Pages.css' 

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <VideoRecorderTest />
  </React.StrictMode>,
)