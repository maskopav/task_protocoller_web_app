import React, { createContext, useContext } from 'react';

/**
 * Holds the audio src URL for the current task's instructions.
 * Consumed by TaskLayout — do not read this directly in task components.
 */
export const TaskAudioContext = createContext(null);

/**
 * TaskAudioProvider
 *
 * Wrap your task page (or the task router section) with this.
 * Pass the current task's instruction audio URL as `src`.
 * When `src` changes (i.e. the user moves to a new task), TaskLayout
 * will automatically stop the previous audio and play the new one.
 *
 * Usage in your ParticipantInterfacePage:
 *
 *   const TASK_AUDIO = {
 *     'word-list':   '/audio/instructions/word-list.mp3',
 *     'digit-span':  '/audio/instructions/digit-span.mp3',
 *     'fluency':     '/audio/instructions/fluency.mp3',
 *   };
 *
 *   <TaskAudioProvider src={TASK_AUDIO[currentTaskKey] ?? null}>
 *     <CurrentTaskComponent />
 *   </TaskAudioProvider>
 *
 * Pass `src={null}` for any task that has no audio — TaskLayout
 * will simply skip the player UI entirely.
 */
export function TaskAudioProvider({ src = null, children }) {
  return (
    <TaskAudioContext.Provider value={src}>
      {children}
    </TaskAudioContext.Provider>
  );
}

/**
 * Internal hook — used only by TaskLayout.
 * Task components should never need to call this.
 */
export function useTaskAudio() {
  return useContext(TaskAudioContext);
}
