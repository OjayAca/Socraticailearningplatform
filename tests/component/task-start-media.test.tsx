import { VALIDATED_SUBJECTS, VALIDATED_TOPICS } from "@/data/validated-curriculum";
import { clearViews } from "@/lib/view-cache";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { SecureTaskStart } from "@/app/components/SecureTaskStart";

const mocks = vi.hoisted(() => ({
  getDoc: vi.fn(),
  getLearningCatalog: vi.fn(),
  getPreparedTopicIds: vi.fn(),
  getCurrentConsentNotice: vi.fn(),
  startLearningSession: vi.fn(),
  previewVerifiedProblem: vi.fn(),
  extractProblemFromMedia: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({ doc: vi.fn(), getDoc: mocks.getDoc }));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/secure-api", () => ({
  bootstrapProfile: vi.fn(),
  getLearningCatalog: mocks.getLearningCatalog,
  getPreparedTopicIds: mocks.getPreparedTopicIds,
  getCurrentConsentNotice: mocks.getCurrentConsentNotice,
  startLearningSession: mocks.startLearningSession,
  previewVerifiedProblem: mocks.previewVerifiedProblem,
  extractProblemFromMedia: mocks.extractProblemFromMedia,
}));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: () => ({
    firebaseUser: { uid: "student-1" },
    userProfile: {
      uid: "student-1",
      displayName: "Student",
      academicProfileComplete: false,
      academicProfile: null,
    },
    reloadProfile: vi.fn(),
  }),
}));
vi.mock("@/app/components/StudentShell", () => ({
  StudentShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

async function openOwnProblem() {
  fireEvent.click(await screen.findByRole("button", { name: /Quantitative Methods/ }));
  fireEvent.click(screen.getByRole("button", { name: "Own Problem" }));
}

describe("SecureTaskStart photo and file problem extraction", () => {
  beforeEach(() => {
    clearViews();
    mocks.getPreparedTopicIds.mockImplementation(async (id: string) =>
      VALIDATED_TOPICS.filter((t) => t.subjectId === id).map((t) => t.id),
    );
    mocks.startLearningSession.mockReset();
    mocks.previewVerifiedProblem.mockReset();
    mocks.extractProblemFromMedia.mockReset();
    mocks.startLearningSession.mockResolvedValue({ session: { id: "new-session" } });
    mocks.previewVerifiedProblem.mockResolvedValue({
      confirmationHash: "hash-123",
      description: "function evaluation",
    });
    mocks.getLearningCatalog.mockResolvedValue({
      subjects: VALIDATED_SUBJECTS.map((item) => ({ ...item, status: "approved", version: 1 })),
      topics: VALIDATED_TOPICS.map((item) => ({ ...item, status: "approved", version: 1, ready: true })),
      generatedAt: 1,
    });
    mocks.getCurrentConsentNotice.mockResolvedValue({
      version: "privacy-v1",
      title: "Notice",
      summary: "Summary",
      collectedData: [],
      purpose: "Study",
      retention: "Configured",
    });
    mocks.getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ subjectProgress: {}, topicRecommendations: {} }) })
      .mockResolvedValueOnce({ exists: () => true });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("extracts a problem from an uploaded image and starts a session without typing", async () => {
    mocks.extractProblemFromMedia.mockResolvedValueOnce({
      detected: true,
      problemText: "Given f(x) = [math], find f(3).",
      problemLatex: "x^{2}+2x+1",
      confidence: "high",
    });

    render(
      <MemoryRouter>
        <SecureTaskStart />
      </MemoryRouter>,
    );
    await openOwnProblem();

    const uploadInput = screen.getByLabelText("Upload problem image or PDF");
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "worksheet.png", {
      type: "image/png",
    });

    fireEvent.change(uploadInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mocks.extractProblemFromMedia).toHaveBeenCalledWith({
        file,
        subjectId: "quantitative-methods",
      });
    });

    expect(await screen.findByText(/Problem extracted \(high confidence\)/)).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Given f(x) = [math], find f(3).");

    const startButton = screen.getByRole("button", { name: "Validate and start" });
    expect(startButton).not.toBeDisabled();
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(mocks.previewVerifiedProblem).toHaveBeenCalledWith({
        subjectId: "quantitative-methods",
        question: "Given f(x) = [math], find f(3).",
        questionLatex: "x^{2}+2x+1",
      });
      expect(mocks.startLearningSession).toHaveBeenCalledWith({
        mode: "free_form",
        subjectId: "quantitative-methods",
        question: "Given f(x) = [math], find f(3).",
        questionLatex: "x^{2}+2x+1",
        confirmationHash: "hash-123",
      });
    });
  });

  it("shows a validation error for unsupported file formats", async () => {
    render(
      <MemoryRouter>
        <SecureTaskStart />
      </MemoryRouter>,
    );
    await openOwnProblem();

    const uploadInput = screen.getByLabelText("Upload problem image or PDF");
    const invalidFile = new File(["plain text"], "notes.txt", { type: "text/plain" });
    fireEvent.change(uploadInput, { target: { files: [invalidFile] } });

    expect(
      await screen.findByText(/Unsupported file format\. Upload a PNG, JPG, WEBP image, or a PDF document\./),
    ).toBeInTheDocument();
    expect(mocks.extractProblemFromMedia).not.toHaveBeenCalled();
  });

  it("opens the camera capture modal when getUserMedia is available", async () => {
    const stopTrack = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: stopTrack }],
        }),
      },
    });

    render(
      <MemoryRouter>
        <SecureTaskStart />
      </MemoryRouter>,
    );
    await openOwnProblem();

    fireEvent.click(screen.getByRole("button", { name: /Take Photo/i }));

    expect(await screen.findByRole("dialog", { name: "Take a photo of your problem" })).toBeInTheDocument();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Close camera" }));
    expect(stopTrack).toHaveBeenCalled();
  });
});
