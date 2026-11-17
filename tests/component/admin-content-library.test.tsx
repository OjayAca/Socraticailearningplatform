import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SecureAdminContent } from "@/app/components/admin/AdminContentLibrary";
import { SecureAdminContentEditor } from "@/app/components/admin/AdminContentEditor";

const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  adminCatalogReadiness: vi.fn(),
  adminUpsertContent: vi.fn(),
  adminArchiveContent: vi.fn(),
  adminDeleteContent: vi.fn(),
  adminSubmitProblemValidation: vi.fn(),
  adminRecordProblemValidation: vi.fn(),
  adminBulkImportProblems: vi.fn(),
  signOut: vi.fn<() => Promise<void>>(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme: "light",
    setTheme: vi.fn(),
  }),
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      signOut: mocks.signOut,
      userProfile: {
        uid: "admin-1",
        displayName: "Ada Lovelace",
        email: "ada@mindguide.edu",
        role: "admin",
      },
      firebaseUser: { uid: "admin-1" },
    }),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => path.join("/")),
  doc: vi.fn((_db: unknown, ...path: string[]) => path.join("/")),
  getDocs: mocks.getDocs,
  getDoc: mocks.getDoc,
  query: vi.fn((value: unknown) => value),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));

vi.mock("@/lib/secure-api", () => ({
  adminCatalogReadiness: mocks.adminCatalogReadiness,
  adminUpsertContent: mocks.adminUpsertContent,
  adminArchiveContent: mocks.adminArchiveContent,
  adminDeleteContent: mocks.adminDeleteContent,
  adminSubmitProblemValidation: mocks.adminSubmitProblemValidation,
  adminRecordProblemValidation: mocks.adminRecordProblemValidation,
  adminBulkImportProblems: mocks.adminBulkImportProblems,
}));

function makeSnapshot(records: Array<Record<string, unknown>>) {
  return {
    size: records.length,
    docs: records.map((record) => {
      const { id, ...rest } = record;
      return {
        id: String(id),
        data: () => rest,
      };
    }),
  };
}

function makeDocSnap(record: Record<string, unknown> | null) {
  if (!record) {
    return {
      exists: () => false,
      data: () => undefined,
      get: () => undefined,
    };
  }
  const { id, ...rest } = record;
  return {
    id: String(id ?? ""),
    exists: () => true,
    data: () => rest,
    get: (key: string) => rest[key],
  };
}

function renderContentRoute(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin/content/:collection" element={<SecureAdminContent />} />
        <Route path="/admin/content/:collection/new" element={<SecureAdminContentEditor />} />
        <Route
          path="/admin/content/:collection/edit/:recordId"
          element={<SecureAdminContentEditor />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

const SAMPLE_PROBLEMS: Array<Record<string, unknown>> = [
  {
    id: "QM-01-B01",
    title: "Derivative of a polynomial",
    subjectId: "quantitative-methods",
    topicId: "quantitative-methods-functions",
    subject: "Quantitative Methods",
    topic: "Functions",
    difficulty: "Basic",
    variant: 1,
    questionType: "constructed_response",
    problemText: "Find the derivative of $f(x) = x^2 + 3x$.",
    supportedResponseFormats: ["text", "latex"],
    formulaTheoremReferenceIds: ["ref-power-rule"],
    status: "draft",
    version: 1,
  },
  {
    id: "DM-04-I01",
    title: "Truth table equivalence",
    subjectId: "discrete-mathematics",
    topicId: "discrete-mathematics-logic",
    subject: "Discrete Mathematics",
    topic: "Logic",
    difficulty: "Intermediate",
    variant: 1,
    questionType: "multiple_choice",
    choices: ["$p \\lor q$", "$\\neg p \\land \\neg q$"],
    problemText: "Which expression is logically equivalent to $\\neg(p \\land q)$?",
    supportedResponseFormats: ["text", "latex"],
    formulaTheoremReferenceIds: ["ref-demorgan"],
    status: "approved",
    version: 2,
  },
  {
    id: "QM-03-A01",
    title: "Archived Bayes question",
    subjectId: "quantitative-methods",
    topicId: "quantitative-methods-introduction-to-probability",
    subject: "Quantitative Methods",
    topic: "Introduction to Probability",
    difficulty: "Advanced",
    variant: 1,
    questionType: "constructed_response",
    problemText: "Compute posterior probability using Bayes' theorem.",
    supportedResponseFormats: ["text"],
    formulaTheoremReferenceIds: ["ref-bayes"],
    status: "archived",
    version: 1,
  },
];

describe("AdminContentLibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue(undefined);
    mocks.adminCatalogReadiness.mockResolvedValue({
      ready: false,
      expectedProblemCount: 36,
      approvedProblemCount: 1,
      cells: [
        {
          topicId: "discrete-mathematics-logic",
          difficulty: "Intermediate",
          approvedVariants: 1,
          ready: true,
        },
        {
          topicId: "quantitative-methods-functions",
          difficulty: "Basic",
          approvedVariants: 0,
          ready: false,
        },
      ],
      issues: ["quantitative-methods-functions / Basic: no available validated question."],
      generatedAt: 1,
    });
    mocks.adminArchiveContent.mockResolvedValue({});
    mocks.adminUpsertContent.mockResolvedValue({ id: "QM-03-A01", version: 2 });
    mocks.adminDeleteContent.mockResolvedValue({ deleted: true });
  });

  afterEach(cleanup);

  it("renders AdminShell active navigation, tabs, readiness summary, and filters problem records", async () => {
    mocks.getDocs.mockImplementation(async (path: string) => {
      if (path === "problems") return makeSnapshot(SAMPLE_PROBLEMS);
      return makeSnapshot([]);
    });

    renderContentRoute("/admin/content/problems");

    const sidebar = screen.getByLabelText("Administrator sidebar");
    expect(within(sidebar).getByRole("link", { name: "Content Library" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    expect(screen.getByRole("link", { name: "Problem Bank" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Formulas & Theorems" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Socratic Prompt Bank" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Subjects & Topics" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Misconception Categories" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Difficulty Policies" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add new content/i })).toHaveAttribute(
      "href",
      "/admin/content/problems/new",
    );

    await screen.findByText("Derivative of a polynomial");
    expect(screen.getByText("Truth table equivalence")).toBeInTheDocument();
    expect(screen.getByText("Archived Bayes question")).toBeInTheDocument();

    // Collapsible readiness bar
    expect(screen.getByText("Prepared-practice availability")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /view coverage gaps/i }));
    expect(
      screen.getByText("quantitative-methods-functions / Basic: no available validated question."),
    ).toBeVisible();

    // Faceted filtering
    fireEvent.change(screen.getByLabelText("Subject filter"), {
      target: { value: "Discrete Mathematics" },
    });
    expect(screen.queryByText("Derivative of a polynomial")).not.toBeInTheDocument();
    expect(screen.getByText("Truth table equivalence")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(screen.getByText("Derivative of a polynomial")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Question Type filter"), {
      target: { value: "multiple_choice" },
    });
    expect(screen.queryByText("Derivative of a polynomial")).not.toBeInTheDocument();
    expect(screen.getByText("Truth table equivalence")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Question Type filter"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Status filter"), { target: { value: "archived" } });
    expect(screen.getByText("Archived Bayes question")).toBeInTheDocument();
    expect(screen.queryByText("Truth table equivalence")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Status filter"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Search content records"), {
      target: { value: "polynomial" },
    });
    expect(screen.getByText("Derivative of a polynomial")).toBeInTheDocument();
    expect(screen.queryByText("Truth table equivalence")).not.toBeInTheDocument();
  });

  it("switches between primary categories and Policies & Categories routes cleanly", async () => {
    mocks.getDocs.mockImplementation(async (path: string) => {
      if (path === "problems") return makeSnapshot(SAMPLE_PROBLEMS);
      if (path === "formula_theorem_references") {
        return makeSnapshot([
          {
            id: "ref-bayes",
            kind: "theorem",
            domain: "Quantitative Methods",
            statement: "Bayes' Theorem relates conditional probabilities.",
            supportedTopics: ["Introduction to Probability"],
            status: "approved",
            version: 1,
          },
        ]);
      }
      if (path === "difficulty_policies") {
        return makeSnapshot([
          {
            id: "policy-global",
            subjectId: null,
            topicId: null,
            minimumCompletedSessions: 2,
            increaseScoreThreshold: 80,
            decreaseScoreThreshold: 60,
            maxHintsForIncrease: 1,
            arithmeticErrorAloneLowersDifficulty: false,
            status: "approved",
            version: 1,
          },
        ]);
      }
      return makeSnapshot([]);
    });

    renderContentRoute("/admin/content/problems");
    await screen.findByText("Derivative of a polynomial");

    fireEvent.click(screen.getByRole("link", { name: "Formulas & Theorems" }));
    expect(
      await screen.findByText("Bayes' Theorem relates conditional probabilities."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add new content/i })).toHaveAttribute(
      "href",
      "/admin/content/formula_theorem_references/new",
    );

    fireEvent.click(screen.getByRole("link", { name: "Difficulty Policies" }));
    expect(await screen.findByText("Global Default Policy")).toBeInTheDocument();
    expect(screen.getByText("80 / 60")).toBeInTheDocument();
  });

  it("paginates large record lists using AdminPagination", async () => {
    const twelveProblems = Array.from({ length: 12 }, (_, index) => ({
      id: `QM-01-B${String(index + 1).padStart(2, "0")}`,
      title: `Paginated Question ${index + 1}`,
      subject: "Quantitative Methods",
      topic: "Functions",
      difficulty: "Basic",
      questionType: "constructed_response",
      problemText: `Problem body ${index + 1}`,
      status: "draft",
      version: 1,
    }));
    mocks.getDocs.mockResolvedValue(makeSnapshot(twelveProblems));

    renderContentRoute("/admin/content/problems");
    await screen.findByText("Paginated Question 1");
    expect(screen.getByText("Paginated Question 10")).toBeInTheDocument();
    expect(screen.queryByText("Paginated Question 11")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Paginated Question 11")).toBeInTheDocument();
    expect(screen.getByText("Paginated Question 12")).toBeInTheDocument();
    expect(screen.queryByText("Paginated Question 1")).not.toBeInTheDocument();
  });

  it("opens preview modal and enforces confirmed archive, restore, and typed-ID delete", async () => {
    mocks.getDocs.mockResolvedValue(makeSnapshot(SAMPLE_PROBLEMS));

    renderContentRoute("/admin/content/problems");
    await screen.findByText("Truth table equivalence");

    // Preview modal for Multiple Choice record
    fireEvent.click(screen.getByRole("button", { name: "Preview DM-04-I01" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Truth table equivalence")).toBeVisible();
    expect(within(dialog).getByRole("link", { name: /edit record/i })).toHaveAttribute(
      "href",
      "/admin/content/problems/edit/DM-04-I01",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Close preview" }));

    // Approved record cannot be permanently deleted
    expect(
      screen.queryByRole("button", { name: "Permanently delete DM-04-I01" }),
    ).not.toBeInTheDocument();

    // Archive draft record with ConfirmDialog
    fireEvent.click(screen.getByRole("button", { name: "Archive QM-01-B01" }));
    expect(await screen.findByText("Archive this record?")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Archive record" }));
    await waitFor(() =>
      expect(mocks.adminArchiveContent).toHaveBeenCalledWith({
        collection: "problems",
        id: "QM-01-B01",
      }),
    );

    // Restore archived record with ConfirmDialog
    fireEvent.click(screen.getByRole("button", { name: "Restore QM-03-A01" }));
    expect(await screen.findByText("Restore this archived record?")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Restore record" }));
    await waitFor(() =>
      expect(mocks.adminUpsertContent).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "problems",
          id: "QM-03-A01",
          value: expect.objectContaining({ status: "draft" }),
        }),
      ),
    );

    // Delete draft record requires typed ID + >=8 char reason
    fireEvent.click(screen.getByRole("button", { name: "Permanently delete QM-01-B01" }));
    const deleteModal = await screen.findByRole("alertdialog");
    const confirmDeleteBtn = within(deleteModal).getByRole("button", {
      name: "Permanently delete",
    });
    expect(confirmDeleteBtn).toBeDisabled();

    fireEvent.change(within(deleteModal).getByLabelText(/Type QM-01-B01 to confirm/i), {
      target: { value: "QM-01-B01" },
    });
    fireEvent.change(within(deleteModal).getByLabelText(/Audit reason/i), {
      target: { value: "short" },
    });
    expect(confirmDeleteBtn).toBeDisabled();

    fireEvent.change(within(deleteModal).getByLabelText(/Audit reason/i), {
      target: { value: "Duplicate draft problem removed" },
    });
    expect(confirmDeleteBtn).toBeEnabled();
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() =>
      expect(mocks.adminDeleteContent).toHaveBeenCalledWith({
        collection: "problems",
        id: "QM-01-B01",
        reason: "Duplicate draft problem removed",
      }),
    );
  });
});

describe("AdminContentEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue(undefined);
    mocks.adminUpsertContent.mockResolvedValue({ id: "DM-02-I02", version: 1 });
    mocks.adminSubmitProblemValidation.mockResolvedValue({ id: "DM-02-I02" });
    mocks.adminRecordProblemValidation.mockResolvedValue({
      status: "approved",
      validationRecordId: "val-1",
    });
  });

  afterEach(cleanup);

  it("renders 4 problem sections, auto-populates IDs, conditionally shows Multiple Choice choices, previews with MathText, and validates", async () => {
    mocks.getDocs.mockImplementation(async (path: string) => {
      if (path === "formula_theorem_references") {
        return makeSnapshot([
          {
            id: "ref-set-ops",
            kind: "formula",
            domain: "Discrete Mathematics",
            statement: "$A \\cap B$ represents set intersection.",
            status: "approved",
          },
        ]);
      }
      if (path === "topics") {
        return makeSnapshot([
          {
            id: "discrete-mathematics-set-theory",
            subjectId: "discrete-mathematics",
            subject: "Discrete Mathematics",
            name: "Set Theory",
          },
        ]);
      }
      return makeSnapshot([]);
    });

    renderContentRoute("/admin/content/problems/new");

    // 4 clear sections
    expect(screen.getByText("Basic Information")).toBeInTheDocument();
    expect(screen.getByText("Problem Details")).toBeInTheDocument();
    expect(screen.getByText("Learning Requirements & Protected Solution")).toBeInTheDocument();
    expect(screen.getByText("Review and Save")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to problems/i })).toHaveAttribute(
      "href",
      "/admin/content/problems",
    );

    // Initial auto-populated values for Quantitative Methods / Functions / Basic / Variant 1
    expect(screen.getByLabelText("Stable Record ID")).toHaveValue("QM-01-B01");
    expect(screen.getByLabelText("Subject ID Override")).toHaveValue("quantitative-methods");
    expect(screen.getByLabelText("Topic ID Override")).toHaveValue("quantitative-methods-functions");

    // Conditional Multiple Choice visibility: hidden initially
    expect(screen.queryByLabelText("Choice 1")).not.toBeInTheDocument();

    // Change Subject, Topic (filtered by Subject), Difficulty, Variant -> auto-updates subjectId, topicId, Record ID
    fireEvent.change(screen.getByLabelText("Subject"), {
      target: { value: "Discrete Mathematics" },
    });
    expect(screen.getByLabelText("Subject ID Override")).toHaveValue("discrete-mathematics");

    const topicSelect = screen.getByLabelText("Topic") as HTMLSelectElement;
    const topicOptionLabels = Array.from(topicSelect.options).map((opt) => opt.value);
    expect(topicOptionLabels).toContain("Set Theory");
    expect(topicOptionLabels).not.toContain("Functions");

    fireEvent.change(topicSelect, { target: { value: "Set Theory" } });
    fireEvent.change(screen.getByLabelText("Difficulty"), { target: { value: "Intermediate" } });
    fireEvent.change(screen.getByLabelText("Variant (1–3)"), { target: { value: "2" } });

    expect(screen.getByLabelText("Topic ID Override")).toHaveValue("discrete-mathematics-set-theory");
    expect(screen.getByLabelText("Stable Record ID")).toHaveValue("DM-02-I02");

    // Validate before completing required fields -> shows clear validation messages
    fireEvent.click(screen.getByRole("button", { name: /validate content/i }));
    expect(
      await screen.findByText(/Learner-visible problem must be at least 8 characters/i),
    ).toBeVisible();

    // Switch to Multiple Choice -> Answer Choices appear
    fireEvent.change(screen.getByLabelText("Question Type"), {
      target: { value: "multiple_choice" },
    });
    expect(screen.getByLabelText("Choice 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Choice 2")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Question Title"), {
      target: { value: "Set intersection check" },
    });
    fireEvent.change(screen.getByLabelText("Learner-Visible Problem"), {
      target: { value: "Find $A \\cap B$ when $A = \\{1, 2\\}$ and $B = \\{2, 3\\}$." },
    });
    fireEvent.change(screen.getByLabelText("Choice 1"), { target: { value: "$\\{2\\}$" } });
    fireEvent.change(screen.getByLabelText("Choice 2"), { target: { value: "$\\{1, 2, 3\\}$" } });

    // Live preview reflects title, problem text, and MC choices
    const preview = screen.getByLabelText("Live question preview");
    expect(within(preview).getByText("Set intersection check")).toBeVisible();
    expect(within(preview).getByText("A.")).toBeVisible();
    expect(within(preview).getByText("B.")).toBeVisible();

    // Fill Section 3 learning requirements
    fireEvent.change(screen.getByLabelText(/Expected Concepts/i), {
      target: { value: "Set intersection, set membership" },
    });
    fireEvent.click(await screen.findByLabelText(/ref-set-ops/i));
    fireEvent.change(screen.getByLabelText(/Protected Worked Steps/i), {
      target: { value: "Identify common elements in A and B.\nConclude {2}." },
    });
    fireEvent.change(screen.getByLabelText("Protected Final Answer"), {
      target: { value: "{2}" },
    });
    fireEvent.change(screen.getByLabelText("Protected Interpretation"), {
      target: { value: "Only 2 appears in both sets." },
    });

    // Validate passes
    fireEvent.click(screen.getByRole("button", { name: /validate content/i }));
    expect(
      await screen.findByText("All validation checks passed — ready to save."),
    ).toBeVisible();

    // Save via adminUpsertContent
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() =>
      expect(mocks.adminUpsertContent).toHaveBeenCalledWith({
        collection: "problems",
        id: "DM-02-I02",
        value: expect.objectContaining({
          subjectId: "discrete-mathematics",
          topicId: "discrete-mathematics-set-theory",
          subject: "Discrete Mathematics",
          topic: "Set Theory",
          difficulty: "Intermediate",
          variant: 2,
          questionType: "multiple_choice",
          choices: ["$\\{2\\}$", "$\\{1, 2, 3\\}$"],
          formulaTheoremReferenceIds: ["ref-set-ops"],
          status: "draft",
        }),
      }),
    );

    // Switching back to Constructed Response hides Answer Choices again
    fireEvent.change(screen.getByLabelText("Question Type"), {
      target: { value: "constructed_response" },
    });
    expect(screen.queryByLabelText("Choice 1")).not.toBeInTheDocument();
  });

  it("loads existing problem with private solution, supports validation workflow, and guards unsaved changes", async () => {
    mocks.getDocs.mockResolvedValue(makeSnapshot([]));
    mocks.getDoc.mockImplementation(async (path: string) => {
      if (path === "problems/QM-01-B01") {
        return makeDocSnap({
          id: "QM-01-B01",
          subjectId: "quantitative-methods",
          topicId: "quantitative-methods-functions",
          subject: "Quantitative Methods",
          topic: "Functions",
          difficulty: "Basic",
          variant: 1,
          title: "Slope check",
          questionType: "constructed_response",
          problemText: "Find the derivative of $f(x) = 3x$.",
          supportedResponseFormats: ["text", "latex"],
          formulaTheoremReferenceIds: ["ref-1"],
          status: "draft",
        });
      }
      if (path === "problems/QM-01-B01/private/solution") {
        return makeDocSnap({
          expectedConcepts: ["Linear derivative"],
          solutionSteps: ["Apply power rule."],
          finalAnswer: "3",
          interpretation: "Constant rate of change is 3.",
        });
      }
      return makeDocSnap(null);
    });

    renderContentRoute("/admin/content/problems/edit/QM-01-B01");

    expect(await screen.findByDisplayValue("Slope check")).toBeInTheDocument();
    expect(screen.getByLabelText("Protected Final Answer")).toHaveValue("3");

    // Submit for faculty validation
    fireEvent.click(screen.getByRole("button", { name: /submit for faculty validation/i }));
    await waitFor(() =>
      expect(mocks.adminSubmitProblemValidation).toHaveBeenCalledWith("QM-01-B01"),
    );

    // Unsaved changes guard when clicking Back
    fireEvent.change(screen.getByLabelText("Question Title"), {
      target: { value: "Edited slope check" },
    });
    fireEvent.click(screen.getByRole("link", { name: /back to problems/i }));
    expect(await screen.findByText("Discard unsaved changes?")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Question Title")).toHaveValue("Edited slope check");
  });

  it("supports non-problem collections like formula_theorem_references", async () => {
    mocks.getDocs.mockResolvedValue(makeSnapshot([]));

    renderContentRoute("/admin/content/formula_theorem_references/new");

    fireEvent.change(screen.getByLabelText("Statement"), {
      target: { value: "$P(A|B) = P(A \\cap B) / P(B)$" },
    });
    fireEvent.change(screen.getByLabelText(/Application Conditions/i), {
      target: { value: "P(B) > 0" },
    });

    fireEvent.click(screen.getByRole("button", { name: /validate content/i }));
    expect(
      await screen.findByText("All validation checks passed — ready to save."),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() =>
      expect(mocks.adminUpsertContent).toHaveBeenCalledWith({
        collection: "formula_theorem_references",
        id: expect.stringMatching(/^ref-qm-formula-/),
        value: expect.objectContaining({
          kind: "formula",
          domain: "Quantitative Methods",
          conditions: ["P(B) > 0"],
        }),
      }),
    );
  });
});
