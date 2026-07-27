import {
  AlertCircle,
  ArrowRight,
  BrainCircuit,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Lightbulb,
  Loader2,
  LockKeyhole,
  Moon,
  Route,
  Sparkles,
  Sun,
  Target,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { Link, Navigate } from "react-router";
import { getDashboardPath, useAuthStore } from "@/stores/auth-store";

const benefits: {
  title: string;
  description: string;
  Icon: LucideIcon;
  iconClassName: string;
}[] = [
  {
    title: "Build the reasoning",
    description:
      "Work through each decision with focused questions that help you explain what you know and why it matters.",
    Icon: Route,
    iconClassName:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  },
  {
    title: "Get support, not spoilers",
    description:
      "Unlock adaptive prompts when you need them while the worked solution stays protected until your reasoning is complete.",
    Icon: Lightbulb,
    iconClassName:
      "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  {
    title: "See evidence of your thinking",
    description:
      "Review a preserved reasoning record and formative scorecard grounded in the steps you actually submitted.",
    Icon: ClipboardCheck,
    iconClassName:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
];

const stages = [
  {
    number: "01",
    title: "Problem Understanding",
    description: "Identify the relevant facts, unknowns, and constraints.",
  },
  {
    number: "02",
    title: "Method Selection",
    description: "Choose and justify the formula, theorem, or strategy.",
  },
  {
    number: "03",
    title: "Computation",
    description: "Carry out the method and verify each important step.",
  },
  {
    number: "04",
    title: "Interpretation",
    description: "Explain what the result means in the problem context.",
  },
];

export function LandingPage() {
  const {
    firebaseUser,
    userProfile,
    isLoading,
    error,
    reloadProfile,
    signOut,
  } = useAuthStore();
  const { resolvedTheme, setTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const isDark = resolvedTheme === "dark";

  if (firebaseUser && userProfile?.role) {
    return <Navigate to={getDashboardPath(userProfile.role)} replace />;
  }

  if (firebaseUser && isLoading) {
    return <ProfileLoading />;
  }

  if (firebaseUser && !userProfile) {
    return (
      <ProfileUnavailable
        error={error}
        onRetry={() => void reloadProfile().catch(() => undefined)}
        onSignOut={() => void signOut().catch(() => undefined)}
      />
    );
  }

  return (
    <div className="min-h-full bg-slate-50 text-slate-950 dark:bg-[#050816] dark:text-slate-100">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-slate-800/80 dark:bg-[#0b1120]/90">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <a
            href="#top"
            aria-label="MINDGUIDE home"
            className="flex shrink-0 items-center gap-2 rounded-lg font-extrabold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/25">
              <BrainCircuit className="h-5 w-5" />
            </span>
            <span className="hidden sm:inline">MINDGUIDE</span>
          </a>

          <nav
            aria-label="Landing page navigation"
            className="ml-auto hidden items-center gap-7 lg:flex"
          >
            <a
              href="#benefits"
              className="rounded-md text-sm font-semibold text-slate-600 transition hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-300 dark:hover:text-indigo-300"
            >
              Why MINDGUIDE
            </a>
            <a
              href="#how-it-works"
              className="rounded-md text-sm font-semibold text-slate-600 transition hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-300 dark:hover:text-indigo-300"
            >
              How it works
            </a>
            <a
              href="#learning-trust"
              className="rounded-md text-sm font-semibold text-slate-600 transition hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-300 dark:hover:text-indigo-300"
            >
              Learning trust
            </a>
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-5">
            <button
              type="button"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
              title={isDark ? "Switch to light theme" : "Switch to dark theme"}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              {isDark ? (
                <Sun className="h-4.5 w-4.5" />
              ) : (
                <Moon className="h-4.5 w-4.5" />
              )}
            </button>
            <Link
              to="/login"
              className="inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-200 dark:hover:bg-slate-800 sm:px-4"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="hidden min-h-10 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0b1120] sm:inline-flex"
            >
              Start learning
            </Link>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="relative isolate overflow-hidden">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute left-1/2 top-0 h-[34rem] w-[52rem] -translate-x-1/2 rounded-full bg-indigo-200/55 blur-3xl dark:bg-indigo-700/20" />
            <div className="absolute -right-20 top-80 h-72 w-72 rounded-full bg-cyan-200/45 blur-3xl dark:bg-cyan-700/10" />
          </div>

          <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-28">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/80 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-indigo-700 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                <Sparkles className="h-3.5 w-3.5" />
                Reason Before Reveal
              </div>
              <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.08] tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
                Learn to solve it—
                <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-600 bg-clip-text text-transparent dark:from-indigo-300 dark:via-violet-300 dark:to-cyan-300">
                  not just see the answer.
                </span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300 sm:text-lg sm:leading-8">
                MINDGUIDE turns Quantitative Methods and Discrete Mathematics
                practice into a guided conversation—helping you understand,
                justify, compute, and interpret before the solution is revealed.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/signup"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 text-sm font-bold text-white shadow-xl shadow-indigo-600/25 transition hover:-translate-y-0.5 hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#050816]"
                >
                  Start learning
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white/80 px-6 text-sm font-bold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  Log in to continue
                </Link>
              </div>
              <ul className="mt-8 grid gap-3 text-sm font-semibold text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Guided, step-by-step practice
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Formative feedback from your work
                </li>
              </ul>
            </motion.div>

            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
              animate={
                reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }
              }
              transition={{ duration: 0.55, delay: 0.12, ease: "easeOut" }}
              aria-label="Preview of a MINDGUIDE reasoning session"
              className="relative mx-auto w-full max-w-xl"
            >
              <div className="absolute -inset-4 -z-10 rounded-[2.25rem] bg-gradient-to-br from-indigo-500/25 via-violet-500/15 to-cyan-500/20 blur-2xl" />
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-indigo-950/10 dark:border-slate-700/80 dark:bg-[#0b1120] dark:shadow-black/40">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white">
                      <BrainCircuit className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-slate-950 dark:text-white">
                        Guided reasoning
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Discrete Mathematics
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                    Stage 1 of 4
                  </span>
                </div>

                <div className="p-5 sm:p-6">
                  <div className="flex gap-2" aria-hidden="true">
                    {[0, 1, 2, 3].map((stage) => (
                      <span
                        key={stage}
                        className={`h-2 flex-1 rounded-full ${
                          stage === 0
                            ? "bg-indigo-600"
                            : "bg-slate-100 dark:bg-slate-800"
                        }`}
                      />
                    ))}
                  </div>

                  <p className="mt-6 text-xs font-bold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-400">
                    Problem Understanding
                  </p>
                  <h2 className="mt-2 text-lg font-bold leading-7 text-slate-950 dark:text-white">
                    Which facts are relevant, and what does the problem ask you
                    to determine?
                  </h2>

                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/70">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Your reasoning
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
                      I know the graph has six vertices, each with degree two.
                      I need to determine whether it contains an Euler circuit…
                    </p>
                    <span className="mt-3 block h-0.5 w-16 rounded-full bg-indigo-500" />
                  </div>

                  <button
                    type="button"
                    tabIndex={-1}
                    aria-hidden="true"
                    className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white"
                  >
                    Submit reasoning
                    <ArrowRight className="h-4 w-4" />
                  </button>

                  <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                    {[
                      ["Understand", "Active"],
                      ["Choose", "Locked"],
                      ["Solve", "Locked"],
                    ].map(([label, state], index) => (
                      <div
                        key={label}
                        className={`rounded-xl border p-2.5 ${
                          index === 0
                            ? "border-indigo-200 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/10"
                            : "border-slate-200 dark:border-slate-800"
                        }`}
                      >
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {label}
                        </p>
                        <p
                          className={`mt-1 text-[0.65rem] font-semibold ${
                            index === 0
                              ? "text-indigo-600 dark:text-indigo-400"
                              : "text-slate-400"
                          }`}
                        >
                          {state}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section
          id="benefits"
          aria-labelledby="benefits-heading"
          className="scroll-mt-20 border-y border-slate-200 bg-white py-20 dark:border-slate-800 dark:bg-[#0b1120]"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-400">
                A guide for the thinking part
              </p>
              <h2
                id="benefits-heading"
                className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl"
              >
                Practice the process, not just the result
              </h2>
              <p className="mt-4 leading-7 text-slate-600 dark:text-slate-300">
                Every session keeps the focus on your next useful decision,
                with support that responds to the reasoning you provide.
              </p>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {benefits.map(({ title, description, Icon, iconClassName }) => (
                <article
                  key={title}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/60"
                >
                  <span
                    className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${iconClassName}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 text-lg font-bold text-slate-950 dark:text-white">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          aria-labelledby="workflow-heading"
          className="scroll-mt-20 py-20 sm:py-24"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
              <div className="lg:sticky lg:top-28 lg:self-start">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-400">
                  How it works
                </p>
                <h2
                  id="workflow-heading"
                  className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl"
                >
                  Four stages between the problem and the reveal
                </h2>
                <p className="mt-5 leading-7 text-slate-600 dark:text-slate-300">
                  MINDGUIDE follows a consistent Socratic sequence so each
                  answer is supported by a clear chain of reasoning.
                </p>
                <div className="mt-7 inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                  <LockKeyhole className="h-4 w-4" />
                  Worked solution unlocks after reasoning
                </div>
              </div>

              <ol className="grid gap-4 sm:grid-cols-2">
                {stages.map((stage) => (
                  <li
                    key={stage.number}
                    className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                        {stage.number}
                      </span>
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition group-hover:bg-indigo-600 group-hover:text-white dark:bg-slate-800">
                        <Check className="h-4 w-4" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-bold text-slate-950 dark:text-white">
                      {stage.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                      {stage.description}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section
          id="learning-trust"
          aria-labelledby="trust-heading"
          className="scroll-mt-20 px-4 pb-20 sm:px-6 sm:pb-24 lg:px-8"
        >
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-blue-700 px-6 py-10 text-white shadow-2xl shadow-indigo-600/20 sm:px-10 sm:py-12 lg:px-14">
            <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl" />
            <div className="relative grid gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-center">
              <div>
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                  <Target className="h-5 w-5" />
                </span>
                <h2
                  id="trust-heading"
                  className="mt-5 text-3xl font-black tracking-tight sm:text-4xl"
                >
                  Guidance you can trace back to your own work
                </h2>
                <p className="mt-4 max-w-2xl leading-7 text-indigo-100">
                  Adaptive prompts respond to your submitted reasoning. Your
                  learning record, formative scorecard, and administrator
                  feedback keep the process visible for reflection and review.
                </p>
              </div>
              <div className="rounded-2xl border border-white/20 bg-slate-950/20 p-6 backdrop-blur-sm">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-indigo-100">
                  Designed for formative learning
                </p>
                <p className="mt-3 text-lg font-bold leading-7 text-white">
                  MINDGUIDE supports practice and critical-thinking reflection.
                  Its AI-supported feedback is not an official grade.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-white py-20 dark:border-slate-800 dark:bg-[#0b1120]">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
              <BrainCircuit className="h-6 w-6" />
            </span>
            <h2 className="mt-5 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Ready to reason through your next problem?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-600 dark:text-slate-300">
              Create your student account and begin a guided Quantitative
              Methods or Discrete Mathematics session.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to="/signup"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0b1120]"
              >
                Start learning
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/login"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 px-6 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                I already have an account
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0b1120]">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-7 text-sm text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200">
            <BrainCircuit className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            MINDGUIDE
          </div>
          <p>Reason before reveal. Learn through the process.</p>
        </div>
      </footer>
    </div>
  );
}

function ProfileLoading() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-3 bg-slate-50 p-6 dark:bg-[#050816]">
      <Loader2
        role="status"
        aria-label="Loading MINDGUIDE profile"
        className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400"
      />
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
        Loading your MINDGUIDE profile…
      </p>
    </div>
  );
}

function ProfileUnavailable({
  error,
  onRetry,
  onSignOut,
}: {
  error: string | null;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-slate-50 p-6 dark:bg-[#050816]">
      <div className="w-full max-w-md rounded-3xl border border-red-200 bg-white p-8 text-center shadow-xl shadow-slate-200/50 dark:border-red-900/70 dark:bg-slate-900 dark:shadow-black/30">
        <AlertCircle className="mx-auto mb-4 h-10 w-10 text-red-600 dark:text-red-400" />
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          Your profile is unavailable
        </h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          {error ||
            "Your sign-in succeeded, but MINDGUIDE could not read your Firestore profile."}
        </p>
        <div className="mt-6 grid gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Retry profile
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="w-full rounded-xl border border-slate-200 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
