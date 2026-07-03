// components/Recorder/NextTaskButton.jsx
import React from "react";
import { useTranslation } from "react-i18next";

export const NextTaskButton = ({ onClick, disabled = false, isLoading = false }) => {
    const { t } = useTranslation();
    return (
        <button onClick={onClick} disabled={disabled || isLoading}>
        {isLoading ? (
            <>
            <span className="spinner" />
            {t("buttons.sending")}
            </>
        ) : (
            t("buttons.next")
        )}
        </button>
    );
};
