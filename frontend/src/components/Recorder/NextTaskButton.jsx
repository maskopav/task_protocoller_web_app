// components/Recorder/NextTaskButton.jsx
import React from "react";
import { useTranslation } from "react-i18next";
import { SafeButton } from '../Shared/SafeButton';

export const NextTaskButton = ({ onClick, disabled = false, isLoading = false, isProcessing = false }) => {
    const { t } = useTranslation();
    const isBusy = isLoading || isProcessing;
    return (
        <SafeButton onClick={onClick} disabled={disabled || isBusy} className={isBusy ? 'btn-loading' : undefined}>
        {isBusy ? (
            <>
            <span className="spinner" />
            {isLoading ? t("buttons.sending") : t("buttons.processing")}
            </>
        ) : (
            t("buttons.next")
        )}
        </SafeButton>
    );
};
