import { VALIDATED_SUBJECTS, VALIDATED_TOPICS } from "@/data/validated-curriculum";
import { clearViews } from "@/lib/view-cache";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { SecureTaskStart } from "@/app/components/SecureTaskStart";
import { verifiedConfirmation } from "@/lib/learning/verified-problems";

const mocks = vi.hoisted(() => ({
  getDoc: vi.fn(),
  getLearningCatalog: vi.fn(),
  getCurrentConsentNotice: vi.fn(),
  startLearningSession: vi.fn(),
  previewVerifiedProblem: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({ doc: vi.fn(), getDoc: mocks.getDoc }));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/secure-api", () => ({
  bootstrapProfile: vi.fn(),
  getLearningCatalog: mocks.getLearningCatalog,
  getCurrentConsentNotice: mocks.getCurrentConsentNotice,
  startLearningSession: mocks.startLearningSession,
  previewVerifiedProblem: mocks.previewVerifiedProblem,
}));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: () => ({
    firebaseUser: { uid: "student-1" },
    userProfile: { uid: "student-1", displayName: "Student", academicProfileComplete: false, academicProfile: null },
    reloadProfile: vi.fn(),
  }),
}));
vi.mock("@/app/components/StudentShell", () => ({ StudentShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

describe("P1 subject-first task start", () => {
  beforeEach(() => {
    clearViews();
    mocks.startLearningSession.mockReset();
    mocks.previewVerifiedProblem.mockReset();
    mocks.startLearningSession.mockResolvedValue({ session: { id: "new-session" } });
    mocks.getDoc.mockReset();
    mocks.getLearningCatalog.mockResolvedValue({
      subjects: [
        { id: "quantitative-methods", name: "Quantitative Methods", description: "Practice data and probability.", status: "approved", version: 2 },
        { id: "discrete-mathematics", name: "Discrete Mathematics", description: "Practice logic and proof.", status: "approved", version: 2 },
      ],
      topics: [
        { id: "quantitative-methods-introduction-to-probability", subjectId: "quantitative-methods", subject: "Quantitative Methods", name: "Introduction to Probability", status: "approved", version: 2, ready: true },
        { id: "discrete-mathematics-logic", subjectId: "discrete-mathematics", subject: "Discrete Mathematics", name: "Logic", status: "approved", version: 2, ready: true },
      ],
      generatedAt: 1,
    });
    mocks.getCurrentConsentNotice.mockResolvedValue({ version: "privacy-v1", title: "Notice", summary: "Summary", collectedData: [], purpose: "Study", retention: "Configured" });
    mocks.getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ subjectProgress: { "Discrete Mathematics": { sessionsCompleted: 2, averageCTScore: 84, recommendedDifficulty: "Intermediate" } }, topicRecommendations: {} }) })
      .mockResolvedValueOnce({ exists: () => true });
  });
  afterEach(cleanup);

  it("shows the exact curriculum and nested subtopics using stable selection IDs", async () => {
    mocks.getLearningCatalog.mockResolvedValue({ subjects: VALIDATED_SUBJECTS.map(item => ({ ...item, status: "approved", version: 1 })), topics: VALIDATED_TOPICS.map(item => ({ ...item, status: "approved", version: 1, ready: true })), generatedAt: 1 });
    render(<MemoryRouter><SecureTaskStart /></MemoryRouter>);
    await screen.findByText("Images and Pre-images");
    expect(screen.getAllByRole("option").map(item => item.textContent)).toEqual(VALIDATED_TOPICS.slice(0, 6).map(item => item.name));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "quantitative-methods-descriptive-statistics" } });
    expect(screen.getByText("Descriptive Measures")).toBeInTheDocument();
    expect(screen.getByText("Kurtosis")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Discrete Mathematics/ }));
    expect(screen.getAllByRole("option").map(item => item.textContent)).toEqual(VALIDATED_TOPICS.slice(6).map(item => item.name));
  });
  it("reuses setup immediately when returning to the page", async () => {
    const view = render(<MemoryRouter><SecureTaskStart /></MemoryRouter>);
    await screen.findByRole("button", { name: "Assign my prepared problem" });
    view.unmount();
    render(<MemoryRouter><SecureTaskStart /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Assign my prepared problem" })).toBeVisible();
    await waitFor(() => expect(mocks.getDoc).toHaveBeenCalledTimes(2));
    expect(mocks.getLearningCatalog).toHaveBeenCalledOnce();
  });

  it("validates the screenshot question and starts directly with the problem givens", async () => {
    mocks.getLearningCatalog.mockResolvedValue({ subjects: VALIDATED_SUBJECTS, topics: VALIDATED_TOPICS.filter(t => t.id === "quantitative-methods-descriptive-statistics"), generatedAt: 1 });
    const question = "what is the mean for 23, 41,9,56";
    const preview = verifiedConfirmation(question, "Descriptive Statistics");
    mocks.previewVerifiedProblem.mockImplementation(async ({ question }) =>
      verifiedConfirmation(question, "Descriptive Statistics"));
    const confirm = vi.spyOn(window, "confirm");
    render(<MemoryRouter><SecureTaskStart /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "My own problem" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: question } });
    fireEvent.click(screen.getByRole("button", { name: "Validate and start" }));
    await waitFor(() => expect(mocks.startLearningSession).toHaveBeenCalledWith({
      mode: "free_form", topicId: "quantitative-methods-descriptive-statistics", question, requestedDifficulty: "Basic",
      confirmationHash: preview.confirmationHash,
    }));
    expect(confirm).not.toHaveBeenCalled();
  });

  it("shows validation failures beside the start button and allows a retry", async () => {
    mocks.previewVerifiedProblem.mockRejectedValue(new Error("Use a verified format: mean: 4, 8, 12"));
    render(<MemoryRouter><SecureTaskStart /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "My own problem" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "unsupported question" } });
    fireEvent.click(screen.getByRole("button", { name: "Validate and start" }));
    const alert = await screen.findByRole("alert");
    const button = screen.getByRole("button", { name: "Validate and start" });
    expect(alert).toHaveTextContent("Use a verified format");
    expect(alert.nextElementSibling).toBe(button);
    expect(button).toBeEnabled();
    expect(mocks.startLearningSession).not.toHaveBeenCalled();
  });

  it("shows a retryable load failure instead of claiming no topics are ready", async () => {
    mocks.getLearningCatalog.mockRejectedValueOnce(new Error("The secure service is unavailable."));
    render(<MemoryRouter><SecureTaskStart /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("The secure service is unavailable.");
    expect(screen.queryByText(/No approved topics are available yet/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prepared problem" })).not.toBeInTheDocument();

    mocks.getDoc.mockReset();
    mocks.getDoc
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({ exists: () => true });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Assign my prepared problem" })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the empty catalog notice only after a successful load", async () => {
    mocks.getLearningCatalog.mockResolvedValueOnce({ subjects: [], topics: [], generatedAt: 1 });
    render(<MemoryRouter><SecureTaskStart /></MemoryRouter>);
    expect(await screen.findByText(/No approved topics are available yet/)).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lets learners without an academic profile start a prepared session", async () => {
    render(<MemoryRouter><SecureTaskStart /></MemoryRouter>);
    const start = await screen.findByRole("button", { name: "Assign my prepared problem" });
    expect(screen.queryByText("Complete your academic profile")).not.toBeInTheDocument();
    fireEvent.click(start);
    expect(mocks.startLearningSession).toHaveBeenCalledWith({ mode: "curated", topicId: "quantitative-methods-introduction-to-probability" });
  });

  it("shows descriptions and personalized progress before topic selection", async () => {
    render(<MemoryRouter><SecureTaskStart /></MemoryRouter>);
    expect(await screen.findByText("Practice data and probability.")).toBeVisible();
    expect(screen.getByText("Practice logic and proof.")).toBeVisible();
    expect(screen.getByText("84/100")).toBeVisible();
    expect(screen.getByText("Intermediate")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /discrete mathematics/i }));
    expect(screen.getByRole("option", { name: "Logic" })).toBeVisible();
  });

it('changes custom guidance with topic and accurately disables unsupported topics', async () => {
  clearViews();
  mocks.getLearningCatalog.mockResolvedValue({subjects:VALIDATED_SUBJECTS,topics:VALIDATED_TOPICS,generatedAt:1});
  mocks.getDoc.mockReset().mockResolvedValueOnce({exists:()=>false}).mockResolvedValueOnce({exists:()=>true});
  render(<MemoryRouter><SecureTaskStart /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button',{name:'My own problem'}));
  expect(screen.getByText(/Function evaluation with/)).toBeVisible();
  fireEvent.change(screen.getByRole('combobox',{name:/Validated topic/}),{target:{value:'quantitative-methods-descriptive-statistics'}});
  expect(screen.getByText(/population\/sample variance/)).toBeVisible();
  fireEvent.change(screen.getByRole('combobox',{name:/Validated topic/}),{target:{value:'quantitative-methods-probability-distributions'}});
  expect(screen.getByText(/Custom problems are not supported/)).toBeVisible();
  expect(screen.getByRole('button',{name:'Validate and start'})).toBeDisabled();
  cleanup();
});
it('passes optional notation unchanged and prevents duplicate in-flight starts', async () => {
  clearViews();
  mocks.getLearningCatalog.mockResolvedValue({subjects:VALIDATED_SUBJECTS,topics:VALIDATED_TOPICS,generatedAt:1});
  mocks.getDoc.mockReset().mockResolvedValueOnce({exists:()=>false}).mockResolvedValueOnce({exists:()=>true});
  let resolve!: (v: {confirmationHash:string})=>void;
  mocks.previewVerifiedProblem.mockImplementation(()=>new Promise(r=>{resolve=r;}));
  mocks.startLearningSession.mockReset().mockResolvedValue({session:{id:'custom'}});
  render(<MemoryRouter><SecureTaskStart /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button',{name:'My own problem'}));
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Given f(x) = [math], find f(5).'}});
  const field=screen.getByLabelText('Mathematical expression editor') as HTMLElement & {value:string};
  field.value='2x+3'; fireEvent.input(field);
  const button=screen.getByRole('button',{name:'Validate and start'});
  fireEvent.click(button);fireEvent.click(button);
  expect(button).toBeDisabled();
  resolve({confirmationHash:'confirmed'});
  await waitFor(()=>expect(mocks.startLearningSession).toHaveBeenCalledOnce());
  expect(mocks.startLearningSession).toHaveBeenCalledWith(expect.objectContaining({questionLatex:'2x+3',question:'Given f(x) = [math], find f(5).'}));
  cleanup();
});

});
