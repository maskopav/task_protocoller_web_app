import React from 'react';
import './TaskLayout.css'; // shared layout tokens for all tasks

/**
 * TaskLayout — the standard 3-zone shell for every assessment task.
 *
 * ┌──────────────────────────────────────────────┐
 * │  HEADER  · <h1> title + optional tooltip     │
 * │           · optional .flexible-spacer        │
 * │           · optional instruction-card        │
 * ├──────────────────────────────────────────────┤
 * │  MAIN    · .recording-area  (children)       │
 * ├──────────────────────────────────────────────┤
 * │  CONTROLS · .bottom-controls  (controls)     │
 * └──────────────────────────────────────────────┘
 *
 * ── Props ──────────────────────────────────────────────────────────────
 *
 * CONTAINER
 *   className         string   Extra modifier classes on .task-container
 *
 * HEADER
 *   title             node     <h1> content; pass null to skip the <h1> entirely
 *   tooltip           node     Rendered inside <h1> after the title text
 *   headerClassName   string   Extra classes on .task-header
 *   showSpacer        bool     Renders .flexible-spacer between <h1> and instructions
 *   instructions      node     Fills the .instruction-card; null hides the card
 *   instructionsClassName  string  Extra classes on the instruction-card div
 *   instructionsKey   any      React key on the instruction card (triggers re-mount
 *                              animation when the key changes, e.g. for dynamic tasks)
 *
 * PRE-HEADER SLOT
 *   preHeader         node     Rendered before .task-header — used by Recorder when
 *                              hideTitle=true shifts the timer above the header
 *
 * MAIN SLOT
 *   children          node     Fills .recording-area
 *   mainClassName     string   Extra classes on .recording-area
 *
 * CONTROLS SLOT
 *   controls          node     Fills .bottom-controls
 *   controlsClassName string   Extra classes on .bottom-controls
 *
 * ── Adding a new task ──────────────────────────────────────────────────
 *
 *   <TaskLayout
 *     title={t("myTask.title")}
 *     tooltip={<InfoTooltip ... />}
 *     instructions={<Trans i18nKey="myTask.instructions" />}
 *     controls={<button onClick={handleDone}>{t("done")}</button>}
 *   >
 *     <MyTaskBoard />
 *   </TaskLayout>
 */

const SHOW_GLOBAL_TITLES = false;

export default function TaskLayout({
  // container
  className = '',

  // header
  title                 = null,
  tooltip               = null,
  headerClassName       = '',
  showSpacer            = false,
  instructions          = null,
  instructionsClassName = '',
  instructionsKey       = undefined,

  // pre-header slot
  preHeader = null,

  // main slot
  children      = null,
  mainClassName = '',

  // controls slot
  controls          = null,
  controlsClassName = '',
}) {
  const cx = (...parts) => parts.filter(Boolean).join(' ');

  const shouldRenderTitle = title != null && SHOW_GLOBAL_TITLES;

  return (
    <div className={cx('task-container', className)}>

      {preHeader}

      <div className={cx('task-header', headerClassName)}>
        {shouldRenderTitle && (
          <h1>
            {title}
            {tooltip}
          </h1>
        )}

        {showSpacer && <div className="flexible-spacer" />}

        {instructions != null && (
          <div
            key={instructionsKey}
            className={cx('instruction-card active-instructions', instructionsClassName)}
          >
            {instructions}
          </div>
        )}
      </div>

      <div className={cx('recording-area', mainClassName)}>
        {children}
      </div>

      <div className={cx('bottom-controls', controlsClassName)}>
        {controls}
      </div>

    </div>
  );
}
