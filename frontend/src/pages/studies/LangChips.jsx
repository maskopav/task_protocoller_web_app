// src/pages/studies/LangChips.jsx — protocol language codes as small chips.
import React from "react";

export default function LangChips({ codes = [] }) {
  if (!codes.length) return null;
  return (
    <span className="studies-langs">
      {codes.map((c) => <span key={c} className="studies-lang">{c}</span>)}
    </span>
  );
}
