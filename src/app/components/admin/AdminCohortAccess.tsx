"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Database,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { VALIDATED_TOPICS } from "@/data/validated-curriculum";
import { db } from "@/lib/firebase";
import { displayCohortStateLabel } from "@/lib/learning/display-labels";
import {
  adminPilotRoster,
  adminSetPilot,
  getPilotStatus,
  type PilotStatus,
} from "@/lib/secure-api";
import { Alert } from "../ui/alert";
import { ListRowSkeleton } from "../ui/skeleton";
import { AdminShell } from "./AdminShell";
import {
  Action,
  AdminFilterPill,
  AdminPagination,
  AdminSearchInput,
  AdminStat,
  AdminTabs,
  PageTitle,
  errorMessage,
  formatTimestamp,
  paginateSlice,
  searchableUser,
  statusBadgeClass,
  type AdminTabItem,
  type SearchableAcademicProfile,
  type TimestampLike,
} from "./admin-shared";

type CohortTabId = "cohort" | "participants";
type CohortAdmissionStatus = "admitted" | "revoked" | "not_admitted";
type AdmissionFilter = "all" | CohortAdmissionStatus;
type VerificationFilter = "all" | "verified" | "unverified";

interface CohortStateOption {
  readonly value: PilotStatus["state"];
  readonly title: string;
  readonly badge: string;
  readonly description: string;
}

interface CohortTopicOption {
  readonly id: string;
  readonly name: string;
  readonly subject: string;
  readonly source: "validated" | "firestore" | "custom";
}

interface FirestoreTopicDoc {
  readonly name?: unknown;
  readonly subject?: unknown;
  readonly status?: unknown;
}

interface FirestoreUserDoc {
  readonly displayName?: unknown;
  readonly email?: unknown;
  readonly role?: unknown;
  readonly status?: unknown;
  readonly emailVerified?: unknown;
  readonly academicProfile?: SearchableAcademicProfile | null;
}

interface PilotRosterDoc {
  readonly status?: unknown;
  readonly updatedAt?: TimestampLike;
  readonly createdAt?: TimestampLike;
}

interface MergedParticipantRecord {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly accountStatus: string;
  readonly emailVerified: boolean;
  readonly emailVerificationRecorded: boolean;
  readonly admissionStatus: CohortAdmissionStatus;
  readonly rosterUpdatedAt: TimestampLike;
  readonly academicProfile: SearchableAcademicProfile | null;
  readonly searchText: string;
}

const PARTICIPANTS_PAGE_SIZE = 15;

const COHORT_STATE_OPTIONS: ReadonlyArray<CohortStateOption> = [
  {
    value: "open",
    title: "Open for New Sessions",
    badge: "open",
    description:
      "Allows admitted students to start new guided learning sessions on enabled topics.",
  },
  {
    value: "closed",
    title: "Closed (new sessions paused)",
    badge: "closed",
    description:
      "Prevents new sessions from starting while existing active sessions can finish and history remains readable.",
  },
  {
    value: "drain",
    title: "Drain — Allow Existing Sessions to Finish",
    badge: "drain",
    description:
      "Drains active cohort traffic by allowing ongoing sessions to finish without admitting new starts.",
  },
  {
    value: "write-freeze",
    title: "Paused: Stop All Learning Operations",
    badge: "write-freeze",
    description:
      "Pauses all learning writes across the platform while keeping saved learning history readable.",
  },
];

function cohortStateBadgeClass(state: string): string {
  switch (state) {
    case "open":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30";
    case "drain":
    case "closed":
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30";
    case "write-freeze":
      return "bg-rose-50 text-rose-700 ring-1 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700";
  }
}

function admissionBadgeClass(status: CohortAdmissionStatus): string {
  switch (status) {
    case "admitted":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30";
    case "revoked":
      return "bg-rose-50 text-rose-700 ring-1 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700";
  }
}

function admissionLabel(status: CohortAdmissionStatus): string {
  switch (status) {
    case "admitted":
      return "Admitted";
    case "revoked":
      return "Revoked";
    default:
      return "Not admitted";
  }
}

function normalizeAdmissionStatus(raw: unknown): CohortAdmissionStatus {
  if (raw === "admitted") return "admitted";
  if (raw === "revoked") return "revoked";
  return "not_admitted";
}

function buildAcademicSummary(profile: SearchableAcademicProfile | null): string | null {
  if (!profile) return null;
  const parts = [profile.course, profile.yearLevel, profile.section]
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Redesigned administrator Cohort & Access workspace combining cohort state/topic controls
 * and a searchable, filterable, paginated participant roster backed by Firebase Auth UIDs.
 *
 * @returns The Cohort & Access management page wrapped in {@link AdminShell}.
 */
function AdminCohortAccess() {
  const [activeTab, setActiveTab] = useState<CohortTabId>("cohort");

  // Tab 1: Cohort access state & topics
  const [state, setState] = useState<PilotStatus["state"]>("closed");
  const [actual, setActual] = useState("Loading cohort metadata…");
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [firestoreTopics, setFirestoreTopics] = useState<CohortTopicOption[]>([]);
  const [topicSearch, setTopicSearch] = useState("");
  const [artifact, setArtifact] = useState("");
  const [cohortStatusMessage, setCohortStatusMessage] = useState<string | null>(null);
  const [cohortErrorMessage, setCohortErrorMessage] = useState<string | null>(null);
  const [savingCohort, setSavingCohort] = useState(false);

  // Tab 2: Participant records state
  const [students, setStudents] = useState<Array<{ id: string; data: FirestoreUserDoc }>>([]);
  const [rosterByUid, setRosterByUid] = useState<Map<string, PilotRosterDoc>>(new Map());
  const [participantsLoading, setParticipantsLoading] = useState(true);
  const [participantsError, setParticipantsError] = useState<string | null>(null);
  const [rosterActionMessage, setRosterActionMessage] = useState<string | null>(null);
  const [rosterActionError, setRosterActionError] = useState<string | null>(null);
  const [participantSearch, setParticipantSearch] = useState("");
  const [admissionFilter, setAdmissionFilter] = useState<AdmissionFilter>("all");
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>("all");
  const [participantPage, setParticipantPage] = useState(1);
  const [busyRosterKey, setBusyRosterKey] = useState<string | null>(null);

  // Expandable manual UID fallback
  const [manualUid, setManualUid] = useState("");

  const isLoadedState = actual !== "Loading cohort metadata…";

  const loadCohortConfig = useCallback(async () => {
    try {
      const [pilotResult, topicsSnapshot] = await Promise.allSettled([
        getPilotStatus(),
        db ? getDocs(collection(db, "topics")) : Promise.resolve(null),
      ]);

      if (pilotResult.status === "fulfilled") {
        const value = pilotResult.value;
        setActual(value.state);
        setState(value.state);
        setSelectedTopicIds(Array.from(new Set(value.enabledTopicIds.filter(Boolean))));
        setArtifact(value.releaseArtifactId ?? "");
      } else {
        setCohortErrorMessage(
          errorMessage(pilotResult.reason, "Failed to load pilot status."),
        );
      }

      if (topicsSnapshot.status === "fulfilled" && topicsSnapshot.value?.docs) {
        const loaded: CohortTopicOption[] = topicsSnapshot.value.docs.map((item) => {
          const data = item.data() as FirestoreTopicDoc;
          const name =
            typeof data.name === "string" && data.name.trim() ? data.name.trim() : item.id;
          const subject =
            typeof data.subject === "string" && data.subject.trim()
              ? data.subject.trim()
              : "Additional Topics";
          return {
            id: item.id,
            name,
            subject,
            source: "firestore",
          };
        });
        setFirestoreTopics(loaded);
      }
    } catch (cause) {
      setCohortErrorMessage(errorMessage(cause, "Failed to load cohort configuration."));
    }
  }, []);

  const loadParticipants = useCallback(async () => {
    if (!db) {
      setParticipantsLoading(false);
      return;
    }
    setParticipantsLoading(true);
    setParticipantsError(null);
    try {
      const [usersSnapshot, rosterSnapshot] = await Promise.all([
        getDocs(query(collection(db, "users"), where("role", "==", "student"))),
        getDocs(collection(db, "pilot_roster")),
      ]);

      const userRows = (usersSnapshot?.docs ?? []).map((item) => ({
        id: item.id,
        data: item.data() as FirestoreUserDoc,
      }));
      const nextRoster = new Map<string, PilotRosterDoc>();
      for (const item of rosterSnapshot?.docs ?? []) {
        nextRoster.set(item.id, item.data() as PilotRosterDoc);
      }
      setStudents(userRows);
      setRosterByUid(nextRoster);
    } catch (cause) {
      setParticipantsError(
        errorMessage(cause, "Participant records could not be loaded."),
      );
    } finally {
      setParticipantsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCohortConfig();
      void loadParticipants();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCohortConfig, loadParticipants]);

  // Merge VALIDATED_TOPICS, Firestore topics, and any unlisted enabled topic IDs
  const allTopicOptions = useMemo<CohortTopicOption[]>(() => {
    const byId = new Map<string, CohortTopicOption>();
    for (const topic of VALIDATED_TOPICS) {
      byId.set(topic.id, {
        id: topic.id,
        name: topic.name,
        subject: topic.subject,
        source: "validated",
      });
    }
    for (const topic of firestoreTopics) {
      if (!byId.has(topic.id)) {
        byId.set(topic.id, topic);
      }
    }
    for (const id of selectedTopicIds) {
      if (!byId.has(id)) {
        byId.set(id, {
          id,
          name: id,
          subject: "Other Configured Topics",
          source: "custom",
        });
      }
    }
    return Array.from(byId.values());
  }, [firestoreTopics, selectedTopicIds]);

  const selectedTopicSet = useMemo(() => new Set(selectedTopicIds), [selectedTopicIds]);

  const groupedTopics = useMemo(() => {
    const term = topicSearch.trim().toLowerCase();
    const groups = new Map<string, CohortTopicOption[]>();
    for (const topic of allTopicOptions) {
      if (
        term &&
        !topic.name.toLowerCase().includes(term) &&
        !topic.subject.toLowerCase().includes(term) &&
        !topic.id.toLowerCase().includes(term)
      ) {
        continue;
      }
      const existing = groups.get(topic.subject) ?? [];
      existing.push(topic);
      groups.set(topic.subject, existing);
    }
    return Array.from(groups.entries());
  }, [allTopicOptions, topicSearch]);

  const participants = useMemo<MergedParticipantRecord[]>(() => {
    return students
      .map(({ id, data }) => {
        const roster = rosterByUid.get(id);
        const displayName =
          typeof data.displayName === "string" && data.displayName.trim()
            ? data.displayName.trim()
            : "Unnamed learner";
        const email =
          typeof data.email === "string" && data.email.trim() ? data.email.trim() : "—";
        const accountStatus =
          typeof data.status === "string" && data.status.trim() ? data.status.trim() : "active";
        const emailVerificationRecorded = typeof data.emailVerified === "boolean";
        const emailVerified = data.emailVerified === true;
        const admissionStatus = normalizeAdmissionStatus(roster?.status);
        const academicProfile = data.academicProfile ?? null;

        return {
          id,
          displayName,
          email,
          accountStatus,
          emailVerified,
          emailVerificationRecorded,
          admissionStatus,
          rosterUpdatedAt: roster?.updatedAt ?? roster?.createdAt,
          academicProfile,
          searchText: `${id} ${searchableUser(data)} ${admissionStatus} ${
            emailVerified ? "verified" : "unverified"
          }`.toLowerCase(),
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [rosterByUid, students]);

  const participantStats = useMemo(() => {
    let verified = 0;
    let admitted = 0;
    let revoked = 0;
    for (const participant of participants) {
      if (participant.emailVerified) verified += 1;
      if (participant.admissionStatus === "admitted") admitted += 1;
      if (participant.admissionStatus === "revoked") revoked += 1;
    }
    return {
      total: participants.length,
      verified,
      admitted,
      revoked,
    };
  }, [participants]);

  const filteredParticipants = useMemo(() => {
    const term = participantSearch.trim().toLowerCase();
    return participants.filter((participant) => {
      if (admissionFilter !== "all" && participant.admissionStatus !== admissionFilter) {
        return false;
      }
      if (verificationFilter === "verified" && !participant.emailVerified) return false;
      if (verificationFilter === "unverified" && participant.emailVerified) return false;
      if (term && !participant.searchText.includes(term)) return false;
      return true;
    });
  }, [admissionFilter, participantSearch, participants, verificationFilter]);

  const paginatedParticipants = useMemo(
    () => paginateSlice(filteredParticipants, participantPage, PARTICIPANTS_PAGE_SIZE),
    [filteredParticipants, participantPage],
  );

  function toggleTopic(topicId: string) {
    setSelectedTopicIds((previous) =>
      previous.includes(topicId)
        ? previous.filter((id) => id !== topicId)
        : [...previous, topicId],
    );
  }

  function setTopicsForGroup(topics: ReadonlyArray<CohortTopicOption>, enable: boolean) {
    const groupIds = new Set(topics.map((item) => item.id));
    setSelectedTopicIds((previous) => {
      if (enable) {
        const merged = new Set(previous);
        for (const id of groupIds) merged.add(id);
        return Array.from(merged);
      }
      return previous.filter((id) => !groupIds.has(id));
    });
  }

  async function saveCohortSettings() {
    if (savingCohort) return;
    setSavingCohort(true);
    setCohortStatusMessage(null);
    setCohortErrorMessage(null);
    try {
      const trimmedArtifact = artifact.trim();
      const result = await adminSetPilot({
        state,
        enabledTopicIds: selectedTopicIds,
        ...(trimmedArtifact ? { releaseArtifactId: trimmedArtifact } : {}),
      });
      setActual(result.state);
      setCohortStatusMessage("AI pilot access settings saved.");
    } catch (cause) {
      setCohortErrorMessage(errorMessage(cause, "Pilot update failed."));
    } finally {
      setSavingCohort(false);
    }
  }

  async function updateParticipantAdmission(
    uid: string,
    status: "admitted" | "revoked",
    label?: string,
  ) {
    const trimmedUid = uid.trim();
    if (!trimmedUid || busyRosterKey !== null) return;
    setBusyRosterKey(`${trimmedUid}:${status}`);
    setRosterActionMessage(null);
    setRosterActionError(null);
    try {
      await adminPilotRoster(trimmedUid, status);
      setRosterByUid((previous) => {
        const next = new Map(previous);
        next.set(trimmedUid, {
          ...(previous.get(trimmedUid) ?? {}),
          status,
          updatedAt: Date.now(),
        });
        return next;
      });
      setRosterActionMessage(
        label
          ? `Cohort access for ${label} is now ${status}.`
          : `AI practice access for ${trimmedUid} is now ${status}.`,
      );
    } catch (cause) {
      setRosterActionError(errorMessage(cause, "Roster update failed."));
    } finally {
      setBusyRosterKey(null);
    }
  }

  const tabs: ReadonlyArray<AdminTabItem> = [
    {
      id: "cohort",
      label: "Cohort Access",
      badge: (
        <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-bold dark:bg-white/10">
          {selectedTopicIds.length} topics
        </span>
      ),
    },
    {
      id: "participants",
      label: "Participant Records",
      badge: (
        <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-bold dark:bg-white/10">
          {participants.length}
        </span>
      ),
    },
  ];

  const hasParticipantFilters =
    Boolean(participantSearch.trim()) ||
    admissionFilter !== "all" ||
    verificationFilter !== "all";

  return (
    <AdminShell active="maintenance">
      <div className="space-y-6">
        <PageTitle
          title="Cohort & Access Management"
          description="Control cohort session availability, select enabled curriculum topics, and admit or revoke student participants."
        />

        <AdminTabs
          items={tabs}
          activeId={activeTab}
          onSelect={(id) => setActiveTab(id as CohortTabId)}
          ariaLabel="Cohort and access sections"
        />

        {activeTab === "cohort" ? (
          <section
            aria-label="Cohort access configuration"
            className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900/80"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div role="status" className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-600 dark:text-slate-400">
                  Recorded cohort state:
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${cohortStateBadgeClass(actual)}`}
                >
                  {actual}
                </span>
                {isLoadedState && (
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    ({displayCohortStateLabel(actual)})
                  </span>
                )}
              </div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {selectedTopicIds.length} of {allTopicOptions.length} topics enabled
              </span>
            </div>

            {cohortErrorMessage && (
              <Alert tone="error" onDismiss={() => setCohortErrorMessage(null)}>
                {cohortErrorMessage}
              </Alert>
            )}
            {cohortStatusMessage && (
              <Alert tone="success" onDismiss={() => setCohortStatusMessage(null)}>
                {cohortStatusMessage}
              </Alert>
            )}

            <fieldset className="space-y-3" disabled={savingCohort}>
              <legend className="text-sm font-bold text-slate-950 dark:text-white">
                Cohort session state
              </legend>
              <div
                role="radiogroup"
                aria-label="Cohort session state"
                className="grid gap-3 md:grid-cols-2"
              >
                {COHORT_STATE_OPTIONS.map((option) => {
                  const selected = state === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition focus-within:ring-2 focus-within:ring-indigo-500 ${
                        selected
                          ? "border-indigo-600 bg-indigo-50/70 shadow-sm dark:border-indigo-400 dark:bg-indigo-950/40"
                          : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/60"
                      }`}
                    >
                      <input
                        type="radio"
                        name="cohort-state"
                        value={option.value}
                        checked={selected}
                        disabled={savingCohort}
                        onChange={() => setState(option.value)}
                        className="mt-1 h-4 w-4 shrink-0 accent-indigo-600"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-950 dark:text-white">
                            {option.title}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${cohortStateBadgeClass(option.value)}`}
                          >
                            {option.badge}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">
                          {option.description}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-950 dark:text-white">
                    Enabled learning topics
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Select subjects and topics permitted for active cohort practice.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Action
                    disabled={savingCohort || allTopicOptions.length === 0}
                    onClick={() => setTopicsForGroup(allTopicOptions, true)}
                  >
                    Select all
                  </Action>
                  <Action
                    disabled={savingCohort || selectedTopicIds.length === 0}
                    onClick={() => setSelectedTopicIds([])}
                  >
                    Clear all
                  </Action>
                </div>
              </div>

              <AdminSearchInput
                value={topicSearch}
                onChange={setTopicSearch}
                placeholder="Search subjects, topics, or topic IDs"
                ariaLabel="Search cohort topics"
                clearAriaLabel="Clear topic search"
              />

              {groupedTopics.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                  No topics match &ldquo;{topicSearch}&rdquo;.
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {groupedTopics.map(([subject, topics]) => {
                    const selectedInGroup = topics.filter((item) =>
                      selectedTopicSet.has(item.id),
                    ).length;
                    return (
                      <div
                        key={subject}
                        className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
                          <div>
                            <h3 className="text-sm font-bold text-slate-950 dark:text-white">
                              {subject}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {selectedInGroup} of {topics.length} selected
                            </p>
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              disabled={savingCohort}
                              onClick={() => setTopicsForGroup(topics, true)}
                              className="min-h-11 rounded-lg px-2.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
                            >
                              Select all
                            </button>
                            <button
                              type="button"
                              disabled={savingCohort || selectedInGroup === 0}
                              onClick={() => setTopicsForGroup(topics, false)}
                              className="min-h-11 rounded-lg px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              Clear
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 space-y-2">
                          {topics.map((topic) => {
                            const checked = selectedTopicSet.has(topic.id);
                            return (
                              <label
                                key={topic.id}
                                className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition focus-within:ring-2 focus-within:ring-indigo-500 ${
                                  checked
                                    ? "border-indigo-300 bg-white dark:border-indigo-500/40 dark:bg-slate-900"
                                    : "border-transparent bg-white/60 hover:bg-white dark:bg-slate-900/50 dark:hover:bg-slate-900"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={savingCohort}
                                  onChange={() => toggleTopic(topic.id)}
                                  className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    {topic.name}
                                  </span>
                                  <span className="block font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                    {topic.id}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <details className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
              <summary className="cursor-pointer text-sm font-bold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-200">
                Advanced Settings
              </summary>
              <div className="mt-4 space-y-2">
                <label className="block text-sm font-bold text-slate-950 dark:text-white">
                  Release evidence reference (record only)
                  <input
                    disabled={savingCohort}
                    value={artifact}
                    onChange={(event) => setArtifact(event.target.value)}
                    placeholder="Optional release or verification artifact ID"
                    className="mt-1.5 block min-h-11 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-2.5 text-sm font-normal text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Recorded on the cohort settings document for release traceability.
                </p>
              </div>
            </details>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                disabled={savingCohort}
                onClick={() => void saveCohortSettings()}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
              >
                {savingCohort && (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                )}
                <span>
                  {savingCohort ? "Saving cohort records..." : "Save cohort records"}
                </span>
              </button>
            </div>
          </section>
        ) : (
          <section aria-label="Participant cohort records" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <AdminStat
                label="Student accounts"
                value={participantStats.total}
                loading={participantsLoading}
                Icon={Users}
                iconClassName="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
              />
              <AdminStat
                label="Verified accounts"
                value={participantStats.verified}
                loading={participantsLoading}
                Icon={ShieldCheck}
                iconClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
              />
              <AdminStat
                label="Admitted to cohort"
                value={participantStats.admitted}
                loading={participantsLoading}
                Icon={CheckCircle2}
                iconClassName="bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400"
              />
              <AdminStat
                label="Revoked access"
                value={participantStats.revoked}
                loading={participantsLoading}
                Icon={XCircle}
                iconClassName="bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
              />
            </div>

            {participantsError && (
              <Alert
                tone="error"
                action={
                  <button
                    type="button"
                    onClick={() => void loadParticipants()}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
                  >
                    <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                    Retry
                  </button>
                }
              >
                {participantsError}
              </Alert>
            )}

            {rosterActionError && (
              <Alert tone="error" onDismiss={() => setRosterActionError(null)}>
                {rosterActionError}
              </Alert>
            )}

            {rosterActionMessage && (
              <Alert tone="success" onDismiss={() => setRosterActionMessage(null)}>
                {rosterActionMessage}
              </Alert>
            )}

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <AdminSearchInput
                  value={participantSearch}
                  onChange={(value) => {
                    setParticipantSearch(value);
                    setParticipantPage(1);
                  }}
                  placeholder="Search learner name, email, UID, or academic profile"
                  ariaLabel="Search cohort participants"
                  clearAriaLabel="Clear participant search"
                  className="flex-1"
                />
                <Action
                  disabled={participantsLoading}
                  busy={participantsLoading}
                  onClick={() => void loadParticipants()}
                >
                  Refresh roster
                </Action>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    ["all", "All admission"],
                    ["admitted", "Admitted"],
                    ["revoked", "Revoked"],
                    ["not_admitted", "Not admitted"],
                  ] as const
                ).map(([value, label]) => (
                  <AdminFilterPill
                    key={value}
                    active={admissionFilter === value}
                    onClick={() => {
                      setAdmissionFilter(value);
                      setParticipantPage(1);
                    }}
                  >
                    {label}
                  </AdminFilterPill>
                ))}

                {(
                  [
                    ["all", "All verification"],
                    ["verified", "Verified"],
                    ["unverified", "Unverified"],
                  ] as const
                ).map(([value, label]) => (
                  <AdminFilterPill
                    key={value}
                    variant="muted"
                    active={verificationFilter === value}
                    onClick={() => {
                      setVerificationFilter(value);
                      setParticipantPage(1);
                    }}
                  >
                    {label}
                  </AdminFilterPill>
                ))}

                {hasParticipantFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setParticipantSearch("");
                      setAdmissionFilter("all");
                      setVerificationFilter("all");
                      setParticipantPage(1);
                    }}
                    className="min-h-11 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>

            {participantsLoading ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                <ListRowSkeleton rows={5} label="Loading participant records" />
              </div>
            ) : filteredParticipants.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300">
                No student accounts match your current search or filters.
              </div>
            ) : (
              <div>
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                  <div
                    role="region"
                    aria-label="Participant cohort records table (scroll horizontally)"
                    tabIndex={0}
                    className="table-scroll max-w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-indigo-500"
                  >
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                        <tr>
                          <th className="p-4">Learner Name</th>
                          <th className="p-4">Account Verification</th>
                          <th className="p-4">Cohort Admission Status</th>
                          <th className="p-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {paginatedParticipants.items.map((participant) => {
                          const academicSummary = buildAcademicSummary(
                            participant.academicProfile,
                          );
                          const admitting =
                            busyRosterKey === `${participant.id}:admitted`;
                          const revoking =
                            busyRosterKey === `${participant.id}:revoked`;
                          return (
                            <tr
                              key={participant.id}
                              className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                            >
                              <td className="p-4">
                                <p className="font-bold text-slate-950 dark:text-white">
                                  {participant.displayName}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {participant.email}
                                  {academicSummary ? ` · ${academicSummary}` : ""}
                                </p>
                                <p className="mt-0.5 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                                  UID: {participant.id}
                                </p>
                              </td>
                              <td className="p-4">
                                <div className="flex flex-col gap-1">
                                  <span
                                    className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                                      participant.emailVerified
                                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30"
                                        : "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30"
                                    }`}
                                  >
                                    {participant.emailVerified ? (
                                      <ShieldCheck
                                        aria-hidden="true"
                                        className="h-3.5 w-3.5"
                                      />
                                    ) : (
                                      <ShieldAlert
                                        aria-hidden="true"
                                        className="h-3.5 w-3.5"
                                      />
                                    )}
                                    <span>
                                      {participant.emailVerified
                                        ? "Verified"
                                        : "Unverified"}
                                    </span>
                                  </span>
                                  {!participant.emailVerificationRecorded && (
                                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                      Not synced to user doc
                                    </span>
                                  )}
                                  {participant.accountStatus !== "active" && (
                                    <span
                                      className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${statusBadgeClass(participant.accountStatus)}`}
                                    >
                                      {participant.accountStatus}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-4">
                                <span
                                  className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${admissionBadgeClass(participant.admissionStatus)}`}
                                >
                                  {admissionLabel(participant.admissionStatus)}
                                </span>
                                {participant.rosterUpdatedAt !== undefined &&
                                  participant.rosterUpdatedAt !== null && (
                                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                                      Updated {formatTimestamp(participant.rosterUpdatedAt)}
                                    </p>
                                  )}
                              </td>
                              <td className="p-4">
                                <div className="flex flex-wrap gap-2">
                                  <Action
                                    disabled={
                                      busyRosterKey !== null ||
                                      participant.admissionStatus === "admitted"
                                    }
                                    busy={admitting}
                                    ariaLabel={`Admit ${participant.displayName}`}
                                    onClick={() =>
                                      void updateParticipantAdmission(
                                        participant.id,
                                        "admitted",
                                        participant.displayName,
                                      )
                                    }
                                  >
                                    Admit
                                  </Action>
                                  <Action
                                    disabled={
                                      busyRosterKey !== null ||
                                      participant.admissionStatus === "revoked"
                                    }
                                    busy={revoking}
                                    ariaLabel={`Revoke ${participant.displayName}`}
                                    className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/70"
                                    onClick={() =>
                                      void updateParticipantAdmission(
                                        participant.id,
                                        "revoked",
                                        participant.displayName,
                                      )
                                    }
                                  >
                                    Revoke
                                  </Action>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <AdminPagination
                  page={paginatedParticipants.page}
                  pageSize={PARTICIPANTS_PAGE_SIZE}
                  totalItems={paginatedParticipants.totalItems}
                  onPageChange={setParticipantPage}
                  itemLabel="participants"
                />
              </div>
            )}

            <details className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <summary className="cursor-pointer text-sm font-bold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-white">
                Manual UID fallback (edge cases)
              </summary>
              <div className="mt-4 space-y-4">
                <label className="block text-sm font-bold text-slate-950 dark:text-white">
                  Verified Firebase Auth UID
                  <input
                    disabled={busyRosterKey !== null}
                    value={manualUid}
                    onChange={(event) => setManualUid(event.target.value)}
                    placeholder="Paste student Firebase Auth UID"
                    className="mt-1.5 block min-h-11 w-full max-w-md rounded-xl border border-slate-200 bg-white p-2.5 font-mono text-sm font-normal text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
                    Use only when an existing student UID is not visible in the current roster
                    query.
                  </span>
                </label>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busyRosterKey !== null || !manualUid.trim()}
                    onClick={() =>
                      void updateParticipantAdmission(manualUid, "admitted")
                    }
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    {busyRosterKey === `${manualUid.trim()}:admitted` && (
                      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                    )}
                    <span>Record as admitted</span>
                  </button>
                  <button
                    type="button"
                    disabled={busyRosterKey !== null || !manualUid.trim()}
                    onClick={() =>
                      void updateParticipantAdmission(manualUid, "revoked")
                    }
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 shadow-sm transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
                  >
                    {busyRosterKey === `${manualUid.trim()}:revoked` && (
                      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                    )}
                    <span>Record as revoked</span>
                  </button>
                </div>
              </div>
            </details>
          </section>
        )}

        <details className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300">
          <summary className="flex cursor-pointer items-center gap-2 font-bold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-white">
            <Database aria-hidden="true" className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <span>Operator maintenance</span>
          </summary>
          <div className="mt-4 space-y-3">
            <p>
              Account deletion, backup and restore, security configuration, and retention
              cleanup require an authorized project operator. This page does not perform or
              verify those tasks.
            </p>
            <div className="flex flex-wrap gap-4">
              <a
                className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-indigo-600 underline hover:text-indigo-700 dark:text-indigo-400"
                target="_blank"
                rel="noreferrer"
                href={`https://console.firebase.google.com/project/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/authentication/users`}
              >
                <span>Open Authentication users</span>
                <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
              </a>
              <a
                className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-indigo-600 underline hover:text-indigo-700 dark:text-indigo-400"
                target="_blank"
                rel="noreferrer"
                href={`https://console.firebase.google.com/project/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/firestore`}
              >
                <span>Open Firestore data and rules</span>
                <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
              </a>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Review dependencies and the recorded retention policy before cleanup. Restore
              only verified backups of this project; no demo data or replacement approvals.
            </p>
          </div>
        </details>
      </div>
    </AdminShell>
  );
}

/**
 * Compatibility export wired to the `/admin/maintenance` route.
 *
 * @returns The redesigned {@link AdminCohortAccess} administrator console.
 */
export function SecureAdminMaintenance() {
  return <AdminCohortAccess />;
}
