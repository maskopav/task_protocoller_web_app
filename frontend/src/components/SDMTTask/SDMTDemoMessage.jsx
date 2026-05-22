import React from "react";
import { useTranslation, Trans } from "react-i18next";
import demoGif from "../../assets/sdmt_demo.gif"; // Make sure to add your GIF here
import "./SDMTDemoMessage.css";

export default function SDMTDemoMessage() {
  const { t } = useTranslation("tasks");

  return (
    <div className="sdmt-demo-container">
      <span className="sdmt-demo-text">
        <Trans 
          t={t}
          i18nKey="sdmt.demoText"
        >  
        </Trans>
      </span>
      <img 
        src={demoGif} 
        alt="SDMT Demonstration" 
        className="sdmt-demo-gif"
      />
    </div>
  );
}