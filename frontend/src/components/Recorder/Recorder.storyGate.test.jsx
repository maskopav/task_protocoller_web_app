// @vitest-environment jsdom
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import i18n from "../../i18n";
import {
  translateTaskInstructions,
  translateTaskInstructionsPreCalibration,
  translateTaskInstructionsPostCalibration,
} from "../../utils/translations";
import { ConfirmDialogContext } from "../ConfirmDialog/ConfirmDialogContext";
import { Recorder } from "./Recorder";

// ── Media hooks: replaced with inert stand-ins (no mic/camera/VAD in jsdom) ──
const startAudioRecording = vi.fn();

vi.mock("../../hooks/useVoiceRecorder", () => ({
  useVoiceRecorder: () => ({
    recordingStatus: "idle",
    permission: true,
    stream: null,
    audioURL: null,
    processingFailed: false,
    recordingTime: 0,
    remainingTime: null,
    audioLevelsRef: { current: [] },
    activeInstructions: null,
    durationExpired: false,
    incompatibleBrowser: null,
    firstChunkTimeRef: { current: null },
    getMicrophonePermission: vi.fn(async () => true),
    startRecording: startAudioRecording,
    pauseRecording: vi.fn(),
    resumeRecording: vi.fn(),
    stopRecording: vi.fn(),
    repeatRecording: vi.fn(),
    RECORDING_STATES: { IDLE: "idle", RECORDING: "recording", PAUSED: "paused", RECORDED: "recorded" },
  }),
}));

vi.mock("../../hooks/useVideoRecorder", () => ({
  useVideoRecorder: () => ({
    recordingStatus: "idle",
    videoData: null,
    preloadFaceModel: vi.fn(async () => {}),
    getMediaPermission: vi.fn(async () => true),
    startFaceDetection: vi.fn(),
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
  }),
}));

vi.mock("../../hooks/useVADLogic", () => ({
  useVadLogic: () => ({
    isVadLoaded: true, vadFailed: false, activeUseVAD: false, isSpeaking: false,
    isSilentPause: false, canEarlyStop: false, hasSpoken: false, speechProb: 0,
    speechSegments: { current: [] },
    resetSpeechTrackers: vi.fn(), resetSilenceClock: vi.fn(),
    clearSilenceState: vi.fn(), clearSpeechSegments: vi.fn(),
  }),
}));

vi.mock("../../utils/vadPreload", () => ({ preloadVadAssets: vi.fn() }));
vi.mock("../AudioGuidePlayer/AudioGuidePlayer", () => ({ default: () => null }));

// Camera flow reduced to the three exits Recorder cares about: permission
// granted, calibration finished, and the "record without video" bypass.
vi.mock("./VideoViewFinder.jsx", () => ({
  VideoViewFinder: ({ phase, onPermissionGranted, onFinishCalibration, onDeclineVideo }) => (
    <div data-testid="viewfinder" data-phase={phase}>
      {phase === "PERMISSION" && <button data-testid="grant-camera" onClick={onPermissionGranted} />}
      {(phase === "SETUP" || phase === "CALIBRATE") && (
        <button data-testid="finish-calibration" onClick={onFinishCalibration} />
      )}
      {phase !== "RECORDING" && (
        <button data-testid="decline-video" onClick={() => onDeclineVideo?.("user_declined")} />
      )}
    </div>
  ),
}));

const STORY_BASE = "/audio/illustrations/en/retelling_pussInBoots";
const STORY_DURATION_S = 90;

/** HEAD probe used by Recorder to resolve the clip's file extension. */
function stubClipProbe({ clipExists }) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: clipExists,
    headers: { get: () => (clipExists ? "audio/mp4" : "text/html") },
  })));
}

/** Mirrors ParticipantInterfacePage: declining video remounts the Recorder
 *  (key change) as an audio-only task with recordVideo='false'. */
function DeclineVideoHarness({ recordVideo, ...props }) {
  const [videoDeclined, setVideoDeclined] = useState(false);
  return (
    <Recorder
      key={String(videoDeclined)}
      {...props}
      recordVideo={videoDeclined ? "false" : recordVideo}
      onDeclineVideo={() => setVideoDeclined(true)}
    />
  );
}

function retellingProps(language) {
  const params = { fairytale: "pussInBoots", duration: STORY_DURATION_S, lng: language };
  return {
    title: "Retelling",
    instructions: translateTaskInstructions("retelling", params),
    instructionsPreCalibration: translateTaskInstructionsPreCalibration("retelling", params),
    instructionsPostCalibration: translateTaskInstructionsPostCalibration("retelling", params),
    audioExample: STORY_BASE,
    mode: "delayedStop",
    duration: STORY_DURATION_S,
    taskParams: { fairytale: "pussInBoots", minDuration: 30, maxDuration: 120 },
    audioGuideEnabled: false,
  };
}

describe("Recorder — story-listen gate on the Start button", () => {
  let container;
  let root;

  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    startAudioRecording.mockClear();
    stubClipProbe({ clipExists: true });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function render(element) {
    const confirm = vi.fn(async () => true);
    await act(async () => {
      root.render(
        <ConfirmDialogContext.Provider value={{ confirm }}>{element}</ConfirmDialogContext.Provider>
      );
    });
    // Let the async HEAD probe resolve and the story slot render.
    await act(async () => {});
  }

  async function click(testId) {
    const el = container.querySelector(`[data-testid="${testId}"]`);
    expect(el, `missing [data-testid="${testId}"]`).toBeTruthy();
    await act(async () => { el.click(); });
  }

  const startButton = () => container.querySelector(".controls .btn-start");
  const storyAudio = () => container.querySelector(".instruction-example-row--story audio");

  /** Simulates the story having played up to `fraction` of its length. */
  async function playStoryTo(fraction) {
    const audio = storyAudio();
    expect(audio, "story player is not on screen").toBeTruthy();
    Object.defineProperty(audio, "duration", { configurable: true, value: STORY_DURATION_S });
    Object.defineProperty(audio, "currentTime", { configurable: true, writable: true, value: STORY_DURATION_S * fraction });
    await act(async () => { audio.dispatchEvent(new Event("timeupdate")); });
  }

  async function expectStartGatedByStory() {
    expect(storyAudio()).toBeTruthy();
    expect(startButton().disabled).toBe(true);

    await playStoryTo(0.5);
    expect(startButton().disabled).toBe(true);

    await playStoryTo(0.7);
    expect(startButton().disabled).toBe(false);
  }

  it("audio-only task: Start is locked until enough of the story has played", async () => {
    await render(<Recorder {...retellingProps("en")} recordVideo={false} />);
    await expectStartGatedByStory();
  });

  // Video flow shows instructionsPostCalibration, which has the story in every language.
  it.each(["en", "cs"])(
    "video task (%s): after calibration, Start is locked until enough of the story has played",
    async (language) => {
      await i18n.changeLanguage(language);
      await render(<DeclineVideoHarness {...retellingProps(language)} recordVideo="true" />);

      await click("grant-camera");
      // Pre-calibration info screen: its "Start calibration" button is not gated.
      expect(startButton().disabled).toBe(false);
      await act(async () => { startButton().click(); });
      await click("finish-calibration");

      await expectStartGatedByStory();
      await i18n.changeLanguage("en");
    }
  );

  it.each(["PERMISSION", "SETUP"])(
    "video declined on the %s screen: the audio-only fallback is gated the same way",
    async (declineAt) => {
      await render(<DeclineVideoHarness {...retellingProps("en")} recordVideo="true" />);

      if (declineAt === "SETUP") {
        await click("grant-camera");
        await act(async () => { startButton().click(); });
        expect(container.querySelector('[data-testid="viewfinder"]').dataset.phase).toBe("SETUP");
      }
      await click("decline-video");

      expect(container.querySelector('[data-testid="viewfinder"]')).toBeNull();
      await expectStartGatedByStory();
    }
  );

  it("clicking the locked Start does not start recording", async () => {
    await render(<Recorder {...retellingProps("en")} recordVideo={false} />);
    await act(async () => { startButton().click(); });
    await new Promise((r) => setTimeout(r, 900)); // past RECORDING_START_DELAY_MS
    expect(startAudioRecording).not.toHaveBeenCalled();
  });

  it("stays unlocked once the threshold is reached, even if playback is rewound", async () => {
    await render(<Recorder {...retellingProps("en")} recordVideo={false} />);
    await playStoryTo(0.7);
    await playStoryTo(0.1);
    expect(startButton().disabled).toBe(false);
  });

  it("story clip missing on the server: Start is not blocked", async () => {
    stubClipProbe({ clipExists: false });
    await render(<Recorder {...retellingProps("en")} recordVideo={false} />);
    expect(storyAudio()).toBeNull();
    expect(startButton().disabled).toBe(false);
  });

  it("{{example}} clip (e.g. phonation) never blocks Start", async () => {
    await render(
      <Recorder
        title="Phonation"
        instructions="Say /a/ for as long as you can. {{example}} Press START."
        audioExample="/audio/illustrations/phonation_a"
        mode="basicStop"
        taskParams={{ phoneme: "a" }}
        recordVideo={false}
        audioGuideEnabled={false}
      />
    );
    expect(container.querySelector(".instruction-example-row")).toBeTruthy();
    expect(storyAudio()).toBeNull();
    expect(startButton().disabled).toBe(false);
  });
});
