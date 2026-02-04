import React from "react";
import { useTranslation } from "react-i18next";
import './VoiceRecorder.css';

// components/VoiceRecorder/StatusIndicator.jsx - Status display component
export const StatusIndicator = ({ status, className = "" }) => {
    const { t } = useTranslation();
    const getStatusText = (status) => {
        switch (status) {
        case 'recording':
            return t("status.recording");
        case 'paused':
            return t("status.paused");
        case 'recorded':
            return t("status.recorded");
        default:
            return t("status.ready");
        }
    };
    
        return (
            <div className={`status ${status} ${className}`}>
            Status: {getStatusText(status)}
            </div>
        );
    };
    