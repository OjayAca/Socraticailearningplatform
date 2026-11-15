import { useEffect, useId, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import { extractProblemFromMedia, type ExtractedProblemResponse } from "@/lib/secure-api";
import { secureErrorMessage } from "@/lib/secure-error";
import {
  prepareProblemMediaFile,
  SUPPORTED_PROBLEM_MEDIA_MIME_TYPES,
} from "@/lib/media/problem-media";

export interface ProblemMediaCaptureProps {
  subjectId: string;
  disabled?: boolean;
  onExtracted: (result: { plainText: string; latex: string }) => void;
}

interface SelectedMediaState {
  file: File;
  previewUrl: string | null;
}

/**
 * Provides camera capture and image/PDF file upload for automatic mathematical problem extraction.
 *
 * @param props - Component props including selected subjectId, disabled state, and extraction callback.
 * @returns Rendered media capture and upload controls.
 */
export function ProblemMediaCapture({
  subjectId,
  disabled = false,
  onExtracted,
}: ProblemMediaCaptureProps) {
  const uploadInputId = useId();
  const cameraFallbackInputId = useId();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const cameraFallbackInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const activePreviewUrlRef = useRef<string | null>(null);

  const [selectedMedia, setSelectedMedia] = useState<SelectedMediaState | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ExtractedProblemResponse | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [capturedSnapshot, setCapturedSnapshot] = useState<{ file: File; previewUrl: string } | null>(null);

  function stopCameraStream() {
    if (activeStreamRef.current) {
      for (const track of activeStreamRef.current.getTracks()) {
        track.stop();
      }
      activeStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function revokeUrl(url: string | null | undefined) {
    if (url && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(url);
    }
  }

  useEffect(() => {
    return () => {
      if (activeStreamRef.current) {
        for (const track of activeStreamRef.current.getTracks()) {
          track.stop();
        }
      }
      if (activePreviewUrlRef.current && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(activePreviewUrlRef.current);
      }
    };
  }, []);

  async function processAndExtract(rawFile: File) {
    setMediaError(null);
    setExtractionResult(null);

    let preparedFile: File;
    try {
      preparedFile = await prepareProblemMediaFile(rawFile);
    } catch (validationError) {
      setMediaError(
        validationError instanceof Error
          ? validationError.message
          : "Select a valid PNG, JPG, WEBP image, or PDF document.",
      );
      return;
    }

    revokeUrl(activePreviewUrlRef.current);
    const nextPreviewUrl =
      preparedFile.type.startsWith("image/") && typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(preparedFile)
        : null;
    activePreviewUrlRef.current = nextPreviewUrl;
    setSelectedMedia({ file: preparedFile, previewUrl: nextPreviewUrl });
    setExtracting(true);

    try {
      const response = await extractProblemFromMedia({
        file: preparedFile,
        subjectId,
      });
      setExtractionResult(response);
      if (response.detected && response.problemText.trim().length > 0) {
        onExtracted({
          plainText: response.problemText.trim(),
          latex: response.problemLatex?.trim() ?? "",
        });
      } else {
        setMediaError(
          response.warning ??
            "No mathematical problem could be read from this file. Try a clearer photo or type the problem below.",
        );
      }
    } catch (cause) {
      setMediaError(
        secureErrorMessage(
          cause,
          "Could not extract the problem from this file. You can retry or type the problem below.",
        ),
      );
    } finally {
      setExtracting(false);
    }
  }

  function clearSelectedMedia() {
    revokeUrl(activePreviewUrlRef.current);
    activePreviewUrlRef.current = null;
    setSelectedMedia(null);
    setExtractionResult(null);
    setMediaError(null);
    if (uploadInputRef.current) uploadInputRef.current.value = "";
    if (cameraFallbackInputRef.current) cameraFallbackInputRef.current.value = "";
  }

  async function startCameraStream(mode: "environment" | "user") {
    stopCameraStream();
    setCameraStarting(true);
    setMediaError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1600 },
          height: { ideal: 1200 },
        },
        audio: false,
      });
      activeStreamRef.current = stream;
      if (videoRef.current) {
        try {
          videoRef.current.srcObject = stream;
          const playPromise = videoRef.current.play?.();
          if (playPromise && typeof playPromise.catch === "function") {
            await playPromise.catch(() => undefined);
          }
        } catch {
          // Ignore media element binding limitations in headless/test DOM environments
        }
      }
    } catch {
      stopCameraStream();
      setCameraModalOpen(false);
      cameraFallbackInputRef.current?.click();
    } finally {
      setCameraStarting(false);
    }
  }

  async function handleOpenCamera() {
    if (disabled || extracting) return;
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      cameraFallbackInputRef.current?.click();
      return;
    }
    if (capturedSnapshot) {
      revokeUrl(capturedSnapshot.previewUrl);
      setCapturedSnapshot(null);
    }
    setCameraModalOpen(true);
    await startCameraStream(facingMode);
  }

  function closeCameraModal() {
    stopCameraStream();
    if (capturedSnapshot) {
      revokeUrl(capturedSnapshot.previewUrl);
      setCapturedSnapshot(null);
    }
    setCameraModalOpen(false);
  }

  async function handleSwitchCamera() {
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);
    await startCameraStream(nextMode);
  }

  async function handleCaptureFrame() {
    const video = videoRef.current;
    if (!video) return;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 960;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      setMediaError("Camera capture is not supported in this browser. Upload an image file instead.");
      closeCameraModal();
      return;
    }
    context.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/jpeg", 0.88);
    });
    if (!blob) {
      setMediaError("Could not capture a photo from the camera. Try uploading an image instead.");
      closeCameraModal();
      return;
    }
    stopCameraStream();
    const capturedFile = new File([blob], `camera-problem-${Date.now()}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    const previewUrl =
      typeof URL.createObjectURL === "function" ? URL.createObjectURL(capturedFile) : "";
    setCapturedSnapshot({ file: capturedFile, previewUrl });
  }

  async function handleRetakePhoto() {
    if (capturedSnapshot) {
      revokeUrl(capturedSnapshot.previewUrl);
      setCapturedSnapshot(null);
    }
    await startCameraStream(facingMode);
  }

  async function handleConfirmCapturedPhoto() {
    if (!capturedSnapshot) return;
    const fileToExtract = capturedSnapshot.file;
    revokeUrl(capturedSnapshot.previewUrl);
    setCapturedSnapshot(null);
    setCameraModalOpen(false);
    await processAndExtract(fileToExtract);
  }

  const isBusy = disabled || extracting;

  return (
    <>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <input
          id={uploadInputId}
          ref={uploadInputRef}
          type="file"
          accept={SUPPORTED_PROBLEM_MEDIA_MIME_TYPES.join(",")}
          disabled={isBusy}
          aria-label="Upload problem image or PDF"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void processAndExtract(file);
          }}
        />
        <input
          id={cameraFallbackInputId}
          ref={cameraFallbackInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          disabled={isBusy}
          aria-label="Capture problem photo from device camera"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void processAndExtract(file);
          }}
        />

        <button
          type="button"
          disabled={isBusy}
          onClick={() => void handleOpenCamera()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 shadow-xs transition hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-indigo-300 dark:hover:bg-slate-700"
        >
          <Camera className="h-3.5 w-3.5" />
          Take Photo
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => uploadInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" />
          Upload Image / PDF
        </button>
      </div>

      {(selectedMedia || (extractionResult?.detected && !extracting) || mediaError) && (
        <div className="w-full space-y-2 pt-1">
          {selectedMedia && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-3">
                {selectedMedia.previewUrl ? (
                  <img
                    src={selectedMedia.previewUrl}
                    alt="Uploaded problem preview"
                    className="h-12 w-12 rounded-md border border-slate-200 object-cover dark:border-slate-700"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    <FileText className="h-6 w-6" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {selectedMedia.file.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatFileSize(selectedMedia.file.size)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {extracting ? (
                  <span
                    role="status"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Reading problem from file...
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void processAndExtract(selectedMedia.file)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Re-read
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={clearSelectedMedia}
                      aria-label="Remove uploaded file"
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <X className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {extractionResult?.detected && !extracting && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="space-y-1">
                <p className="font-semibold">
                  Problem extracted ({extractionResult.confidence} confidence) — review or edit below before starting.
                </p>
                {extractionResult.warning && (
                  <p className="text-amber-800 dark:text-amber-300">{extractionResult.warning}</p>
                )}
              </div>
            </div>
          )}

          {mediaError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{mediaError}</span>
            </div>
          )}
        </div>
      )}

      {cameraModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Take a photo of your problem"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
        >
          <div className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Take a photo of your problem
              </h3>
              <button
                type="button"
                onClick={closeCameraModal}
                aria-label="Close camera"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative flex aspect-4/3 w-full items-center justify-center overflow-hidden rounded-xl bg-slate-950">
              {capturedSnapshot ? (
                <img
                  src={capturedSnapshot.previewUrl}
                  alt="Captured problem snapshot"
                  className="h-full w-full object-contain"
                />
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    aria-label="Camera preview"
                    className="h-full w-full object-cover"
                  />
                  {cameraStarting && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 text-white">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {capturedSnapshot ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleRetakePhoto()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Retake
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmCapturedPhoto()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Use Photo
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={cameraStarting}
                    onClick={() => void handleSwitchCamera()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Switch Camera
                  </button>
                  <button
                    type="button"
                    disabled={cameraStarting}
                    onClick={() => void handleCaptureFrame()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Camera className="h-4 w-4" />
                    Capture Photo
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;
  return `${(kilobytes / 1024).toFixed(2)} MB`;
}
