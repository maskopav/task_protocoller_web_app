import React, { useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import TaskLayout from '../TaskLayout/TaskLayout';
import AudioGuidePlayer from '../AudioGuidePlayer/AudioGuidePlayer';
import { buildAudioGuidePath } from '../../utils/getAudioGuidePath';
import { SafeButton } from '../Shared/SafeButton';
import './VolumeCheck.css';

// Number spoken in the audio guide, and the four options shown to the
// respondent
const OPTIONS = [17, 32, 59, 84];
const TARGET_NUMBER = OPTIONS[1]; // 32 is the correct answer

const VolumeCheck = ({ onComplete, audioGuideEnabled = true }) => {
    const { t, i18n } = useTranslation("common");
    const [selected, setSelected] = useState(null);

    const handleContinue = () => {
        onComplete({
            timestamp: new Date().toISOString(),
            selectedNumber: selected,
            targetNumber: TARGET_NUMBER,
            correct: selected === TARGET_NUMBER,
        });
    };

    const mainContent = (
        <div className="volume-check-center-area">
            <AudioGuidePlayer
                src={buildAudioGuidePath(i18n.language, "volume_check_audio")}
                playTrigger={`volume-check-${Date.now()}`}
                isRecordingActive={false}
                autoPlay={audioGuideEnabled}
                loop={true}
            />
        </div>
    );

    const controlsContent = (
        <div className="volume-check-controls-stack">
            <div className="volume-check-options" role="radiogroup" aria-label={t("volumeCheck.optionsLabel")}>
                {OPTIONS.map((number) => (
                    <SafeButton
                        key={number}
                        className={`btn-option${selected === number ? ' btn-option--selected' : ''}`}
                        aria-pressed={selected === number}
                        onClick={() => setSelected(number)}
                    >
                        {number}
                    </SafeButton>
                ))}
            </div>
            <SafeButton
                className="btn-start"
                disabled={selected === null}
                onClick={handleContinue}
            >
                {t("buttons.continue", { ns: "common" })}
            </SafeButton>
        </div>
    );

    return (
        <TaskLayout
            className="volume-check-container"
            title={t("volumeCheck.title")}
            instructions={
                <Trans
                    t={t}
                    i18nKey="volumeCheck.instructions"
                />
            }
            mainClassName="volume-check-main-interface"
            controlsClassName="volume-check-bottom-controls"
            controls={controlsContent}
        >
            {mainContent}
        </TaskLayout>
    );
};

export default VolumeCheck;