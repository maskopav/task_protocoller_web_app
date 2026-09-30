// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import i18n from "../../i18n";
import { ConfirmDialogContext } from "../ConfirmDialog/ConfirmDialogContext";
import { VideoViewFinder } from "./VideoViewFinder";

// Audio/tooltip widgets aren't part of the camera flow under test.
vi.mock("../AudioGuidePlayer/AudioGuidePlayer", () => ({ default: () => null }));
vi.mock("../InfoToolTip/InfoToolTip", () => ({ default: () => null }));

const guide = (key) => i18n.t(`videoCalibration.guide.${key}`);
// Translations contain <strong>/<br/>; compare against their plain text.
const plain = (html) => html.replace(/<br\s*\/?>/g, "").replace(/<[^>]+>/g, "");

function makeVideoRecorder(overrides = {}) {
  return {
    attachVideoRef: vi.fn(),
    canvasRef: { current: null },
    isSteady: false,
    isFaceCorrect: false,
    guidance: { arrow: null },
    faceMessage: null,
    isLoadingModel: false,
    modelLoadError: false,
    cameraErrorType: null,
    preloadFaceModel: vi.fn(async () => {}),
    startFaceDetection: vi.fn(),
    stopFaceDetection: vi.fn(),
    ...overrides,
  };
}

describe("VideoViewFinder — camera setup screens and error handling", () => {
  let container;
  let root;
  let confirm;
  let props;

  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    confirm = vi.fn(async () => true);
    props = {
      phase: "SETUP",
      videoCalibrated: false,
      videoRecorder: makeVideoRecorder(),
      isRecording: false,
      onRequestCameraPermission: vi.fn(async () => true),
      onPermissionDenied: vi.fn(),
      onDeclineVideo: vi.fn(),
      onStartCalibration: vi.fn(),
      onFinishCalibration: vi.fn(),
      audioGuideEnabled: false,
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function render(overrides = {}) {
    Object.assign(props, overrides);
    await act(async () => {
      root.render(
        <ConfirmDialogContext.Provider value={{ confirm }}>
          <VideoViewFinder {...props} />
        </ConfirmDialogContext.Provider>
      );
    });
  }

  const text = () => container.textContent;

  async function click(label) {
    const btn = [...container.querySelectorAll("button")].find((b) => b.textContent.includes(label));
    if (!btn) throw new Error(`No button "${label}" in: ${text()}`);
    await act(async () => {
      btn.click();
    });
  }

  // Intro card → "Understand & Continue" → getUserMedia (mocked by the parent callback).
  async function passIntro() {
    expect(text()).toContain(i18n.t("videoCalibration.btnUnderstand"));
    await click(i18n.t("videoCalibration.btnUnderstand"));
  }

  // Simulates getUserMedia failing with the given classified error type.
  async function failCameraWith(errorType) {
    await render({
      videoRecorder: makeVideoRecorder({ cameraErrorType: errorType }),
      onRequestCameraPermission: vi.fn(async () => false),
    });
    await passIntro();
  }

  const hasOsTabs = () =>
    [...container.querySelectorAll(".tab-btn")].map((b) => b.textContent).join(",") ===
    `${i18n.t("permissions.tabAndroid")},${i18n.t("permissions.tabIos")}`;

  describe("happy path", () => {
    it("shows the permission intro before asking for the camera", async () => {
      await render();
      expect(props.onRequestCameraPermission).not.toHaveBeenCalled();
      await passIntro();
      expect(props.onRequestCameraPermission).toHaveBeenCalledTimes(1);
    });

    it("opens the setup instructions and starts calibration once the camera is granted", async () => {
      await render();
      await passIntro();
      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ infoOnly: true }));
      expect(props.onStartCalibration).toHaveBeenCalledTimes(1);
      expect(props.onPermissionDenied).toHaveBeenLastCalledWith(false);
    });
  });

  describe("camera errors", () => {
    it("permission denied: shows the Settings guide with Android/iOS tabs", async () => {
      await failCameraWith("denied");
      expect(text()).toContain(plain(guide("descDenied")));
      expect(hasOsTabs()).toBe(true);
      expect(text()).toContain(plain(guide("steps.android.systemAndBrowser")));
      expect(props.onPermissionDenied).toHaveBeenLastCalledWith(true);
      expect(props.onStartCalibration).not.toHaveBeenCalled();
    });

    it("permission denied: the iOS tab switches to the iPhone steps", async () => {
      await failCameraWith("denied");
      await click(i18n.t("permissions.tabIos"));
      expect(text()).toContain(plain(guide("steps.ios.systemAndBrowser")));
    });

    it("camera busy: explains another app is using it, without OS tabs or duplicate hint", async () => {
      await failCameraWith("busy");
      expect(text()).toContain(guide("descBusy"));
      expect(hasOsTabs()).toBe(false);
      expect(text()).not.toContain(guide("stepsHardware"));
      expect(text()).not.toContain(plain(guide("descDenied")));
    });

    it("no camera found: tells the user to check the device, without OS tabs", async () => {
      await failCameraWith("missing");
      expect(text()).toContain(guide("descMissing"));
      expect(hasOsTabs()).toBe(false);
      expect(text()).not.toContain(guide("stepsHardware"));
    });

    it("unknown camera error: shows the single 'close other apps' hint", async () => {
      await failCameraWith("generic");
      expect(text()).toContain(guide("descGeneric"));
      expect(text()).toContain(guide("stepsHardware"));
      expect(hasOsTabs()).toBe(false);
    });

    it("Try Again re-requests the camera and leaves the error screen on success", async () => {
      await failCameraWith("busy");
      props.onRequestCameraPermission.mockResolvedValue(true);

      await click(guide("btnRetry"));

      expect(props.onRequestCameraPermission).toHaveBeenCalledTimes(2);
      expect(text()).not.toContain(guide("descBusy"));
      expect(props.onStartCalibration).toHaveBeenCalledTimes(1);
    });

    it("declining after confirmation continues without camera, tagged with the error type", async () => {
      await failCameraWith("busy");
      await click(guide("btnDecline"));
      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: guide("declineTitle") }));
      expect(props.onDeclineVideo).toHaveBeenCalledWith("camera_busy");
    });

    it("declining a plain permission denial is tagged 'camera_denied'", async () => {
      await failCameraWith(null); // Permissions API denial carries no error type
      await click(guide("btnDecline"));
      expect(props.onDeclineVideo).toHaveBeenCalledWith("camera_denied");
    });

    it("backing out of the decline dialog keeps the participant on the error screen", async () => {
      await failCameraWith("missing");
      confirm.mockResolvedValue(false);
      await click(guide("btnDecline"));
      expect(props.onDeclineVideo).not.toHaveBeenCalled();
      expect(text()).toContain(guide("descMissing"));
    });
  });

  describe("face model failed to load", () => {
    // Camera granted fine, then the model download fails during calibration
    // (useVideoRecorder reports this via modelLoadError, not a camera error).
    async function reachCalibrationWithBrokenModel() {
      await render();
      await passIntro();
      await render({
        phase: "CALIBRATE",
        videoRecorder: makeVideoRecorder({ modelLoadError: true }),
      });
    }

    it("shows the model-load screen, not 'Camera Access Denied'", async () => {
      await reachCalibrationWithBrokenModel();
      expect(text()).toContain(guide("descModelLoadFailed"));
      expect(text()).not.toContain(plain(guide("descDenied")));
      expect(hasOsTabs()).toBe(false);
    });

    it("does not redirect on its own — the participant must retry or decline", async () => {
      await reachCalibrationWithBrokenModel();
      expect(props.onDeclineVideo).not.toHaveBeenCalled();
    });

    it("Try Again retries only the model download", async () => {
      await reachCalibrationWithBrokenModel();
      await click(guide("btnRetry"));
      expect(props.videoRecorder.preloadFaceModel).toHaveBeenCalledTimes(1);
      expect(props.onRequestCameraPermission).toHaveBeenCalledTimes(1);
    });

    it("shows the calibration view once a retry succeeds", async () => {
      await reachCalibrationWithBrokenModel();
      await render({ videoRecorder: makeVideoRecorder({ modelLoadError: false }) });
      expect(text()).not.toContain(guide("descModelLoadFailed"));
      expect(container.querySelector(".calibration-overlay")).not.toBeNull();
    });

    it("declining continues without camera, tagged 'model_load_failed'", async () => {
      await reachCalibrationWithBrokenModel();
      await click(guide("btnDecline"));
      expect(props.onDeclineVideo).toHaveBeenCalledWith("model_load_failed");
    });
  });

  describe("stuck calibration", () => {
    async function calibrateFor(ms) {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      await render({ phase: "CALIBRATE" });
      await passIntro();
      await act(async () => {
        vi.advanceTimersByTime(ms);
      });
    }

    it("offers no bypass during the first 35 s", async () => {
      await calibrateFor(34000);
      expect(text()).not.toContain(guide("btnStuck"));
    });

    it("offers 'continue without camera' after 35 s and stops detection while asking", async () => {
      await calibrateFor(35000);
      await click(guide("btnStuck"));
      expect(props.videoRecorder.stopFaceDetection).toHaveBeenCalled();
      expect(props.onDeclineVideo).toHaveBeenCalledWith("calibration_timeout");
    });

    it("resumes face detection if the participant backs out", async () => {
      await calibrateFor(35000);
      confirm.mockResolvedValue(false);
      await click(guide("btnStuck"));
      expect(props.onDeclineVideo).not.toHaveBeenCalled();
      expect(props.videoRecorder.startFaceDetection).toHaveBeenCalled();
    });
  });
});
