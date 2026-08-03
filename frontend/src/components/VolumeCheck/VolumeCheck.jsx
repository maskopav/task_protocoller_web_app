import React from 'react';
import { useTranslation, Trans } from 'react-i18next';
import TaskLayout from '../TaskLayout/TaskLayout';
import AudioGuidePlayer from '../AudioGuidePlayer/AudioGuidePlayer';
import { buildAudioGuidePath } from '../../utils/getAudioGuidePath';
import { SafeButton } from '../Shared/SafeButton';
import './VolumeCheck.css';

const VolumeCheck = ({ onComplete, audioGuideEnabled = true }) => {
    const { t, i18n } = useTranslation("common");

    // ── Slot content ──────────────────────────────────────────────────
    // With the audio guide disabled, the clip must not autoplay — the sound
    // only plays when the user presses the central speaker button.
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
        <SafeButton
            className="btn-start"
            onClick={() => onComplete({
                timestamp: new Date().toISOString()
            })}
        >
            {t("buttons.continue", { ns: "common" })}
        </SafeButton>
    );

    // ── Render ────────────────────────────────────────────────────────
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