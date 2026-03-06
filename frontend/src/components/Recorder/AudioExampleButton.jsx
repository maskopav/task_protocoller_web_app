// components/VoiceRecorder/AudioExampleButton.jsx
import React from "react";
import audioExampleIcon from "../../assets/audio-example-icon.svg";

export const AudioExampleButton = ({recordingStatus, audioExample, playExample}) => {
  if (!audioExample) return null;
  
  const isDisabled = recordingStatus === "recording";

  return (
    <button
      className={`audio-example-btn ${isDisabled ? "disabled" : ""}`}
      onClick={playExample}
      disabled={isDisabled}
      title={isDisabled ? "Disabled while recording" : "Play example audio"}
    >
      <img
        src={audioExampleIcon}
        alt="Play Example"
      />
    </button>
  );
};
