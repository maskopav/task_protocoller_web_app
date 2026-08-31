// components/Recorder/NextTaskButton.jsx
import React from "react";
import { useTranslation } from "react-i18next";
import { SafeButton } from '../Shared/SafeButton';

export const NextTaskButton = ({ onClick, disabled = false, isLoading = false }) => {
    const { t } = useTranslation();
    return (
        <SafeButton onClick={onClick} disabled={disabled || isLoading} className={isLoading ? 'btn-loading' : undefined}>
        {isLoading ? (
            <>
            <span className="spinner" />
            {t("buttons.sending")}
            </>
        ) : (
            t("buttons.next")
        )}
        </SafeButton>
    );
};
