# MINDGUIDE System Fix and Development Plan

**Capstone-Aligned Remediation Roadmap for the Socratic AI Learning Platform**

- Capstone: MINDGUIDE: A Socratic AI-Based Learning Platform for Enhancing Critical Thinking in Quantitative Methods and Discrete Mathematics
- Repository: https://github.com/OjayAca/Socraticailearningplatform
- Baseline branch: `main`
- Document date: July 16, 2026

## 1. Document Purpose and Control

This plan converts the approved MINDGUIDE research design into a prioritized software remediation roadmap. It defines the technical fixes, module requirements, security controls, data architecture, administrator functions, testing criteria, and release conditions required before the platform is used for system acceptability evaluation.

## 2. Capstone Alignment Basis

- MINDGUIDE must guide reasoning before revealing a complete solution.
- The official learning domains are selected, validated topics in Quantitative Methods and Discrete Mathematics.
- The six required modules must operate as one connected workflow rather than as isolated interface labels.
- A learner response must pass the required reasoning gate before the next instructional stage or solution level is released.
- AI output is instructional support. It must not be treated as an unquestionable mathematical authority.
- Unsupported problems, topics, answer formats, and image-based inputs must be rejected with a clear explanation.
- The study evaluates system acceptability and perceived usefulness. The software and documentation must not claim permanent critical-thinking improvement.
- Student-visible data must exclude answer keys, scoring rubrics, hidden solution steps, private prompt templates, and administrative controls.

### Required learner reasoning sequence

```text
1. Understand the problem
2. Identify relevant information and variables
3. Select an appropriate method
4. Justify the formula, theorem, or concept
5. Perform guided computation or proof reasoning
6. Verify the work and correct errors
7. Interpret the result in context
8. Receive controlled hints, partial steps, or full explanation
9. Review the Critical Thinking Scorecard
```

## 3. Current-State Priority Summary

| Priority | Current issue | Capstone impact | Required direction |
|---|---|---|---|
| P0 | Progressive unlocking is attempt-based instead of acceptance-based | Directly conflicts with the required reasoning gates | Replace with server-validated gate results |
| P0 | AI key, scoring logic, and hidden instructional data are exposed to the client | Students can bypass the learning controls | Move authoritative logic and answer data to trusted server functions |
| P0 | Students can write authoritative session and score fields | Scores, phases, diagnoses, and unlocks can be manipulated | Restrict client writes and use server-only updates |
| P1 | Administrator functions are incomplete | Capstone functional decomposition is not implemented | Build account, content, prompt, report, activity, and settings modules |
| P1 | Socratic phase sequence omits explicit checking and interpretation stages | The implemented flow does not match the defined solver process | Adopt a nine-stage workflow with diagnosis running after each response |
| P1 | Critical Thinking Scorecard logic is too shallow | Text length and lexical similarity do not establish reasoning quality | Use criterion evidence, mathematical checks, rubric rules, and AI confidence |
| P1 | LaTeX-based mathematical keyboard is missing | Current capstone scope requires structured mathematical input | Add math input, preview, normalization, and accessible controls |
| P1 | Database structure does not match the documented data design | Administrator content and audit data cannot be managed correctly | Create approved Firestore collections and align the data dictionary |
| P2 | Teacher terminology and template residue remain | Role naming and repository documentation are inconsistent | Rename to System Administrator and clean package/README content |
| P2 | Privacy, consent, retention, and AI disclosure are incomplete | Ethical commitments are not operationalized | Add consent, privacy notices, retention rules, anonymization, and export controls |

## 4. Capstone-to-System Traceability Matrix

| Requirement | Status | Current evidence | Required completion |
|---|---|---|---|
| Step-by-Step Socratic Solver | Partial | Questions and phases exist | Add explicit relevant-information, verification, and interpretation stages; enforce phase order |
| Formula and Theorem Justification | Partial | A justification stage exists | Validate formula or theorem conditions against a managed reference collection |
| Error Diagnosis and Misconception Detector | Partial | Several error labels exist | Expand taxonomy and store evidence, confidence, severity, target phase, and corrective prompt |
| Adaptive Difficulty Engine | Partial | Performance-based logic exists | Use multidimensional reasoning data, record recommendation reasons, and control overrides |
| Progressive Solution Unlock System | Misaligned | Hints and solution levels exist | Require accepted reasoning gates rather than mere attempts |
| Critical Thinking Scorecard | Partial | Criterion scoring exists | Standardize rubric and produce evidence-backed criterion scores |
| Validated Problem Bank | Partial | Curated problems are present | Move answer keys and hidden solution data to server-only storage |
| Student-Entered Problems | Partial | AI validation exists | Reject unsupported inputs and prevent reference answer exposure |
| LaTeX Mathematical Input | Missing | Plain-text notation guide only | Implement MathLive or equivalent and render with KaTeX or MathJax |
| Student Accounts and Progress | Partial | Authentication, profile, history, and metrics exist | Add validated progress records and optional achievements only if retained in the paper |
| System Administrator Portal | Partial | Dashboard and learner review exist | Implement all approved management and reporting functions |
| Reports and Audit Logs | Missing | No complete report or activity-log module | Add reports, exports, admin actions, AI failures, and security events |
| Privacy and Responsible AI | Partial | Authentication and basic rules exist | Add consent, AI disclosure, retention, anonymization, and server-side safeguards |

## 5. Target Technical Architecture

```text
STUDENT WEB CLIENT
  -> raw response, draft, reflection
TRUSTED SERVER API
  -> input validation and topic support check
  -> Socratic prompt controller
  -> formula and theorem validator
  -> error diagnosis and misconception classifier
  -> reasoning gate evaluator
  -> adaptive difficulty engine
  -> Critical Thinking Scorecard
  -> progressive solution release
FIRESTORE
  -> student-visible records
  -> administrator-managed content
  -> server-only instructional records
  -> audit and AI failure logs
```

## 6. Detailed Remediation Work Packages

### WP-01. Secure AI and Authoritative System Logic

- **Priority:** P0 - Critical
- **Objective:** Prevent client-side bypass of AI controls, scoring, progression, and answer protection.
- **Dependencies:** Firebase project with trusted backend support
- **Primary output:** Cloud Functions or Cloud Run API, revised Firestore rules, secret management

**Implementation tasks**
- Move Gemini requests from the browser to Firebase Cloud Functions, Cloud Run, or another trusted server endpoint.
- Store API credentials only in server-side secret management. Remove secret-bearing VITE environment variables.
- Move diagnosis, scorecard generation, phase advancement, unlock decisions, adaptive recommendations, and statistics updates to server code.
- Split problem records into student-visible data and server-only instructional data.
- Restrict students to writing raw responses, drafts, reflections, and permitted profile preferences.
- Add App Check, request validation, rate limits, structured error handling, and AI fallback logging.

**Acceptance criteria**
- The browser bundle and Firestore student-readable documents contain no answer key, hidden solution step, private prompt, scoring rubric, or Gemini key.
- A student cannot directly change score, diagnosis, phase, difficulty, unlock level, AI message, or progress statistics.
- All authoritative writes are made by trusted server code and include timestamps and source metadata.
- Security-rule tests confirm denied unauthorized reads and writes.

### WP-02. Rebuild the Socratic Reasoning Workflow

- **Priority:** P0 - Critical
- **Objective:** Make the learner flow match the approved reasoning sequence in the capstone.
- **Dependencies:** WP-01
- **Primary output:** Phase state machine, server validation, route control, session recovery

**Implementation tasks**
- Adopt the official sequence: problem understanding, relevant information identification, method selection, formula or theorem justification, guided computation or proof reasoning, verification and checking, result interpretation, controlled solution release, and scorecard.
- Run diagnosis after every learner response rather than treating diagnosis as a learner-facing replacement phase.
- Store the current phase, required response type, attempt count, gate status, and corrective-cycle count.
- Prevent manual navigation to a future phase through route guards and server validation.
- Support resume, retry, timeout, abandoned session, completed session, and unsupported-problem states.

**Acceptance criteria**
- A learner cannot skip required phases by changing the URL or client state.
- Every phase records a learner response and an evaluation result before progression.
- Verification and interpretation are explicit learner tasks.
- Session recovery returns the learner to the correct approved phase.

### WP-03. Complete the Formula and Theorem Justification Module

- **Priority:** P1 - High
- **Objective:** Require valid application conditions before computation or proof progression.
- **Dependencies:** WP-02, WP-09
- **Primary output:** Reference collection, condition validator, justification prompts

**Implementation tasks**
- Create managed formula and theorem references with statement, variables, conditions, domain, supported topics, examples, and equivalent notation.
- Require learners to identify the selected formula or theorem and explain why its conditions apply.
- For Quantitative Methods, validate variables, statistical procedure, assumptions, and interpretation requirements.
- For Discrete Mathematics, validate theorem conditions, objects, sets, cases, or proof strategy as applicable.
- Return the learner to the justification stage when conditions are absent, invalid, or weak.

**Acceptance criteria**
- A correct final value cannot bypass an invalid formula or theorem application.
- The system identifies the missing or violated condition and asks a corrective Socratic question.
- Administrators can create, edit, archive, and version formula and theorem records.
- Justification results are stored separately from computational accuracy.

### WP-04. Expand Error Diagnosis and Misconception Detection

- **Priority:** P1 - High
- **Objective:** Diagnose the source of an error and choose a corrective response aligned with the learner phase.
- **Dependencies:** WP-01, WP-02, WP-09
- **Primary output:** Misconception taxonomy, diagnostic schema, corrective prompt mapping

**Implementation tasks**
- Use explicit categories: conceptual error, procedural error, wrong formula, theorem-condition violation, invalid logic, misinterpreted variable, computational error, incorrect interpretation, weak justification, skipped reasoning, unsupported response, and none.
- Store evidence, confidence, severity, target phase, corrective prompt, and resolution status for each diagnosis.
- Combine deterministic checks with AI classification. Deterministic checks should take priority when available.
- Track recurring misconceptions by subject, topic, skill, and session history.
- Prevent uncertain AI classifications from being presented as verified facts.

**Acceptance criteria**
- Every rejected response has a diagnosis category and a corrective Socratic prompt.
- The system distinguishes minor computation mistakes from conceptual or logical failures.
- Low-confidence diagnosis uses a safe fallback prompt or requests clarification.
- Recurring misconception counts are available to the adaptive engine and administrator reports.

### WP-05. Strengthen the Adaptive Difficulty Engine

- **Priority:** P1 - High
- **Objective:** Assign succeeding problems using reasoning-sensitive learner evidence.
- **Dependencies:** WP-04, WP-07
- **Primary output:** Difficulty policy, learner model, recommendation record

**Implementation tasks**
- Use accuracy, logical validity, method selection, justification quality, interpretation quality, corrective cycles, hint usage, repeated misconceptions, completion time, and recent topic performance.
- Define documented thresholds and minimum evidence requirements before changing difficulty.
- Record system-recommended difficulty, assigned difficulty, reason, confidence, and any permitted learner override.
- Apply adaptation by topic and skill rather than using only a single global score.
- Keep unsupported or insufficient-data cases at a safe default level.

**Acceptance criteria**
- Difficulty changes include a stored reason linked to observable performance data.
- A minor arithmetic error does not automatically lower difficulty when reasoning is strong.
- Repeated conceptual or logical errors trigger appropriate remediation or easier prerequisite tasks.
- Adaptation rules are covered by unit tests and can be configured by an administrator.

### WP-06. Correct the Progressive Solution Unlock System

- **Priority:** P0 - Critical
- **Objective:** Release assistance only after accepted reasoning or a completed corrective cycle.
- **Dependencies:** WP-01, WP-02, WP-04
- **Primary output:** Gate evaluator, hint levels, partial solution service, full solution service

**Implementation tasks**
- Replace attempted-phase checks with accepted-phase gate results.
- Define separate support levels: Socratic prompt, targeted hint, stronger hint, partial step, worked explanation, and final solution.
- Require the official phase gates before full solution access.
- Record why each support level was unlocked, denied, or delayed.
- Prevent direct retrieval of full solutions from the client or student-readable database.

**Acceptance criteria**
- A blank, irrelevant, or incorrect attempt never counts as a completed gate.
- Full solution access requires accepted reasoning for all mandatory phases or a documented instructor-approved exception.
- All unlock decisions are server-issued and immutable to the student.
- The final explanation includes method, steps, checking, and interpretation.

### WP-07. Standardize the Critical Thinking Scorecard

- **Priority:** P1 - High
- **Objective:** Produce transparent, evidence-backed formative feedback consistent with the capstone.
- **Dependencies:** WP-03, WP-04
- **Primary output:** 100-point rubric, criterion evidence, feedback generator, score history

**Implementation tasks**
- Use five 20-point criteria: answer accuracy, logical validity, method selection, formula or theorem justification, and interpretation and explanation quality.
- Define level descriptors for 0-5, 6-10, 11-15, and 16-20 within each criterion.
- Use numeric tolerance, mathematical equivalence, required-concept checks, theorem-condition checks, and structured proof-step rules before AI judgment.
- Store criterion score, evidence, reason, improvement advice, confidence, and scoring source.
- Display the scorecard as formative feedback, not as a replacement for formal course grading.

**Acceptance criteria**
- Text length alone cannot produce a high interpretation score.
- A correct conclusion reached through invalid reasoning receives a reduced logical-validity score.
- Each criterion shows the evidence used to assign the score.
- The same rubric wording appears in the software, questionnaire, data dictionary, diagrams, and capstone narrative.

### WP-08. Implement the LaTeX Mathematical Input Interface

- **Priority:** P1 - High
- **Objective:** Support accurate keyboard-based mathematical entry within the approved non-image scope.
- **Dependencies:** WP-02
- **Primary output:** Math input component, symbol toolbar, rendered preview, normalizer

**Implementation tasks**
- Implement a visual math input component using MathLive or an equivalent supported library.
- Provide controls for fractions, exponents, radicals, subscripts, inequalities, logical operators, sets, and topic-specific symbols.
- Render a live preview using KaTeX, MathJax, or equivalent.
- Store normalized LaTeX and plain-text equivalents when needed for validation.
- Add accessible labels, keyboard navigation, error messages, and mobile-responsive controls.
- Continue rejecting images, handwriting, OCR, camera input, and unsupported graphical content.

**Acceptance criteria**
- Students can enter all notation required by the implemented topics without image upload.
- The displayed equation matches the stored normalized value.
- Invalid or unsupported notation receives a clear correction message.
- The component works with keyboard-only navigation and common screen sizes.

### WP-09. Complete the System Administrator Portal

- **Priority:** P1 - High
- **Objective:** Implement the administrative functions documented in the functional decomposition and use cases.
- **Dependencies:** WP-01, WP-10
- **Primary output:** Administrator routes, CRUD interfaces, reports, audit views

**Implementation tasks**
- Build user account management with search, status control, approved profile editing, and access reset workflows.
- Build subject and topic management aligned with validated syllabi or course outlines.
- Build problem bank management with difficulty, supported response format, approval status, and answer-key validation.
- Build formula and theorem reference management.
- Build Socratic prompt bank and misconception-category management.
- Build learner-record monitoring, scorecard views, recurring misconception reports, and session analytics.
- Build report generation and export for learning progress, scorecards, activities, and system usage.
- Build system settings, activity logs, AI failure logs, backup status, and maintenance controls.

**Acceptance criteria**
- All administrator functions named in the capstone have an authorized route and usable interface.
- Content changes are versioned and recorded in audit logs.
- Administrator reports can be filtered and exported without exposing unnecessary personal data.
- Students cannot access administrator routes or records.

### WP-10. Align the Firestore Data Architecture

- **Priority:** P0 - Critical
- **Objective:** Create a secure database structure that supports the six modules and approved administrator functions.
- **Dependencies:** WP-01
- **Primary output:** Collections, indexes, security rules, data migration, revised data dictionary

**Implementation tasks**
- Create core collections for users, subjects, topics, problems, formula_theorem_references, socratic_prompt_bank, misconception_categories, sessions, notifications, and audit_logs.
- Use session subcollections or structured embedded records for steps, responses, AI interactions, diagnoses, scorecards, and unlock events.
- Add status, version, createdBy, updatedBy, createdAt, updatedAt, and archival fields to managed content.
- Define compound indexes for administrator filters, learner history, topic performance, and reporting.
- Write migration scripts for current records and retain rollback backups.
- Revise the capstone data dictionary if the implemented Firestore model differs from the existing table-oriented presentation.

**Acceptance criteria**
- Each functional module has a defined storage location and ownership rule.
- Student reads exclude server-only instructional data.
- Administrator changes are auditable.
- Security-rule and index tests pass against the Firebase Emulator.

### WP-11. Operationalize Privacy, Ethics, and Responsible AI

- **Priority:** P1 - High
- **Objective:** Convert the capstone ethical commitments into visible system safeguards.
- **Dependencies:** WP-01, WP-10
- **Primary output:** Consent flow, privacy notice, retention policy, anonymization process, AI disclosure

**Implementation tasks**
- Show informed consent and data-use information before the first learning session.
- Disclose that AI feedback may be inaccurate and should be verified.
- Define data-retention periods for responses, AI logs, scorecards, and inactive accounts.
- Add account deactivation and record-anonymization procedures.
- Use pseudonymized identifiers in reports where names are not necessary.
- Restrict report exports and log export activity.
- Add a process for handling uncertain, unsafe, or unsupported AI output.

**Acceptance criteria**
- A learner cannot begin an AI session without acknowledging the required notice.
- The privacy notice identifies collected data, purpose, access, retention, and deletion or anonymization procedures.
- Administrative reports minimize personal data.
- AI confidence and fallback status are visible where relevant.

### WP-12. Testing, Validation, and Release Control

- **Priority:** P0 - Critical
- **Objective:** Demonstrate that the system functions as specified and does not permit bypass of the learning controls.
- **Dependencies:** All implementation work packages
- **Primary output:** Automated tests, manual test scripts, test evidence, release checklist

**Implementation tasks**
- Add unit tests for phase transitions, diagnosis rules, difficulty rules, scorecard calculations, and unlock policies.
- Add Firebase Emulator tests for authentication, role access, student ownership, administrator operations, and forbidden field writes.
- Add integration tests for prepared problems, student-entered problems, unsupported inputs, AI fallback, and session recovery.
- Add Playwright tests for registration, login, complete student workflow, administrator workflow, report export, and unauthorized route access.
- Prepare a validated test problem set for Quantitative Methods and Discrete Mathematics.
- Record defects, retest results, and release approval evidence.

**Acceptance criteria**
- All P0 and P1 acceptance tests pass before user acceptability evaluation.
- No critical security, answer-exposure, progression-bypass, or data-integrity defect remains open.
- Each capstone functional requirement has at least one test case.
- The release build, Firebase rules, indexes, and server functions are deployed from a tagged version.

### WP-13. Synchronize Repository and Capstone Documentation

- **Priority:** P2 - Medium
- **Objective:** Ensure that the paper, diagrams, source code, README, and user interface describe the same system.
- **Dependencies:** Finalized implementation decisions
- **Primary output:** Updated README, architecture notes, data dictionary, diagrams, traceability matrix

**Implementation tasks**
- Replace remaining Teacher terminology with System Administrator unless the research scope is formally changed.
- Update the README feature list, setup steps, security instructions, system roles, and supported input scope.
- Remove instructions to use Firestore test mode for normal setup.
- Rename template package identifiers and remove unused dependencies and generated-template residue.
- Update the functional decomposition, use cases, storyboard, architecture diagram, database design, data dictionary, and list of modules after implementation.
- Use language that states MINDGUIDE supports critical-thinking practice and acceptability evaluation rather than proving permanent improvement.

**Acceptance criteria**
- No role, module, data field, input method, or workflow is described differently in the repository and capstone.
- The README accurately identifies the deployed architecture and security model.
- All diagrams and data dictionaries match the final implementation.
- The approved title remains unchanged.

## 7. Proposed Firestore Structure

```text
users/{userId}
subjects/{subjectId}
topics/{topicId}
problems/{problemId}
formula_theorem_references/{referenceId}
socratic_prompt_bank/{promptId}
misconception_categories/{categoryId}
sessions/{sessionId}/steps/{stepId}
sessions/{sessionId}/responses/{responseId}
sessions/{sessionId}/ai_interactions/{interactionId}
sessions/{sessionId}/diagnoses/{diagnosisId}
sessions/{sessionId}/scorecards/{scorecardId}
sessions/{sessionId}/unlock_events/{eventId}
learning_progress/{userId}
notifications/{notificationId}
audit_logs/{logId}
```

## 8. Implementation Sequence

| Sprint | Focus | Deliverables | Dependency note |
|---|---|---|---|
| Sprint 0 | Baseline and repository control | Create issue backlog, branch strategy, environment inventory, test baseline, and current-data backup | No feature coding before baseline approval |
| Sprint 1 | Security foundation | WP-01 server API, secret management, authoritative writes, initial rule tests | Blocks all later authoritative logic |
| Sprint 2 | Data architecture | WP-10 collections, indexes, migration, server-only problem data | Needed by admin and core modules |
| Sprint 3 | Reasoning workflow and gates | WP-02 and WP-06 phase state machine, gate evaluator, route enforcement | Core anti-direct-answer behavior |
| Sprint 4 | Diagnosis and justification | WP-03 and WP-04 reference validation, taxonomy, corrective prompts | Supplies evidence for scoring and adaptation |
| Sprint 5 | Scorecard and adaptation | WP-05 and WP-07 learner model, rubric, evidence, difficulty policy | Requires stable diagnosis data |
| Sprint 6 | Mathematical input | WP-08 LaTeX keyboard, preview, normalization, accessibility | Integrate with supported answer formats |
| Sprint 7 | Administrator portal | WP-09 content, users, reports, logs, settings | Uses finalized collections and permissions |
| Sprint 8 | Privacy and operational safeguards | WP-11 consent, retention, anonymization, export restrictions | Complete before respondent use |
| Sprint 9 | System-wide verification | WP-12 automated tests, validated math cases, security regression, release evidence | All P0 and P1 defects closed |
| Sprint 10 | Documentation and evaluation release | WP-13 repository and capstone synchronization, tagged build, acceptability deployment | Only after test sign-off |

## 9. Release Readiness Checklist

- [ ] The six core modules are functional and connected in one complete student workflow.
- [ ] The complete solution cannot be obtained before required reasoning gates pass.
- [ ] No API key, hidden answer, solution outline, scoring rubric, or private prompt is exposed to the browser.
- [ ] Students cannot write authoritative score, diagnosis, phase, unlock, or progress fields.
- [ ] System Administrator functions match the approved functional decomposition and use cases.
- [ ] LaTeX mathematical input works for all implemented topics and remains within the non-image scope.
- [ ] Unsupported topics and inputs are rejected safely.
- [ ] Automated tests and manual capstone traceability tests pass.
- [ ] Privacy notice, consent, AI disclosure, retention, and anonymization procedures are active.
- [ ] README, diagrams, database design, data dictionary, module list, and interface terminology match the deployed system.
- [ ] Evaluation materials measure acceptability and perceived usefulness without claiming experimental learning gains.

## 10. Definition of Done

A work package is complete only when its code, tests, security rules, interface behavior, data fields, administrator controls, documentation, and acceptance evidence agree. A visual interface that displays a module name is not sufficient. The underlying control must produce the required behavior and prevent bypass.

## 11. Immediate Action List

1. Freeze feature expansion and create GitHub issues for WP-01, WP-02, WP-06, WP-10, and WP-12.
2. Create a protected development branch and tag the current prototype as the baseline snapshot.
3. Move the Gemini call, hidden answers, scoring, diagnosis, progression, and unlock logic to a trusted backend.
4. Rewrite Firestore rules so students cannot write authoritative fields.
5. Implement the accepted-reasoning gate model and the complete Socratic phase sequence.
6. Create the administrator-managed collections and migration plan.
7. Standardize the scorecard rubric across the capstone and code.
8. Add the LaTeX mathematical input component.
9. Complete administrator content and report modules.
10. Run full traceability and security tests before acceptability evaluation.

## 12. Source Baseline

- Capstone document: MINDGUIDE FINAL(3).docx
- Repository: https://github.com/OjayAca/Socraticailearningplatform
- Review basis: objectives, scope and limitations, conceptual framework, functional decomposition, workflows, use cases, data design, functional requirements, and list of modules