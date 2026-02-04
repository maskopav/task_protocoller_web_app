import React, { useEffect, useState } from 'react';
import { useTranslation } from "react-i18next";
import './ModuleCompletionOverlay.css';

export const ModuleCompletionOverlay = ({ category, onComplete }) => {
    const { t } = useTranslation("common");
    
    // Retrieve the array of praises from the translation file
    const praises = t("completion.praises", { returnObjects: true });
    
    // Select a random praise from the translated list
    const [praise] = useState(() => {
        if (Array.isArray(praises) && praises.length > 0) {
            return praises[Math.floor(Math.random() * praises.length)];
        }
        return "🌟"; // Fallback
    });

    useEffect(() => {
        // Play a success sound
        const audio = new Audio('/sounds/success_fanfare.mp3');
        audio.play().catch(e => console.log("Audio play blocked", e));

        // Auto-close after 2.5 seconds
        const timer = setTimeout(onComplete, 2500);
        return () => clearTimeout(timer);
    }, [onComplete]);

    return (
        <div className="module-overlay">
            <div className="praise-card">
                <h2>{praise}</h2>
                <h3>{t(`taskLabels.${category}`)}{t("completion.completedModule")}</h3>
            </div>
        </div>
    );
};