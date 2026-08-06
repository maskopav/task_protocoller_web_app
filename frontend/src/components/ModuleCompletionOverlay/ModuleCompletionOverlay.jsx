import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from "react-i18next";
import './ModuleCompletionOverlay.css';
import { 
    successA, 
    successB, 
    successC, 
    successD 
} from "../../assets/successIcons/successAssets";

const SUCCESS_ICONS = [successA, successB, successC, successD];

export const ModuleCompletionOverlay = ({ category, onComplete }) => {
    const { t } = useTranslation("common");
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete; // always latest, no stale closure
    
    // Retrieve the array of praises from the translation file
    const praises = t("completion.praises", { returnObjects: true });
    
    // Select a random praise from the translated list
    const [praiseText] = useState(() => {
        if (Array.isArray(praises) && praises.length > 0) {
            return praises[Math.floor(Math.random() * praises.length)];
        }
        return "Great job!"; // Fallback text string if translation is missing
    });

    // Select a random visual SVG asset icon
    const [praiseIcon] = useState(() => {
        return SUCCESS_ICONS[Math.floor(Math.random() * SUCCESS_ICONS.length)];
    });

    useEffect(() => {
        const audio = new Audio(`${import.meta.env.VITE_APP_BASE_PATH}audio/sounds/success_sound.m4a`);
        audio.play().catch(e => console.log("Audio play blocked", e));

        const timer = setTimeout(() => onCompleteRef.current(), 2500);

        return () => {
            audio.pause();      // stop it if we unmount/re-run early
            clearTimeout(timer);
        };
    }, []);

    // Check if the current overlay is for a milestone instead of a task module
    const isMilestone = category?.startsWith('milestone_');

    return (
        <div className="module-overlay">
            <div className="praise-card">
                <img 
                    src={praiseIcon} 
                    className="praise-graphic-icon" 
                    alt="Success Celebration Graphic" 
                />
                
                <h2 className="praise-headline">{praiseText}</h2>
                
                <h3>
                    {isMilestone 
                        ? t(`taskLabels.${category}`) 
                        : `${t(`taskLabels.${category}`)} ${t("completion.finished")}`}
                </h3>
            </div>
        </div>
    );
};