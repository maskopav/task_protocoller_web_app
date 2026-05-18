import React from "react";
import { useTranslation, Trans } from "react-i18next";
import demoGif from "../../assets/color_arrangement_demo.gif";
import "./D15DemoMessage.css";

export default function D15DemoMessage() {
  const { t } = useTranslation("tasks");

  return (
    <div className="d15-demo-container">
      <span className="d15-demo-text">
        <Trans 
          t={t}
          i18nKey="d15colour.demoText">
        </Trans>
      </span>
      <img 
        src={demoGif} 
        alt="D-15 Test Demonstration" 
        className="d15-demo-gif"
      />
    </div>
  );
}