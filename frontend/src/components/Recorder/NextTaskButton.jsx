// components/Recorder/NextTaskButton.jsx
import React from "react";
import { useTranslation } from "react-i18next";

export const NextTaskButton = ({ onClick, disabled = false }) => {
    const { t } = useTranslation();
    return (
        <button 
        onClick={onClick} 
        disabled={disabled} 
        className="btn-next"
        >
        {t("buttons.next")}
        </button>
    );
};
