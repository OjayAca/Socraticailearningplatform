import { useNavigate } from "react-router";
import { X, Send, User, Lightbulb, Map, ArrowRight, CornerDownRight, CheckCircle2, ChevronRight, HelpCircle } from "lucide-react";
import { motion } from "motion/react";

// Shared Session Layout
export function SessionLayout({ children, progress, showMap = false, currentStepText }: { children: React.ReactNode, progress: number, showMap?: boolean, currentStepText: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex h-full w-full bg-slate-50 overflow-hidden font-sans text-slate-900">
      
      {/* Main Workspace Area */}
      <div className={`flex flex-col flex-1 ${showMap ? 'w-2/3 border-r border-slate-200' : 'w-full'} transition-all duration-300`}>
        {/* Top Header */}
        <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">
                SA
              </div>
              <div>
                <h1 className="font-bold text-slate-800">Socratic Session: Math</h1>
                <p className="text-sm text-slate-500 font-medium">Topic: Quadratic Equations</p>
              </div>
            </div>
            <button 
              onClick={() => navigate("/student/dashboard")}
              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
              title="Exit Session"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="w-full space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
              <span>{currentStepText}</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div className="bg-indigo-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        </header>

        {/* Chat / Interaction Area */}
        <div className="flex-1 bg-slate-50 overflow-y-auto p-6 pb-20 flex flex-col gap-6 scroll-smooth">
          {children}
        </div>
      </div>

      {/* Logic Map Panel (Screen 10+) */}
      {showMap && (
        <div className="w-1/3 bg-white flex flex-col border-l border-slate-200">
          <div className="p-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
            <Map className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-slate-800">Logic Map</h2>
          </div>
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            <div className="relative pl-6 space-y-8 before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
              
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-6 h-6 rounded-full border border-white bg-indigo-600 shadow shrink-0 z-10 text-white font-bold text-xs -ml-[11px] md:mx-auto">1</div>
                <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] bg-white p-4 rounded-xl border border-indigo-100 shadow-sm shadow-indigo-50">
                  <h3 className="font-bold text-slate-800 text-sm">Identify Goal</h3>
                  <p className="text-xs text-slate-500 mt-1">Find roots of x² - 5x + 6 = 0</p>
                </div>
              </div>

              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-6 h-6 rounded-full border border-white bg-indigo-600 shadow shrink-0 z-10 text-white font-bold text-xs -ml-[11px] md:mx-auto">2</div>
                <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] bg-white p-4 rounded-xl border border-indigo-100 shadow-sm shadow-indigo-50">
                  <h3 className="font-bold text-slate-800 text-sm">Choose Method</h3>
                  <p className="text-xs text-slate-500 mt-1">Factoring vs Quadratic Formula</p>
                </div>
              </div>
              
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-6 h-6 rounded-full border border-white bg-slate-200 shadow shrink-0 z-10 text-slate-500 font-bold text-xs -ml-[11px] md:mx-auto">3</div>
                <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] bg-slate-50 p-4 rounded-xl border border-slate-200 border-dashed shadow-sm">
                  <h3 className="font-semibold text-slate-500 text-sm">Execute Steps</h3>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Chat Bubbles Components
function StudentBubble({ text }: { text: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end gap-3 w-full max-w-2xl ml-auto">
      <div className="bg-indigo-600 text-white p-4 rounded-2xl rounded-tr-sm shadow-sm shadow-indigo-100/50 flex-1">
        <p className="text-sm font-medium leading-relaxed">{text}</p>
      </div>
      <div className="w-8 h-8 rounded-full bg-indigo-100 flex-shrink-0 flex items-center justify-center text-indigo-700 font-bold text-xs shadow-sm">
        AS
      </div>
    </motion.div>
  );
}

function AIBubble({ text, children }: { text?: string, children?: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 w-full max-w-2xl mr-auto">
      <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex-shrink-0 flex items-center justify-center text-indigo-600 font-bold text-xs shadow-sm shadow-slate-100">
        SA
      </div>
      <div className="bg-white p-4 rounded-2xl rounded-tl-sm border border-slate-200 shadow-sm shadow-slate-100 flex-1 space-y-4">
        {text && <p className="text-sm text-slate-700 font-medium leading-relaxed">{text}</p>}
        {children}
      </div>
    </motion.div>
  );
}

// Common Chat Input
function ChatInput({ onAction, buttonText = "Submit Response" }: { onAction: () => void, buttonText?: string }) {
  return (
    <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex items-end gap-2 max-w-2xl w-full mx-auto mt-auto">
      <textarea 
        rows={2} 
        className="w-full resize-none outline-none p-3 text-sm text-slate-800" 
        placeholder="Type your response here..."
      ></textarea>
      <div className="flex flex-col gap-2 p-1">
        <button 
          onClick={onAction}
          className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-xl transition-colors shadow-md shadow-indigo-200"
          title={buttonText}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Screen 6
export function SessionTrigger() {
  const navigate = useNavigate();
  return (
    <SessionLayout progress={10} currentStepText="Step 1: Initial Filter">
      <StudentBubble text="What is the answer to x² - 5x + 6 = 0?" />
      
      <AIBubble>
        <div className="space-y-4">
          <p className="text-sm text-slate-700 font-medium leading-relaxed">
            I won't give you the final answer right away. Remember our goal: <span className="text-indigo-600 font-bold">Think First, Don't Copy First.</span>
          </p>
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-2">
            <h4 className="font-bold text-indigo-900 text-sm flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-indigo-600" /> Let's figure this out together.
            </h4>
            <p className="text-sm text-indigo-800">To start, what kind of equation are we looking at?</p>
          </div>
          
          <div className="flex items-center gap-3 pt-2">
            <button 
              onClick={() => navigate("/session/questioning")}
              className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors shadow-sm"
            >
              Proceed to Questioning
            </button>
            <button 
              onClick={() => navigate("/student/dashboard")}
              className="text-slate-500 hover:text-slate-700 px-4 py-2 font-semibold text-sm"
            >
              Exit Session
            </button>
          </div>
        </div>
      </AIBubble>
    </SessionLayout>
  );
}

// Screen 7
export function SessionQuestioning() {
  const navigate = useNavigate();
  return (
    <SessionLayout progress={20} currentStepText="Step 1 of 5: Questioning">
      <StudentBubble text="What is the answer to x² - 5x + 6 = 0?" />
      <AIBubble text="I won't give you the final answer right away. Let's figure this out together. To start, what kind of equation are we looking at?" />
      
      <div className="mt-auto">
        <div className="max-w-2xl mx-auto flex justify-start mb-2">
          <button 
            onClick={() => navigate("/session/hints")}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" /> I need a hint
          </button>
        </div>
        <ChatInput onAction={() => navigate("/session/productive")} />
      </div>
    </SessionLayout>
  );
}

// Screen 8
export function SessionProductive() {
  const navigate = useNavigate();
  return (
    <SessionLayout progress={40} currentStepText="Step 2 of 5: Applying Concepts">
      <StudentBubble text="What is the answer to x² - 5x + 6 = 0?" />
      <AIBubble text="I won't give you the final answer right away. Let's figure this out together. To start, what kind of equation are we looking at?" />
      <StudentBubble text="It has an x squared, so I think it's a quadratic equation." />
      
      <AIBubble>
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg w-max font-semibold text-xs border border-emerald-100">
            <CheckCircle2 className="w-4 h-4" /> Good start!
          </div>
          <p className="text-sm text-slate-700 font-medium leading-relaxed">
            Spot on. Now, what formula or concept might apply to solve a quadratic equation?
          </p>
        </div>
      </AIBubble>

      <div className="mt-auto">
        <div className="max-w-2xl mx-auto flex justify-start mb-2">
          <button 
            onClick={() => navigate("/session/hints")}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" /> I need a hint
          </button>
        </div>
        <ChatInput onAction={() => navigate("/session/logic-map")} />
      </div>
    </SessionLayout>
  );
}

// Screen 9
export function SessionHints() {
  const navigate = useNavigate();
  return (
    <SessionLayout progress={20} currentStepText="Step 1 of 5: Questioning (Hint Provided)">
      <StudentBubble text="What is the answer to x² - 5x + 6 = 0?" />
      <AIBubble text="I won't give you the final answer right away. Let's figure this out together. To start, what kind of equation are we looking at?" />
      
      <div className="max-w-2xl mr-auto w-full">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm relative ml-11 space-y-4">
          <div className="absolute -left-3 top-4 w-3 h-3 bg-amber-50 border-t border-l border-amber-200 rotate-45 transform"></div>
          
          <div className="flex items-center gap-2 text-amber-800 font-bold text-sm mb-2">
            <Lightbulb className="w-4 h-4" /> Progressive Hints
          </div>

          <div className="space-y-3">
            <div className="flex gap-3 items-start">
              <span className="w-5 h-5 bg-amber-200 text-amber-800 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">1</span>
              <p className="text-sm text-amber-900 font-medium">Identify the highest power of 'x' in the given data.</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="w-5 h-5 bg-amber-200 text-amber-800 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">2</span>
              <p className="text-sm text-amber-900 font-medium">Recall the related concept: equations with x² are called...?</p>
            </div>
          </div>

          <button 
            onClick={() => navigate("/session/productive")}
            className="bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold px-4 py-2 rounded-lg text-sm transition-colors mt-2"
          >
            Got it, Try Again
          </button>
        </div>
      </div>
    </SessionLayout>
  );
}

// Screen 10
export function SessionLogicMap() {
  const navigate = useNavigate();
  return (
    <SessionLayout progress={60} showMap={true} currentStepText="Step 3 of 5: Execution">
      <StudentBubble text="What is the answer to x² - 5x + 6 = 0?" />
      <AIBubble text="To start, what kind of equation are we looking at?" />
      <StudentBubble text="It has an x squared, so I think it's a quadratic equation." />
      <AIBubble text="Good start! Now, what formula or concept might apply?" />
      <StudentBubble text="We can factor it or use the quadratic formula." />
      
      <AIBubble>
        <p className="text-sm text-slate-700 font-medium leading-relaxed">
          Excellent reasoning. Factoring looks easiest here. What two numbers multiply to 6 and add to -5?
        </p>
      </AIBubble>

      <div className="mt-auto">
        <ChatInput onAction={() => navigate("/session/draft")} />
      </div>
    </SessionLayout>
  );
}
