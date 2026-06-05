import React from "react";
import { useTranslation, Trans } from "react-i18next";
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
        src={`${import.meta.env.VITE_APP_BASE_PATH}assets/sdmt/sdmt-demo.gif`} 
        alt="SDMT Demonstration" 
        className="sdmt-demo-gif"
      />
    </div>
  );
}