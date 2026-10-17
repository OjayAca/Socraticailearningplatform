# MINDGUIDE manuscript-to-system alignment audit

Audit date: 1 October 2026, Asia/Manila. Reference: the supplied **MINDGUIDE Final.docx**, not earlier repository amendment notes.

**Verdict: partially aligned in implementation, materially unaligned in current learning configuration, and not yet supported by sufficient evidence for the manuscript's full evaluation scenario.** The six learning modules have substantial code behind them. However, the real Firebase project currently offers a temporary two-topic setup with no prepared problem bank or faculty-validation records. There are also confirmed learner-facing defects, incomplete administrative promises, and outdated manuscript diagrams.

This is an audit, not an implementation change. No application source, original manuscript, Firebase data, approvals, account access, or project selection was changed to make the system appear compliant. Existing local uncommitted work was included in the review and preserved. Repository tests use their existing mocks; no demo database or emulator was created or used.

## What was examined and what the verdict means

- Read the DOCX's research objectives, scope, related literature, methodology, workflows, storyboard requirements, functional requirements, data dictionary, module list, and questionnaire. Extraction covered 1,178 body paragraphs and 52 Word tables; images and relevant floating diagrams/text boxes were inspected separately. Word table indices are not the manuscript's printed table numbers.
- Traced the active frontend-to-backend dispatch, the current Gemini tutor, learner/admin views, input handling, scoring, reporting, content approval, and local Firestore rules. Older deterministic code and old audit documents were not assumed to describe the active AI workflow.
- Made read-only queries against the existing Firebase project **socratic-ai-a7765**, using the configuration loaded by Next.js from the existing environment files. Verified that backend and frontend project identifiers match. Credentials were not included in the report.
- Inspected the running local application using the existing signed-in student browser session: dashboard, task selection, profile, history, and a completed-session review. No new learning interaction was submitted. No account was created or modified.
- Ran TypeScript, lint, the existing unit/component suite, a production build, and small local mathematical/leak-guard probes. This is not an independent faculty validation or a full authenticated administrator acceptance test.

**Evidence labels:** Live = actual configured Firebase or browser observation; Code = active implementation traced; Probe = isolated local function execution; Document = supplied manuscript; Unverified = needs external or live evidence. “Missing” means absent from the inspected implementation/configuration, not proof that no separate institution-held document exists. Priorities: Critical blocks the claimed research/demo capability; High affects a core promise or reliable records; Medium affects completeness or defensibility; Low is presentation/editorial.

## Real configuration at the time of inspection

| Item | Observed state | Consequence |
|---|---|---|
| Approved subjects | 1: Temporary Solver Testing | Neither named research subject is currently selectable as a subject |
| Approved topics | Measures of Central Tendency; Counting Principles | Only two temporary catalog topics are available |
| Prepared problems | 0 | Curated sessions cannot select a problem |
| Faculty/content-validation records | 0 | No recorded faculty-approved problem bank exists in this project |
| Formula/theorem reference records | 0 | No managed reference library is configured |
| Socratic prompt-bank records | 0 | No managed prompt bank is configured |
| Misconception-category records | 0 | No managed category library is configured |
| Difficulty-policy records | 0 | No managed difficulty policies are configured |
| Pilot | Open, two temporary topics enabled | Opening the pilot does not make the content complete |
| Pilot roster | 1 admitted account | Not prepared for the approximately 50 intended respondents |
| Accounts | 6 total: 5 student, 1 admin | Counts are not evidence of participant recruitment |
| Academic profiles marked complete | 1 | Most current profiles lack that completion flag |
| Learning sessions | 43 | Historical records exist, but do not establish current-workflow success |
| Current workflow version 6 | 4 sessions | Current tutoring exists in the data, but no current submission was established |
| Sessions with statsCommittedAt | 0 of 43 | Current performance-report filters have no eligible submitted population |
| Session statuses | 34 in progress, 3 submitted, 3 completed, 2 expired, 1 abandoned | Status labels alone do not satisfy the new submission contract |
| AI failure-log collection | 0 | Does not prove the provider has never failed |
| Private AI / unlock-event subcollection records | 1 each across history | Legacy records exist; the current service does not create this promised event trail |
| AI configuration | Enabled; gemini-2.5-flash-lite; local shared caps 4 requests/minute, 18/day | These are application-configured caps, not independently verified provider entitlements |
| Privacy notice | Active Gemini notice | Some notice and UI wording is inconsistent with the current architecture |

Historical session subject names include Quantitative Methods and Discrete Mathematics. Those historical labels do **not** mean those subjects or their problem banks are currently configured.

## The six major learning modules

| Manuscript module | What exists | Alignment |
|---|---|---|
| Step-by-Step Socratic Solver | Server-backed Gemini dialogue, four visible stages, seven internal criteria, accepted/revision responses | Substantial implementation; content and empirical-quality gaps remain |
| Formula and Theorem Justification | Method-selection stage asks for why a method applies; reference conditions can accompany approved prepared problems | Partial: no live reference library, no distinct current justification screen, no automatic use of edited standalone references |
| Error Diagnosis and Misconception Detector | Fixed categories, model feedback, narrow deterministic answer checks, response diagnoses | Partial: managed categories are unused; correction stays in the current stage; no full misconception lifecycle |
| Adaptive Difficulty Engine | Rule-based recommendation from recent submitted AI sessions; prepared selection by nearest available level | Partial: no live prepared problems; custom-input difficulty is a label; misconception types are not direct recommendation inputs |
| Progressive Solution Unlock | Staged help and final-solution gate after the four stages | Partial: repeated help requests can unlock stronger help; leakage guard is limited; no scorecard per unlock |
| Critical Thinking Scorecard | Four 25-point criteria, evidence IDs, reasons, improvement advice, formative disclaimer | Substantial implementation; calibration pending, legacy rendering crash, aggregate-report mismatch |

## Detailed system findings

### F01 — Critical: the actual catalog does not match the two named research subjects

**Manuscript:** title, objectives, Scope and Limitations, Figure 32 subject selection, and functional requirements explicitly identify Quantitative Methods and Discrete Mathematics. **Live:** the sole approved subject is Temporary Solver Testing. Both enabled topics belong to this temporary setup; the student task page visibly shows that subject.

**Change needed:** configure the genuine syllabus-backed subjects and approved topic coverage in this same project through the real content process. Do not restore a demo or invent approvals. Do not present old session subject labels as proof of present coverage. Until the real content is available, describe this deployment as a limited solver test configuration.

### F02 — Critical: there is no configured prepared or faculty-validated problem bank

**Manuscript:** P0214 restricts support to a validated content matrix/problem bank drawn from approved course syllabi; Figures 26/37 and Table 24 require content management. **Live:** problems and content_validation_records both contain zero records; all four supporting content libraries are empty.

**Change needed:** obtain the real syllabus/course outline, approved matrix, problems, solutions, theorem conditions, prompts, difficulty classifications, and faculty evidence. Record those genuine decisions and verify assignment at each implemented level. Repository arrays, migrations, model instructions, and an “approved” topic label are not substitutes. The manuscript itself does not require the old repository's proposed 99-question count; agree the actual coverage with the adviser/faculty.

### F03 — High: “My own problem” is a six-operation grammar, not general mathematical text understanding

**Manuscript:** Figures 12/22/32 and the storyboard describe entering a mathematical problem; Chapter II discusses probability, statistical interpretation and proofs. **Code/probe:** only mean, median, mode, product, permutation, and combination are parsed. The topic name must exactly match one of two hard-coded names. Numeric lists require at least two values and are limited to 50 bounded values; counting inputs have additional integer/result bounds. `mean: 4, 8, 12` succeeds, while “Find the mean of the scores 4, 8, and 12” fails.

**Change needed:** either implement and validate additional text-based problem families or explicitly document the exact accepted custom-input formats and separate them from prepared-bank coverage. Probability, regression, variance, logic, and Pigeonhole proof examples cannot currently be demonstrated through this input path. Do not assume every topic mentioned in literature must be implemented: scope must be settled by the actual approved matrix. Evidence: [src/lib/learning/verified-problems.ts:6](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/lib/learning/verified-problems.ts:6>); [src/app/components/SecureTaskStart.tsx:230](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/SecureTaskStart.tsx:230>).

### F04 — High: the learner page advertises prepared practice even when none is available

**Live:** Prepared problem is the default, both topics appear as “Validated topic,” and “Assign my prepared problem” is enabled with zero prepared problems. **Code:** the catalog sets `ready: true` for every approved topic without checking available approved problems, pilot enablement, or admission. The backend rejects the unavailable assignment later. The administrator readiness helper also sets its overall ready flag from the existence of any approved problem rather than requiring all displayed topic/difficulty cells to be ready; a partially populated bank can therefore receive an overly broad readiness signal.

**Change needed:** return readiness separately for each mode/topic and display the actual blocking reason before submission. An approved topic is not necessarily an available validated exercise. Evidence: [src/lib/learning-service.ts:64](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/lib/learning-service.ts:64>); [server/services/LearningService.ts:336](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:336>).

### F05 — Medium: learners are assigned prepared questions rather than selecting an individual problem

**Manuscript:** Figure 16, Figure 22, and storyboard descriptions use “select or enter” a problem. **Code/UI:** students choose a topic and mode; the server chooses the prepared question. There is no problem-picker list.

**Change needed:** decide whether topic selection plus adaptive assignment satisfies the intended design. If it does, rewrite the interaction sequence to say “request an adaptively assigned prepared problem.” Otherwise implement a selector with rules that preserve adaptive difficulty. This is a workflow discrepancy, not necessarily a pedagogical defect. Evidence: [src/app/components/SecureTaskStart.tsx:175](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/SecureTaskStart.tsx:175>); [server/services/LearningService.ts:330](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:330>).

### F06 — High: custom problem difficulty is not measured or actually adjusted

**Code:** Basic/Intermediate/Advanced is selected by the learner and stored for custom input. The parser and solver do not infer complexity, and the session always starts with `promptAdjustment: "maintain"`. Recommendation data is not passed as a separate scaffolding policy to the tutor; the model receives the difficulty label. There is no replacement problem for free-form work.

**Change needed:** explicitly distinguish intrinsic problem difficulty, learner-selected labels, adaptive hints, and adaptive assignment. Implement a validated scaffolding policy if the manuscript promises adaptive treatment of custom work. Evidence: [src/app/components/SecureTaskStart.tsx:216](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/SecureTaskStart.tsx:216>); [server/services/LearningService.ts:358](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:358>); [server/gemini.ts:102](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/gemini.ts:102>).

### F07 — High: adaptation is narrower than the described learner model

**Manuscript:** P0252, P0307, P0700, P0719 and P0738 describe accuracy, reasoning, misconceptions, and ongoing learner modeling affecting difficulty/support. **Code:** recommendation uses up to five submitted workflow-6 scorecards, requires three sessions before changing level, uses 50/80 thresholds, and checks strong assistance. It does not directly inspect misconception category, recurrence or resolution. It runs at session preparation/submission rather than recalculating a difficulty model after every response.

**Change needed:** document this actual rule-based model and its thresholds, or implement the specified diagnosis-aware updates. Referencing knowledge-tracing literature does not demonstrate a trained or probabilistic knowledge-tracing model. Evidence: [server/gemini.ts:248](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/gemini.ts:248>); [server/services/LearningService.ts:277](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:277>).

### F08 — Medium: adaptive decisions do not have the standalone change history shown in Table 19

Recommendations are embedded in sessions/progress, and a new session can be assigned the nearest available level. The current service does not write an Adaptive_Difficulty_Records event with previous level, new level and timestamp for every adjustment. It also excludes every previously answered prepared question; once the bank is exhausted, practice stops instead of rotating indefinitely.

**Change needed:** either add explicit immutable adjustment events or redraw the schema around the actual session/progress snapshots. Explain question-exhaustion behavior and whether repeat practice will ever be allowed. Evidence: [server/services/LearningService.ts:277](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:277>); [server/services/LearningService.ts:331](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:331>).

### F09 — High: administrator-managed libraries do not control the current tutor as broadly as promised

**Manuscript:** Figure 37 says formula/theorem updates directly affect validation; Figures 13/32 describe prompt banks/module settings feeding learning. **Code:** session preparation reads an already-published problem_scoring snapshot, or generates a bounded custom reference. It does not resolve current standalone prompt-bank, misconception-category or difficulty-policy records. Gemini uses a code-defined system prompt and fixed categories. The admin content page itself warns that standalone library edits do not automatically change practice.

**Change needed:** wire approved, versioned configuration into session preparation, or accurately restrict the claim. For prepared problems, formula conditions are copied when approval publishes the scoring reference; editing the library later does not itself republish that reference. Existing sessions should remain reproducible. Evidence: [src/app/components/SecureAdmin.tsx:575](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/SecureAdmin.tsx:575>); [src/lib/admin-service.ts:77](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/lib/admin-service.ts:77>); [server/services/LearningService.ts:321](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:321>); [server/gemini.ts:9](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/gemini.ts:9>).

### F10 — Medium: configuration provenance is incomplete

New AI sessions set `configurationVersions: null`. The pinned reference and stored model/prompt/rubric versions are helpful, but the session does not expose the complete set of administered formula, prompt, misconception and difficulty-policy versions described by older repository design notes.

**Change needed:** record the actual resolved content versions and the approval/scoring snapshot identity, or remove claims that all those configurable versions are tracked. Evidence: [server/services/LearningService.ts:358](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:358>).

### F11 — High: academic-profile collection is missing from the current learner flow

**Manuscript:** Table 6 requires student number, course and year level, with section optional. **Code/live UI:** bootstrap initializes the academic profile to null. Profile shows name, email and learning statistics; there is no academic-detail form. Current student update rules do not allow changing academicProfile. The server does not require academic-profile completion before practice. One existing completed profile does not demonstrate a usable current onboarding path.

**Change needed:** provide validated academic-profile collection/editing and decide whether it gates participation. Reconcile yearLevel string in the contract with integer in the manuscript and section required by the normalizer with optional in the manuscript. Evidence: [src/lib/learning-service.ts:45](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/lib/learning-service.ts:45>); [src/app/components/student/ProfileContent.tsx:22](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/student/ProfileContent.tsx:22>); [firestore.rules:37](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/firestore.rules:37>); [src/stores/auth-store.ts:447](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/stores/auth-store.ts:447>); [packages/contracts/src/index.ts:18](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/packages/contracts/src/index.ts:18>).

### F12 — High: registration is not enough to start learning, but the manuscript omits the admission sequence

**Live:** only one account is admitted. **Code:** learning requires active account, current Gemini privacy acknowledgment, admitted roster status, open pilot/new-session state, enabled topic and enabled AI configuration. The manuscript's login-to-session flow omits these prerequisite/error branches.

**Change needed:** add consent, admission, content readiness and availability to the workflow diagrams and user instructions. Plan admission for actual study participants. The UI says verified email is required for admission, but the browser roster operation only checks an existing student role; current backend membership does not check email verification. Either enforce that requirement at the trusted admission boundary or correct the message. Evidence: [server/services/LearningService.ts:17](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:17>); [src/lib/admin-service.ts:283](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/lib/admin-service.ts:283>); [src/app/components/student/ProfileContent.tsx:197](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/student/ProfileContent.tsx:197>).

### F13 — Critical for a group evaluation: current shared AI limits cannot support 50 simultaneous trials

**Live configuration:** four requests per minute and eighteen per day, shared across users. **Code:** an ideal new session needs at least six model calls: opening, four accepted stages and scorecard. Hints, questions, corrections and retries require more. Thus the local daily cap permits at most three ideal complete new sessions per day if no other calls occur. Fifty such sessions need at least 300 calls, or 17 quota-days under that cap.

**Change needed:** verify actual provider capacity, choose an approved deployment/evaluation plan, and schedule realistic participant exposure. This is arithmetic from local limits, not a claim about Google's current published limits. Do not invite 50 respondents to evaluate six functions they cannot all meaningfully use. Evidence: [server/services/LearningService.ts:141](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:141>); [server/services/LearningService.ts:309](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:309>); manuscript P0394.

### F14 — Medium: four visible stages combine seven internal criteria

The present screen is Problem Understanding, Method Selection, Computation and Interpretation. A single accepted model response marks all internal criteria within that stage accepted. Formula justification is combined with method selection; verification is combined with computation. The manuscript alternately describes separate screens/checkpoints and a four-label progress bar.

**Change needed:** explicitly map the seven internal criteria to the four screens and explain that one response may demonstrate multiple criteria. If faculty expects independent justification and verification checkpoints, assess them independently rather than copying a stage-level acceptance. Evidence: [server/services/LearningService.ts:215](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:215>); [src/app/components/SecureSession.tsx:305](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/SecureSession.tsx:305>); [packages/contracts/src/index.ts](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/packages/contracts/src/index.ts>) (SOLVER_STAGE_PHASES).

### F15 — Medium: the specified separate formula/theorem fields are absent

The storyboard's Formula and Theorem Justification screen lists a selected-formula/theorem input, a separate justification input and approval/reject indicator. Current learning uses the shared conversation input; there is no dedicated pair of fields or standalone screen.

**Change needed:** update Figure 34 and its UI item table to the combined chat design, or implement the required screen. Formula justification as an assessed concept exists; the exact interface does not. Evidence: [src/app/components/SecureSession.tsx:324](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/SecureSession.tsx:324>); [src/app/components/MathInput.tsx:33](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/MathInput.tsx:33>).

### F16 — Medium: detected errors do not route the learner back to an earlier module

The conceptual framework (P0325) says weak justification returns the learner to the justification module and invalid logic redirects to the solver. Current rejected responses stay in the current stage; accepted earlier stages are not reopened by misconception type.

**Change needed:** define whether remediation occurs within the current conversation or by explicitly reopening a previous gate. Update the diagram, or implement dependency-aware backward routing. Evidence: [server/services/LearningService.ts:194](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:194>); [server/gemini.ts:35](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/gemini.ts:35>).

### F17 — High: repeated help requests can unlock stronger hints without successful reasoning

**Manuscript:** P0263, P0311, P0735–P0737 and functional requirement P0919 tie progressive release to reasoning checkpoints/corrective cycles. **Code:** stronger support becomes available after repeated help requests alone: targeted after one, stronger after two, partial step after three. No accepted response is needed for that escalation. Final full-solution release still requires all stages.

**Change needed:** choose and document the intended pedagogical rule. If stronger help must require actual reasoning evidence, enforce that condition. If help-on-demand is intentional, qualify the manuscript so only final solution disclosure is mastery-gated. Evidence: [server/gemini.ts:189](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/gemini.ts:189>); [server/services/LearningService.ts:237](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:237>).

### F18 — High: answer-leak prevention is not comprehensive

The backend combines model self-reporting with a narrow text check. **Local probe:** a tutor response “You should obtain 8.” with a protected answer of 8 and `leaksSolution: false` is not detected. Short answers, reformulations, mathematical equivalence, and full proof disclosure cannot be comprehensively blocked by the current phrases. The guard also bypasses its text test when a submitted response matches the final answer.

**Change needed:** add adversarial and paraphrase coverage, stage-aware output validation, and safer controlled support content. Preserve the qualified claim that the system is designed to prevent early disclosure; do not claim guaranteed prevention based on the current checker. The probe does not assert Gemini actually emitted this response in a real session. Evidence: [server/gemini.ts:181](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/gemini.ts:181>).

### F19 — High: LaTeX entry is supported visually but not fully verified by the active math checker

**Manuscript:** Scope explicitly promises fractions, exponents, radicals, subscripts, inequalities and logic notation. The MathLive keyboard and KaTeX preview provide these. **Probe:** numeric `1/2` is verified; `\frac{1}{2}` and `\sqrt{4}` return unsupported. Prose such as “The answer is 0.5” also returns unsupported for a numeric specification. The checker prefers nonempty LaTeX over plain text, and symbolic equivalence is limited.

**Change needed:** normalize the actual MathLive output into a trusted supported math representation before checking, or make AI-only verification limits explicit. The presence of the older compute-engine/math helpers does not mean the current server uses them. Evidence: [src/app/components/MathInput.tsx:17](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/MathInput.tsx:17>); [server/gemini.ts:209](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/gemini.ts:209>); [server/gemini.ts:224](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/gemini.ts:224>).

### F20 — High: unsupported deterministic checks can still lead to accepted reasoning and a released explanation

Current computation acceptance requires that the math result is not “incorrect”; “unsupported” can pass on the model's high-confidence judgment. The solution check likewise rejects only a determinate incorrect answer. Replacing the final displayed answer with the reference answer does not prove that the model's steps, justification, verification and interpretation are correct.

**Change needed:** distinguish deterministic verification from AI assessment in claims and UI; use validated worked explanations or stronger checks for supported prepared problems. For proof/equivalence cases, obtain faculty-reviewed acceptance examples and limitations. Evidence: [server/services/LearningService.ts:197](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:197>); [server/services/LearningService.ts:263](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:263>).

### F21 — Medium: the scorecard is not updated after each unlock

Figure 35 logic (P0740) explicitly says the Critical Thinking Scorecard updates after every unlock event. Current workflow creates it once, after all stages, when the learner selects View step-by-step solution. Support history records assistance but does not recalculate a visible scorecard.

**Change needed:** implement provisional per-unlock feedback or change the manuscript to end-of-session scoring. Separate final scores from provisional feedback so a hint is not mistaken for a grade. Evidence: [server/services/LearningService.ts:249](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:249>); [src/app/components/SecureSession.tsx:339](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/SecureSession.tsx:339>).

### F22 — Medium: the final draft/reflection screen in the manuscript is no longer the current flow

The Figure 36 screenshot shows a Draft Answer Stage with final answer, methodology and reflection prompts plus a Logic Map. The present learner flow assesses saved conversation and reveals solution/scorecard directly after four stages. Draft structures remain in contracts/history, but the current completion UI does not require that separate draft/reflection submission.

**Change needed:** replace the screenshot and its description, or restore an explicit reflection requirement if that is part of the faculty-approved rubric. Do not interpret an unused draft field as a functioning current requirement. Evidence: [src/app/components/SecureSession.tsx:222](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/SecureSession.tsx:222>); [src/app/components/SecureSession.tsx:339](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/SecureSession.tsx:339>); [server/services/LearningService.ts:181](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:181>).

### F23 — High: rubric calibration is still pending

The current model scores accuracy, logical validity, method selection and explanation quality, each 0–25, with evidence references and advice. Every new scorecard is marked `calibrationStatus: "pending"`; no current calibration operation was found. Model confidence is a categorical self-assessment, not a measured reliability estimate.

**Change needed:** have faculty validate rubric anchors and a representative scored response set, including alternative valid methods, wrong-but-well-explained answers, corrected work, and assisted responses. Until then describe scores as uncalibrated formative indicators, not validated critical-thinking measurements or official grades. The code already includes a useful formative disclaimer. Evidence: [server/gemini.ts:16](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/gemini.ts:16>); [server/gemini.ts:90](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/gemini.ts:90>); [server/services/LearningService.ts:268](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:268>).

### F24 — Medium: scorecard criteria are inconsistent across the manuscript

The conceptual framework uses Accuracy, Logical Validity, Method Selection and Explanation Quality, matching the current code. The Figure 36 item table instead lists Accuracy, Logic Structure, Justification Quality and Reasoning Consistency. Table 18 uses accuracy, reasoning, justification and reflection. Figure 39 uses another combination, including interpretation.

**Change needed:** choose one four-dimension rubric and use the same names, weights, evidence definitions, and scale everywhere. Explain where justification, reflection and interpretation contribute rather than using those terms interchangeably. Evidence: [src/lib/scorecard-presentation.ts:10](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/lib/scorecard-presentation.ts:10>); manuscript P0315, P0754, P0870 and associated tables/ERD.

### F25 — High, confirmed browser defect: completed-session review can crash

Opening an existing completed Quantitative Methods / Probability session from History displayed **Unexpected Application Error — Cannot read properties of undefined (reading 'accuracy')**. The review passes a legacy scorecard directly into the modern presenter, which assumes `scorecard.criteria` exists.

**Change needed:** normalize legacy scorecards or use a separate legacy renderer; never invent missing criterion scores. Add a real legacy-shaped fixture and a learner-friendly route error state. This directly breaks Figure 25 and Table 24 learning-history/scorecard access. Evidence: [src/app/components/SecureStudent.tsx:194](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/SecureStudent.tsx:194>); [src/lib/scorecard-presentation.ts:18](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/lib/scorecard-presentation.ts:18>). The existing passing review tests do not cover this actual stored shape.

### F26 — High, confirmed browser mismatch: dashboard and profile disagree

For the same signed-in learner, Dashboard showed **4 completed sessions, 86/100 formative average, latest scorecard 92/100**; Profile showed **0 completed sessions, 0% average**, and unearned achievements. Dashboard derives totals from historical session statuses, while Profile reads canonical learning_progress/legacy user stats. The mismatch remained visible after the profile had loaded.

**Change needed:** define and use a consistent aggregation/legacy-compatibility policy across dashboard, profile, achievements, admin views and reports. Clearly label legacy and current-workflow evidence. Reconcile genuine historical records carefully rather than fabricating new submissions. Evidence: [src/lib/learning/dashboard-progress.ts:17](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/lib/learning/dashboard-progress.ts:17>); [src/app/components/student/ProfileContent.tsx:43](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/student/ProfileContent.tsx:43>); [src/lib/learning/session-state.ts:40](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/lib/learning/session-state.ts:40>).

### F27 — High: current performance reports omit the existing completed/submitted population

Report kinds other than activity/usage require `statsCommittedAt`. **Live:** none of the 43 records contains that marker, although six have completed/submitted status. Thus current progress/scorecard/misconception reports have no eligible population under this rule; dashboard counts can still be nonzero.

**Change needed:** explicitly classify legacy records and decide which can be reported with known provenance. Display excluded-record counts and reasons. Do not merely mark old records committed without establishing their genuine completion/scoring history. Evidence: [src/lib/admin-service.ts:119](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/lib/admin-service.ts:119>); [src/lib/learning/dashboard-progress.ts:18](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/lib/learning/dashboard-progress.ts:18>).

### F28 — High: even new AI sessions are not included in the existing practice-average report

The learning-progress report only accumulates averagePracticeScore for `spark-practice-v1`, while current sessions use `ai-formative-v1`. Its averageCTScore only includes calibrated sessions, but current AI scorecards are always pending. Consequently a future valid AI submission can increase completed counts while both average fields remain empty.

**Change needed:** add a clearly labeled uncalibrated AI-formative aggregate, keep calibrated results separate, and test it against the current rubric. Do not call uncalibrated results calibrated to fill the report. Evidence: [src/lib/learning/reporting.ts:12](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/lib/learning/reporting.ts:12>); [server/gemini.ts:8](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/gemini.ts:8>); [server/services/LearningService.ts:268](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:268>).

### F29 — Medium: the detailed progress fields in Table 20 are not all maintained

The current progress writer tracks sessions, score totals, averages, streak, achievements, subject summaries and topic recommendations. It does not maintain the manuscript's per-topic `correct_answers` and `accuracy_rate` fields or an equivalent first-attempt correctness summary. A four-criterion score average is not a mathematical answer-accuracy rate.

**Change needed:** implement the promised metrics with explicit denominators and rules for correction/assistance, or revise the dictionary and analytics descriptions. Evidence: [src/lib/learning/session-state.ts:40](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/lib/learning/session-state.ts:40>); manuscript Table 20.

### F30 — Medium: misconception tracking is a summary, not a full resolution history

Current responses record a category and resolution status, and diagnosisSummary accumulates unique categories. Later success does not update every prior open diagnosis to resolved; the admin misconception report counts affected sessions, not occurrences, severity trends, or correction success. Current severity also follows a simple accepted/minor versus unaccepted/moderate assignment rather than managed category severity.

**Change needed:** define occurrence and resolution events if recurring misconceptions/correction rates are research outputs. Otherwise describe the report accurately as session-level category incidence. Evidence: [server/services/LearningService.ts:210](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:210>); [src/lib/learning/reporting.ts:29](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/lib/learning/reporting.ts:29>).

### F31 — High: in-app user deletion is not implemented

**Manuscript:** Figure 24, P0570–P0574, P0913 and Table 24 explicitly include deleting accounts. **Code:** adminDeleteUser always throws instructions to use Firebase Console. In-app status updates exist, but are not account deletion. Auth deletion and deletion/anonymization of linked Firestore history are separate operations.

**Change needed:** implement a trusted, appropriately controlled deletion process with linked-record handling, or explicitly designate deletion as an operator procedure outside the app. Evidence: [src/lib/admin-service.ts:149](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/lib/admin-service.ts:149>); [src/app/components/SecureAdmin.tsx:488](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/SecureAdmin.tsx:488>).

### F32 — Medium: content deletion is intentionally more restricted than the manuscript states

Only unused draft/rejected content can be deleted. Approved or referenced content is archived; dependency scans inspect managed and private records. This is reasonable for preserving academic history, but the manuscript presents unrestricted delete/edit operations.

**Change needed:** document the actual draft → pending validation → approved/rejected → archived workflow and archive-vs-delete rules. Do not weaken history protection simply to match a simplified diagram. Evidence: [src/lib/admin-service.ts:165](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/lib/admin-service.ts:165>); [src/lib/admin-service.ts:188](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/lib/admin-service.ts:188>).

### F33 — Medium: issue and user-feedback management is absent

P0444 assigns administrators system issues and user feedback. Session review comments and logs exist, but no dedicated learner issue submission, ticket queue, issue status, assignment or resolution workflow was found in current routes/components.

**Change needed:** implement the agreed feedback workflow or narrow the manuscript to the session-review comments actually provided. An external questionnaire is a different function. Evidence: [src/app/routes.tsx](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/routes.tsx>); [src/app/components/SecureAdmin.tsx](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/SecureAdmin.tsx>).

### F34 — Medium: backup, restore and retention are operator responsibilities, not app features

The maintenance screen links to Firebase and explicitly says it does not perform or verify account deletion, backup/restore, security configuration or retention cleanup. No evidence of a verified backup/restore run was obtained. This only partially supports Figure 16's maintenance responsibilities.

**Change needed:** identify which responsibilities are external, provide the operator runbook and actual execution evidence, and avoid claiming the admin app performs them. Evidence: [src/app/components/SecureAdmin.tsx:1145](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/SecureAdmin.tsx:1145>).

### F35 — High: current AI interaction logging does not match Table 14

The manuscript specifies every AI interaction's prompt, response, type and response time. Current tutor messages store visible content/model/prompt version; operational timings/errors go to server console. The active service does not persist a complete per-call AI interaction record or write current AI failures into ai_failure_logs. One historical private_ai record is not current-workflow coverage.

**Change needed:** define a privacy-conscious per-call record with request correlation, mode, model/version, latency, outcome and retained inputs/outputs where justified. Connect the admin viewer to current records. Evidence: [server/gemini.ts:155](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/gemini.ts:155>); [app/api/learning/route.ts:64](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/app/api/learning/route.ts:64>); [server/services/LearningService.ts:244](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:244>).

### F36 — Medium: “all administrative actions are logged” is broader than the actual guarantee

App mutation paths append audit records, which is useful. Reads and external Firebase Console actions are not covered by this application audit. Admin content writes occur through the client SDK, and the local rules allow authorized admin writes without requiring a matching audit record or all client validation conditions. Application logging is not an independently enforced all-actions audit.

**Change needed:** scope the manuscript claim to audited application mutations, or enforce critical content/validation/audit operations through a trusted boundary and supplement with infrastructure audit evidence. Do not claim deployed-rule behavior was independently tested in this audit. Evidence: [src/lib/admin-service.ts:19](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/lib/admin-service.ts:19>); [firestore.rules:66](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/firestore.rules:66>); [src/app/components/SecureAdmin.tsx:1120](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/SecureAdmin.tsx:1120>).

### F37 — Medium: automated scorecard/reminder notifications are not produced by the current service

Table 21 mentions reminders and scorecard availability. The notification store recognizes those event types, but current learning code creates achievement notifications; administrator code creates review/announcement notifications. No current scorecard-ready or inactivity-reminder producer was found. Inactivity expiration is checked on access, not by a scheduler.

**Change needed:** add event production and a defined reminder schedule if required, or list only the implemented notification types. A display handler alone does not establish delivery. Evidence: [src/stores/notification-store.ts:320](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/stores/notification-store.ts:320>); [server/services/LearningService.ts:282](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:282>); [src/lib/learning/lifecycle.ts:13](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/lib/learning/lifecycle.ts:13>).

### F38 — Medium: returned-session follow-up always requests a prepared problem

The frontend offers one linked follow-up for returned work. The backend forces curated mode, including when the original problem was custom. With zero prepared problems in the real project this path cannot provide a new problem. A follow-up is also a new task rather than reopening the returned attempt.

**Change needed:** define the intended correction/follow-up workflow, support an appropriate validated problem for custom-origin work, and explain what is preserved. Evidence: [server/services/LearningService.ts:104](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:104>); [src/app/components/SecureStudent.tsx:189](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/SecureStudent.tsx:189>).

### F39 — High: real data does not yet demonstrate a complete current-workflow submission

There are four workflow-6 records but no statsCommittedAt marker anywhere. Unit tests exercise mocked end-to-end logic; they do not establish that the current real Gemini path has completed scoring and submission successfully in the current setup.

**Change needed:** after configuring genuine content, capture an authorized real learner run through all stages, scorecard, submission, progress, review and reports. Record failures as failures; do not synthesize an academic session or approval. This audit deliberately did not create such records.

### F40 — High: stale system copy contradicts the AI implementation

- The consent screen says “Practice feedback is calculated in your browser,” while current tutoring and scoring call the Next.js backend and Gemini.
- The admin logs screen says the current practice engine does not call live AI. That is now false for workflow 6.
- Earlier ADMIN_MANUSCRIPT_CHECKLIST.md says browser-only/no live AI; CAPSTONE_MANUSCRIPT_AMENDMENTS.md describes a different deterministic scoring/version-resolved architecture. Neither should be copied into the manuscript unchanged.

**Change needed:** align notices, admin explanatory text and architecture documentation with the actual runtime. Evidence: [src/app/components/SecureTaskStart.tsx:156](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/SecureTaskStart.tsx:156>); [src/app/components/SecureAdmin.tsx:1120](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/SecureAdmin.tsx:1120>); [src/lib/secure-api.ts:194](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/lib/secure-api.ts:194>); [server/services/LearningService.ts:186](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts:186>).

### F41 — Medium: live privacy wording and operational retention need reconciliation

The active notice says Cloudflare processes requests; the current local route is Next.js → Gemini/Firebase, and Cloudflare deployment involvement was not verified. The notice promises 90-day raw-log retention and anonymization after study closure plus 12 months, while settings are manual policy metadata and studyClosedAt is null. The application does not itself perform that cleanup.

**Change needed:** name actual processors/deployment roles and identify who executes retention, when and with what evidence. Keep survey anonymity separate from identifiable platform accounts and pseudonymized exports. This is a consistency finding, not a legal compliance determination. Evidence: live policy_documents/current notice; [src/app/components/AdminPrivacySettings.tsx:6](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/AdminPrivacySettings.tsx:6>).

### F42 — Medium: application technology and dataflow differ from the manuscript

P0899, Figure 43 and Table 22 say Vite builds the app. Actual dev/build commands use Next.js with webpack. React, TypeScript, Tailwind, Firebase Auth, Firestore and Gemini still match. Vite remains a testing/dependency tool, not the current production application bundler.

The network narrative also says all application requests pass through the centralized server, but profile/catalog/admin operations use the browser Firebase SDK while AI learning mutations use `/api/learning`. **Change needed:** redraw the actual hybrid architecture, including browser→Firebase Auth/Firestore, browser→Next API, and API→Firestore/Gemini. Evidence: [package.json:10](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/package.json:10>); [src/lib/secure-api.ts:194](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/lib/secure-api.ts:194>); [server/firebase.ts:7](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/firebase.ts:7>).

### F43 — Medium: the automated suite is not currently green

The audit run produced **312 passed, 2 failed; 37 passing files, 2 failing files**. Failure 1: the student-history test mock lacks `onSnapshot`, now used by the component. Failure 2: a notification test expects navigation to wait for mark-as-read, but the current implementation navigates first. These failures are not proof that both corresponding production flows are broken; one is a stale mock and the other needs an intended-behavior decision.

**Change needed:** update the tests to the agreed behavior and add coverage for the actual legacy-scorecard crash and consistent statistics. Do not quote older all-passing audit totals as current evidence. Evidence: [tests/component/student-history-review.test.tsx](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/tests/component/student-history-review.test.tsx>); [tests/component/student-supporting-features.test.tsx:340](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/tests/component/student-supporting-features.test.tsx:340>); [src/app/components/SecureStudent.tsx:38](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/SecureStudent.tsx:38>).

### F44 — Medium: bounded AI context and latency need to be described and tested

The tutor gets only the latest 12 conversation messages for normal turns, each capped at 4,000 characters. Score mode includes additional learner evidence; the request is rejected when its combined character-budget check exceeds 32,000. Provider timeout is 45 seconds, with one retry for certain 503 responses; the route budget is 120 seconds. These limits can affect long proofs, repeated remediation and student experience.

**Change needed:** include supported session limits and recovery behavior in limitations; test real response-time and completion distributions before claiming efficient simultaneous access. No latency benchmark or 50-user load test was performed in this audit. Evidence: [server/gemini.ts:117](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/gemini.ts:117>); [server/gemini.ts:137](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/gemini.ts:137>); [server/gemini.ts:160](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/gemini.ts:160>); [app/api/learning/route.ts:11](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/app/api/learning/route.ts:11>).

### F45 — Low: small interface promises and labels need synchronization

Current navigation uses New session and History rather than Previous Sessions/Enter Session terminology in screenshots. The manuscript's subject interface lists a progress bar; the current card presents completed count, average and recommended level. Figure 37's optional Database Sync Indicator was not found as a dedicated current control. Profile displays a score total as a percentage, while other pages use /100. The production build also warns that metadataBase is unset and social-image links default to localhost:3000; set the real deployed origin before public sharing. These are small, but they should not conflict during a panel walkthrough.

**Change needed:** refresh screenshots and UI item tables after fixing the major defects. Prefer consistent learner-facing names and explain the metric rather than prescribing prototype pixel/string sizes. Evidence: [src/app/components/StudentShell.tsx](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/StudentShell.tsx>); [src/app/components/SecureTaskStart.tsx:183](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/SecureTaskStart.tsx:183>); [src/app/components/student/ProfileContent.tsx](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/src/app/components/student/ProfileContent.tsx>).

## Database and data-dictionary reconciliation

The supplied diagram is not merely a Firestore diagram drawn as boxes. Figure 38 explicitly uses integer primary keys, VARCHAR/DATETIME/ENUM and a password column; Figure 39 includes password_hash. Those are inconsistent with the Firebase Auth + Firestore implementation and even with the manuscript's later Firestore-style dictionary. **Do not add stored passwords to Firestore to match the diagram.**

| Manuscript concept | Actual implementation / required correction |
|---|---|
| Users | `users/{uid}`; Firebase Auth manages credentials; displayName instead of separate first_name/last_name; actual lowercase role/status values |
| Student_Profile | Embedded academicProfile intended in users; no current learner collection/edit flow; yearLevel string, section requirement discrepancy |
| Subjects / Topics | `subjects`, `topics`; actual names use name/subjectId; approval/status/version fields matter |
| Problems | `problems`; answer material separated into `problems/{id}/private/solution` and `problem_scoring/{id}`; do not put unreleased answers in learner-readable documents |
| Formulas_Theorems | `formula_theorem_references`; approval-time copying rather than live automatic substitution |
| Solving_Sessions | `sessions/{id}`; request-based string ID, studentId, originalQuestion, topicId, workflowVersion, revision, timestamps and terminal statuses |
| Problem linkage | Free-form sessions have problemId null; originalQuestion and protected generated reference replace mandatory bank linkage |
| Session_Steps | Internal gateStates/gateEvaluations plus `sessions/{id}/messages`; four learner stages map to seven criteria |
| Student_Responses | `sessions/{id}/responses/{requestId}` with structured response/evaluation/diagnosis; no universal standalone step FK |
| AI_Interaction_Logs | Partial equivalent in messages and console telemetry; complete current per-call record missing |
| Socratic_Prompt_Bank | `socratic_prompt_bank`; managed problem/phase records are not automatically consumed by current Gemini context |
| Misconception_Categories | Managed collection exists in code; runtime categories are code enums |
| Error_Diagnosis_Logs | Diagnoses embedded in response documents, lastDiagnosis and diagnosisSummary; categorical confidence rather than numeric confidence_score |
| Critical_Thinking_Scorecard | Embedded scorecard and `sessions/{id}/scorecards/{requestId}`; four actual criteria, rubric, calibration, assistance/evidence fields; not always `/final` as old docs claim |
| Adaptive_Difficulty_Records | Embedded recommendations and `learning_progress`; standalone every-adjustment log missing |
| Learning_Progress | `learning_progress/{uid}` and `assignment_state/{topicId}`; subject summaries/topic recommendations; no promised correct_answers/accuracy_rate aggregate |
| Notifications | `notifications/{id}` with recipientId, eventType, actionUrl, read and timestamp; producers differ by event type |
| Additional actual structures | Consent/policy, pilot/roster, validation/audit records, private session reference, AI operation recovery, per-user locks and shared usage quotas |

**Also reconcile:** Basic/Intermediate/Advanced versus Easy/Medium/Hard; current session statuses versus only In Progress/Completed; Firestore timestamps versus SQL DATETIME; reference IDs stored as strings versus Firestore DocumentReference claims; optional/required fields; missing data types for student number/course in Table 6. Document both read permissions and write ownership, not only relationships. Source: [firestore.rules](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/firestore.rules>); [server/services/LearningService.ts](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/server/services/LearningService.ts>); [packages/contracts/src/index.ts](<C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform/packages/contracts/src/index.ts>).

## Research and manuscript findings

### R01 — High: the supplied questionnaire measures expected usefulness, not completed-system acceptability

Specific Objective 4 and Chapter III promise post-development acceptability evaluation. Appendix C has Profile, Current Process, Problems Encountered and Proposed Features sections. Section D predominantly asks what a feature “would” do. That is suitable for needs assessment or expected usefulness, but it is not a direct post-use measure of the working system's usability, reliability or actual function.

**Change needed:** retain the needs-assessment instrument and add a clearly separate post-use instrument and procedure, with items about features participants actually tried. Cover usability, functionality, relevance and perceived usefulness, then map each item group to the research objective and statistical treatment. Do not treat anticipated benefit as observed system acceptability.

### R02 — High: the planned study must expose participants to the functions they rate

The manuscript proposes approximately 50 purposively selected students, with final count depending on approval/availability. Current roster, empty bank, narrow custom grammar and request caps do not provide a usable 50-participant evaluation plan. Claims about proof/theorem support or adaptive succeeding problems cannot be assessed fairly if respondents only try numeric mean/counting inputs.

**Change needed:** prepare an adviser-approved task protocol with actual supported tasks, genuine content validation, access/admission, achievable quotas, completion/error records, and instructions for handling unsupported features. An external Google Form is allowed by the manuscript; no in-app survey feature is required.

### R03 — Medium: acceptability, formative score and critical-thinking improvement must remain separate

The scope correctly excludes longitudinal/experimental claims of permanent improvement. Some rationale/framework language and the title could nevertheless be read as promising measured enhancement. A high AI score or favorable Likert response does not, by itself, establish causal improvement or psychometric validity.

**Change needed:** consistently say “intended to support” and report acceptability/perceived usefulness within the stated design. Treat rubric calibration as a separate academic validation task. No survey results, faculty documents, ethics clearance or experimental outcomes were fabricated or verified in this audit.

### R04 — Medium: distinguish anonymity of the survey from identity in the learning system

Appendix C promises anonymous survey responses. The app stores accounts and identifiable session ownership, while reports can optionally include identity. That is not inherently inconsistent if they are separate datasets, but the manuscript should explain the boundary and any linkage.

**Change needed:** specify which data are anonymous, confidential, identifiable or pseudonymized; identify who can access each; describe external AI processing using the actual notice. Verify the external form's real settings separately. This audit did not inspect or alter the existing Google Form.

### M01 — High: replace Figures 38–39 and reconcile them with Tables 5–21

Use the actual Firestore/Auth design above. Correct the SQL IDs/password fields, relation cardinalities, free-form null problem linkage, duplicated/split response concepts and mismatched score criteria. Figure 39's Student_Profile also omits some academic details described in Table 6. The two diagrams should represent one design, not different schema generations.

### M02 — Medium: replace Figure 43 and Table 22's Vite production-stack claim

Show Next.js and the actual server layer. Preserve matching React/TypeScript/Tailwind/Firebase/Gemini components. Redraw the network model to include direct browser Firebase calls. Naming Vite as a development dependency is different from calling it the deployed build framework.

### M03 — Medium: update the complete storyboard, not only screenshots

Refresh Figures 28–37, captions, logic and UI-item tables after the functional corrections. Current branding is different; selection now has prepared/custom modes, privacy/admission prerequisites, automatic prepared assignment, a MathLive editor, four combined stages and a different completion flow. Figure 36 currently shows a draft-answer screenshot even though its caption/description is Critical Thinking Scorecard.

### M04 — Medium: make the 2026 project schedule and 2026–2032 roadmap coherent

The cover is December 2026 and the Gantt targets 2026 completion; the roadmap narrative places core module refinement/deployment years later. It can be a future expansion roadmap, but distinguish capstone deliverables from speculative expansion. The roadmap image and prose also shift milestones: image 2027 shows Beta Testing/User Feedback, while prose assigns beta to 2028; image 2028 has AI refinement, prose 2029; image 2029 has full-scale development, prose 2030. The image adds a 2032 sustainability/reach milestone not described consistently in the prose.

### M05 — Low: correct Gantt dates, missing entries and numbering

The Gantt image includes Development-related dates in July, and Testing labels such as 10/07/26, 10/14/26 and 10/21/26 while their colored bars appear in August/September columns. Several later rows have no start/end dates or assignees. Project End Date is a placeholder (`--/12/2026`), task number 4.1 is repeated, and the Gantt's floating caption calls it Table 4, already used for Scoring Interpretation.

**Change needed:** reconcile dates with bars, fill only known dates/responsibilities, and regenerate numbering.

### M06 — Low: regenerate List of Tables and List of Figures

The List of Tables calls Table 19 Learning Progress and Table 20 Notifications, while the body uses Table 19 Adaptive Difficulty Records, Table 20 Learning Progress and Table 21 Notifications. It labels the module list 21 while the body says 24. The List of Figures contains **329** for Process Registration rather than 29. Rebuild Word caption/index fields after edits and verify page references in the final rendered document.

### M07 — Low: correct copy/paste errors in use-case steps and terms

Manage Accounts step 6.1 says it synchronizes updated topics, which belongs to content management. Login steps say username while the UI uses email. The account-creation table repeats “Accepts the registration information.” The module list says Critical Thinking Scoreboard once instead of Scorecard. P0307 says “guest correct answer,” apparently meaning “guessed correct answer.” P0672 ends “based on the selected” without completing the thought. P0795 contains a stray backslash. Fix these along with broken phrases such as Progressive, Solution, Unlock System and Approval/Reje ct.

### M08 — Medium: clarify role permissions in diagrams and use-case descriptions

Figure 25's generic step table describes retrieval of all students' aggregated data under a User actor, while the prose correctly limits students to their own records. Figure 16 includes Justify Formula and Theorem in the administrator branch even though the current admin UI manages/reviews rather than participates in student tutoring. Clarify own-progress versus cohort-progress permissions and admin validation versus learner justification. Do not add a teacher account role solely because teachers are indirect beneficiaries; the manuscript's primary roles are Student and System Administrator.

### M09 — Low: separate development hardware from learner-device requirements

Table 23 lists 8 GB RAM and 256 GB available storage as minimums while the network model explicitly includes smartphones. The table's introduction mixes hardware used to create the application with requirements for running the website.

**Change needed:** label the development workstation specification separately from tested browser/device requirements. No minimum supported mobile specification has been established by this audit.

### M10 — Medium: use consistent proposal/completion tense and evidence status

The file is named Final but the title page says A Proposal Project, many sections use future tense, and acknowledgments refer to participants/findings as already completed. Chapter III's introduction says ethics were evaluated by the committee, while Ethical Considerations says approval will be sought if required. These need to reflect the actual submission stage and actual evidence; do not infer completion from file naming or insert fictional approvals/results.

### M11 — Low: distinguish the survey scale from the learner scorecard scale

The five-point agreement/acceptability scales measure questionnaire responses. The learner scorecard totals four 25-point criteria. Keep both, but name their purpose wherever “score,” “scoring procedure,” or “evaluation” is used. Do not average learner CT totals into the survey weighted mean.

### M12 — Medium: bound comparative and coverage claims to the evidence

The comparative matrix marks all six MINDGUIDE modules present. Label whether that means proposed design, repository implementation, configured working feature or evaluated capability. Define what an x means for comparison systems; absence of the exact MINDGUIDE module name is not proof that a product lacks all related hints/diagnostics. External publications and product comparisons were not independently fact-checked in this system-alignment audit.

## Features that do align and should be retained

- Two primary application roles and role-protected student/admin route groups.
- Email/password and Google authentication UI, sign-out, password recovery, name editing and settings.
- Text/LaTeX response entry and math preview; no image/handwriting/OCR learner-input workflow, matching the explicit exclusion.
- Actual Gemini integration through a server API, not only a simulated chat interface.
- Socratic instructions, correction feedback and full-solution gating in the current service.
- Four-part evidence-linked formative feedback, strengths/weaknesses and improvement advice.
- Student history, dashboard and achievement structures, subject to the defects identified above.
- Administrator content editors, genuine evidence-recording workflow, status management, learner review/commenting, announcements, CSV export and browser Print/Save as PDF.
- Protected answer/reference storage in the local rule design, operation recovery, request locking and request caps.

These are implementation findings, not blanket claims that every live path or security property passed acceptance testing. Scope exclusions such as OCR, teacher accounts, general graph-image recognition, offline operation, and longitudinal improvement experiments should not be added as “missing features.”

## Recommended order of work

1. Agree the real approved content matrix and evaluation scope with the adviser/faculty; configure the genuine subjects, topics and validated bank in the existing Firebase project.
2. Fix the confirmed legacy-review crash and inconsistent statistics/report population. Establish how historical records are preserved and labeled.
3. Decide the exact custom-input scope, four-stage/seven-criterion design, hint escalation rule, rubric dimensions, and adaptation model. Make code and manuscript agree on each decision.
4. Connect the promised administered configuration, implement academic profiles, and resolve account-deletion/feedback/notification responsibilities.
5. Strengthen notation checking, leakage tests, scoring/solution verification and current AI audit evidence. Obtain actual faculty calibration evidence.
6. Prepare participant admission and realistic service capacity; execute genuine current-workflow acceptance cases and record results.
7. Add the actual post-use acceptability instrument, then refresh manuscript figures, dictionary, screenshots, schedule and terminology around the agreed implementation.

Do not solve these gaps by seeding fabricated examples, fabricating faculty evidence, silently altering historical scores, or claiming unsupported features in the manuscript.

## Verification record and remaining limits

| Check | Result |
|---|---|
| TypeScript | Passed |
| ESLint | Passed |
| Unit/component suite | 312 passed, 2 failed; 39 files total |
| Local browser: existing student session | Dashboard, task selection, profile and history inspected; legacy review crash reproduced |
| Existing Firebase read-only inspection | Completed; configuration and aggregate counts reported above |
| Math-format probes | Plain arithmetic verified; tested LaTeX/prose formats unsupported |
| Answer-leak probe | Tested paraphrase not detected |
| Production build | Passed; one metadataBase warning defaults social-image URL resolution to localhost:3000 |
| Live AI session and admin mutation acceptance | Not performed; no new learning records or admin mutations created |
| Deployed rules, remote deployment, backup/restore, faculty evidence and 50-user load | Not independently verified |

This audit records the discrepancies found in the supplied manuscript and inspected system. It cannot certify that every possible defect has been found. The central conclusion is supported by direct configuration and browser evidence: the current environment is a limited testing setup, not yet the fully configured two-subject research platform described in the manuscript.
