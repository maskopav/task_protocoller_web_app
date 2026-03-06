// components/VoiceRecorder/index.js - Barrel export
export { Recorder as default } from './Recorder';
export { RecordingTimer } from './RecordingTimer';
export { RecordingControls } from './RecordingControls';
export { PlaybackSection } from './PlaybackSection';
export { StatusIndicator } from './StatusIndicator';
export { NextTaskButton } from './NextTaskButton';
export { AudioExampleButton } from './AudioExampleButton';
// Re-export the hook
export { useVoiceRecorder } from '../../hooks/useVoiceRecorder';