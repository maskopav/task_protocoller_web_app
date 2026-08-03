import React from "react";
import { SafeButton } from './Shared/SafeButton';

function ModeSwitchButton({ onToggle }) {
  return (
    <div className="mode-switch-container">
      <SafeButton className="switch-button" onClick={onToggle}>
        {"Switch to Recorder Mode"}
      </SafeButton>
    </div>
  );
}

export default ModeSwitchButton;
