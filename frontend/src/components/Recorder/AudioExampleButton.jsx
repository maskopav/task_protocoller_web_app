// frontend/src/components/Recorder/AudioExampleButton.jsx
import { useTranslation } from "react-i18next";
import audioExampleIcon from "../../assets/audioIcons/audio-example-icon.svg";
import { SafeButton } from '../Shared/SafeButton';

export const AudioExampleButton = ({recordingStatus, audioExample, isPlaying, onToggle, variant = "example"}) => {
  const { t } = useTranslation('common');
  if (!audioExample) return null;
  
  const isDisabled = recordingStatus === "recording";

  // Determine the correct labels based on the variant prop
  const playLabel = variant === "story" 
    ? t('buttons.playStory') 
    : t('buttons.playExample');
    
  const stopLabel = variant === "story" 
    ? t('buttons.stopStory') 
    : t('buttons.stopExample');

  const currentLabel = isPlaying ? stopLabel : playLabel;

  return (
    <SafeButton
      className={`audio-example-btn ${isDisabled ? "disabled" : ""} ${isPlaying ? "playing" : ""}`}
      onClick={(e) => {
          e.preventDefault();
          onToggle();
      }}
      disabled={isDisabled}
      title={isDisabled ? t('buttons.disabledWhileRecording') : currentLabel}
    >
      <img
        src={audioExampleIcon}
        alt={currentLabel}
      />
      <span className="btn-label">
        {currentLabel}
      </span>
    </SafeButton>
  );
};