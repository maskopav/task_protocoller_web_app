// components/VoiceRecorder/AudioExampleButton.jsx
import { useTranslation } from "react-i18next";
import audioExampleIcon from "../../assets/audio-example-icon.svg";

export const AudioExampleButton = ({recordingStatus, audioExample, isPlaying, onToggle}) => {
  const { t } = useTranslation('common');
  if (!audioExample) return null;
  
  const isDisabled = recordingStatus === "recording";

  return (
    <button
      className={`audio-example-btn ${isDisabled ? "disabled" : ""} ${isPlaying ? "playing" : ""}`}
      onClick={(e) => {
          e.preventDefault();
          onToggle();
      }}
      disabled={isDisabled}
      title={isDisabled ? t('buttons.disabledWhileRecording') : (isPlaying ? t('buttons.stopExample') : t('buttons.playExample'))}
    >
      <img
        src={audioExampleIcon}
        alt={isPlaying ? t('buttons.stopExample') : t('buttons.playExample')}
      />
      <span className="btn-label">
        {isPlaying ? t('buttons.stopExample') : t('buttons.playExample')}
      </span>
    </button>
  );
};
