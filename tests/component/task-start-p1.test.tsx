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
  getPreparedTopicIds: vi.fn(),
  getCurrentConsentNotice: vi.fn(),
  startLearningSession: vi.fn(),
  previewVerifiedProblem: vi.fn(),
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
}));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: () => ({
    firebaseUser: { uid: "student-1" },
    userProfile: { uid: "student-1", displayName: "Student", academicProfileComplete: false, academicProfile: null },
    reloadProfile: vi.fn(),
  }),
}));
vi.mock("@/app/components/StudentShell", () => ({ StudentShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

async function choose(mode: "Prepared Problem" | "Own Problem", subject = /Quantitative Methods/) {
  fireEvent.click(await screen.findByRole("button", { name: subject }));
  fireEvent.click(screen.getByRole("button", { name: mode }));
}

describe("P1 subject-first task start", () => {
  beforeEach(() => {
    clearViews();
    mocks.getPreparedTopicIds.mockImplementation(async id => VALIDATED_TOPICS.filter(t => t.subjectId === id).map(t => t.id));
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
    expect(screen.queryByRole("button", { name: "Prepared Problem" })).not.toBeInTheDocument();
    await choose("Prepared Problem");
    let select = await screen.findByRole("combobox", { name: "Topic" });
    expect(screen.getAllByRole("option").slice(1).map(item => item.textContent)).toEqual(VALIDATED_TOPICS.slice(0, 6).map(item => item.name));
    fireEvent.change(select, { target: { value: "quantitative-methods-functions" } });
    expect(screen.getByText("Images and Pre-images")).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "quantitative-methods-descriptive-statistics" } });
    expect(screen.getByText("Descriptive Measures")).toBeInTheDocument();
    expect(screen.getByText("Kurtosis")).toBeInTheDocument();
    await choose("Prepared Problem", /Discrete Mathematics/);
    select = await screen.findByRole("combobox", { name: "Topic" });
    expect(select).toHaveValue("");
    expect(screen.getAllByRole("option").slice(1).map(item => item.textContent)).toEqual(VALIDATED_TOPICS.slice(6).map(item => item.name));
  });
  it("reuses setup immediately when returning to the page", async () => {
    const view = render(<MemoryRouter><SecureTaskStart /></MemoryRouter>);
    await screen.findByRole("button", { name: /Quantitative Methods/ });
    view.unmount();
    render(<MemoryRouter><SecureTaskStart /></MemoryRouter>);
    expect(screen.getByRole("button", { name: /Quantitative Methods/ })).toBeVisible();
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
    await choose("Own Problem");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: question } });
    fireEvent.click(screen.getByRole("button", { name: "Validate and start" }));
    await waitFor(() => expect(mocks.startLearningSession).toHaveBeenCalledWith({
      mode: "free_form", subjectId: "quantitative-methods", question,
      confirmationHash: preview.confirmationHash,
    }));
    expect(confirm).not.toHaveBeenCalled();
  });

  it("shows validation failures beside the start button and allows a retry", async () => {
    mocks.previewVerifiedProblem.mockRejectedValue(new Error("Use a verified format: mean: 4, 8, 12"));
    render(<MemoryRouter><SecureTaskStart /></MemoryRouter>);
    await choose("Own Problem");
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
    expect(await screen.findByRole("button", { name: /Quantitative Methods/ })).toBeVisible();
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
    await choose("Prepared Problem");
    const start = screen.getByRole("button", { name: "Start Session" });
    expect(start).toBeDisabled();
    fireEvent.change(await screen.findByRole("combobox", {name:"Topic"}), {target:{value:"quantitative-methods-introduction-to-probability"}});
    expect(screen.getByRole("combobox", {name:/Difficulty/})).toHaveValue("Basic");
    expect(screen.queryByText("Complete your academic profile")).not.toBeInTheDocument();
    fireEvent.click(start);
    expect(mocks.startLearningSession).toHaveBeenCalledWith({ mode: "curated", subjectId:"quantitative-methods", requestedDifficulty:"Basic", topicId: "quantitative-methods-introduction-to-probability" });
  });

  it("shows descriptions and personalized progress before topic selection", async () => {
    render(<MemoryRouter><SecureTaskStart /></MemoryRouter>);
    expect(await screen.findByText("Practice data and probability.")).toBeVisible();
    expect(screen.getByText("Practice logic and proof.")).toBeVisible();
    expect(screen.getByText("84/100")).toBeVisible();
    expect(screen.getByText("Intermediate")).toBeVisible();
    await choose("Prepared Problem", /Discrete Mathematics/);
    expect(await screen.findByRole("option", { name: "Logic" })).toBeVisible();
  });

  it("clears the question, notation and manual level when switching modes or subjects", async () => {
    render(<MemoryRouter><SecureTaskStart /></MemoryRouter>);
    await choose("Own Problem");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox"), {target:{value:"probability: [math]"}});
    const field = screen.getByLabelText("Mathematical expression editor") as HTMLElement & {value:string};
    field.value = "3, 10"; fireEvent.input(field);
    await choose("Own Problem", /Discrete Mathematics/);
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getByLabelText("Mathematical expression editor")).not.toHaveValue("3, 10");
    expect(screen.getByRole("button",{name:"Validate and start"})).toBeDisabled();
    await choose("Prepared Problem");
    let topic = await screen.findByRole("combobox", {name:"Topic"});
    fireEvent.change(topic, {target:{value:"quantitative-methods-introduction-to-probability"}});
    fireEvent.change(screen.getByRole("combobox",{name:/Difficulty/}), {target:{value:"Advanced"}});
    await choose("Own Problem");
    await choose("Prepared Problem");
    topic = await screen.findByRole("combobox", {name:"Topic"});
    expect(topic).toHaveValue("");
    fireEvent.change(topic, {target:{value:"quantitative-methods-introduction-to-probability"}});
    expect(screen.getByRole("combobox",{name:/Difficulty/})).toHaveValue("Basic");
  });

  it("defaults to the saved topic recommendation and lets the student override it", async () => {
    mocks.getDoc.mockReset().mockResolvedValueOnce({exists:()=>true,data:()=>({
      topicRecommendations:{logic:{recommendedDifficulty:"Intermediate"}}
    })}).mockResolvedValueOnce({exists:()=>true});
    render(<MemoryRouter><SecureTaskStart /></MemoryRouter>);
    await choose("Prepared Problem", /Discrete Mathematics/);
    fireEvent.change(await screen.findByRole("combobox", {name:"Topic"}), {target:{value:"discrete-mathematics-logic"}});
    const level = screen.getByRole("combobox", {name:/Difficulty/});
    expect(level).toHaveValue("Intermediate");
    fireEvent.change(level, {target:{value:"Advanced"}});
    fireEvent.click(screen.getByRole("button", {name:"Start Session"}));
    expect(mocks.startLearningSession).toHaveBeenCalledWith({
      mode:"curated",subjectId:"discrete-mathematics",topicId:"discrete-mathematics-logic",requestedDifficulty:"Advanced"
    });
  });

it('passes optional notation unchanged and prevents duplicate in-flight starts', async () => {
  clearViews();
  mocks.getLearningCatalog.mockResolvedValue({subjects:VALIDATED_SUBJECTS,topics:VALIDATED_TOPICS,generatedAt:1});
  mocks.getDoc.mockReset().mockResolvedValueOnce({exists:()=>false}).mockResolvedValueOnce({exists:()=>true});
  let resolve!: (v: {confirmationHash:string})=>void;
  mocks.previewVerifiedProblem.mockImplementation(()=>new Promise(r=>{resolve=r;}));
  mocks.startLearningSession.mockReset().mockResolvedValue({session:{id:'custom'}});
  render(<MemoryRouter><SecureTaskStart /></MemoryRouter>);
  await choose("Own Problem");
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
