import { useNavigate } from "react-router";
import { Check, Edit3, MessageSquare, Download, Share, User, Save, FileText, CheckCircle2, FileCheck, ArrowRight, BrainCircuit, Activity } from "lucide-react";
import { SessionLayout } from "./SessionScreensPart1";
import { motion } from "motion/react";

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

// Screen 11
export function SessionDraft() {
  const navigate = useNavigate();
  return (
    <SessionLayout progress={80} showMap={true} currentStepText="Step 4 of 5: Draft & Reflection">
      <AIBubble text="What two numbers multiply to 6 and add to -5?" />
      <StudentBubble text="-2 and -3. So (x - 2)(x - 3) = 0." />
      
      <div className="max-w-2xl mr-auto w-full mt-4">
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-6 shadow-sm space-y-6 ml-11">
          <div className="flex items-center gap-2 text-indigo-800 font-bold text-lg border-b border-indigo-200/50 pb-2">
            <Edit3 className="w-5 h-5" /> Draft Answer Stage
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-indigo-900 block">Write your current answer:</label>
              <textarea 
                rows={3}
                defaultValue="The roots are x = 2 and x = 3."
                className="w-full p-3 rounded-xl border border-indigo-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-800 bg-white"
              ></textarea>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-bold text-indigo-900 block">Why did you choose this method?</label>
              <textarea 
                rows={2}
                placeholder="Explain your reasoning..."
                className="w-full p-3 rounded-xl border border-indigo-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-800 bg-white"
              ></textarea>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-indigo-900 block">What part was most difficult?</label>
              <textarea 
                rows={2}
                placeholder="Reflect on the challenge..."
                className="w-full p-3 rounded-xl border border-indigo-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-800 bg-white"
              ></textarea>
            </div>
          </div>

          <button 
            onClick={() => navigate("/session/review")}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors shadow-md shadow-indigo-200 flex items-center justify-center gap-2"
          >
            Submit Draft Answer
            <CheckCircle2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </SessionLayout>
  );
}

// Screen 12
export function SessionReview() {
  const navigate = useNavigate();
  return (
    <SessionLayout progress={100} showMap={true} currentStepText="Step 5 of 5: Final Review">
      <AIBubble>
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg w-max font-bold text-sm border border-emerald-100">
            <CheckCircle2 className="w-4 h-4" /> Great job!
          </div>
          <p className="text-sm text-slate-700 font-medium leading-relaxed">
            You've shown enough effort! Let's review the steps you took to arrive at the solution.
          </p>
          
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <h4 className="font-bold text-slate-800 text-sm">Summary of your steps:</h4>
            <ul className="text-sm text-slate-600 space-y-2 font-medium">
              <li className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs shrink-0 mt-0.5">1</div>
                Identified the equation type (Quadratic)
              </li>
              <li className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs shrink-0 mt-0.5">2</div>
                Chose the factoring method
              </li>
              <li className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs shrink-0 mt-0.5">3</div>
                Found factors (-2 and -3)
              </li>
              <li className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs shrink-0 mt-0.5"><Check className="w-3 h-3"/></div>
                Final Draft: <span className="font-bold text-slate-800 ml-1">x = 2, x = 3</span>
              </li>
            </ul>
          </div>
        </div>
      </AIBubble>

      <div className="max-w-2xl mx-auto w-full mt-6">
        <button 
          onClick={() => navigate("/session/log")}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl transition-colors shadow-lg shadow-indigo-200/50 flex items-center justify-center gap-2 text-lg"
        >
          Reveal Final Guided Explanation
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </SessionLayout>
  );
}

// Screen 13
export function SessionLog() {
  const navigate = useNavigate();
  return (
    <div className="flex-1 w-full bg-slate-50 h-full overflow-y-auto p-4 md:p-8 pb-20">
      <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        
        <div className="bg-indigo-600 p-8 text-white flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Thinking Log Generated</h1>
            <p className="text-indigo-200 mt-1">Session ID: #MATH-4092</p>
          </div>
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
            <FileText className="w-8 h-8 text-white" />
          </div>
        </div>

        <div className="p-8 space-y-8">
          <div className="space-y-4">
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
              <h3 className="font-bold text-slate-500 text-xs uppercase tracking-wider mb-2">Original Question</h3>
              <p className="text-slate-800 font-medium text-lg">What is the answer to x² - 5x + 6 = 0?</p>
            </div>
            
            <div>
              <h3 className="font-bold text-slate-500 text-xs uppercase tracking-wider mb-4 mt-8">Full Chat History</h3>
              <div className="space-y-6">
                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 shrink-0 flex items-center justify-center text-indigo-700 font-bold text-xs mt-1">AS</div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <p className="text-sm font-medium text-slate-800">What is the answer to x² - 5x + 6 = 0?</p>
                  </div>
                </div>
                <div className="flex gap-4 items-start flex-row-reverse">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 shrink-0 flex items-center justify-center text-white font-bold text-xs mt-1">SA</div>
                  <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
                    <p className="text-sm font-medium text-indigo-900">I won't give you the final answer right away... To start, what kind of equation are we looking at?</p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 shrink-0 flex items-center justify-center text-indigo-700 font-bold text-xs mt-1">AS</div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <p className="text-sm font-medium text-slate-800">It has an x squared, so I think it's a quadratic equation.</p>
                  </div>
                </div>
                {/* Simulated fading out history... */}
                <div className="py-4 text-center">
                  <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full uppercase tracking-wider">12 Messages Hidden</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-slate-200">
            <button className="flex-1 bg-white border-2 border-slate-200 text-slate-700 hover:border-slate-300 font-bold py-3 px-4 rounded-xl transition-colors flex justify-center items-center gap-2">
              <Download className="w-5 h-5" /> Download PDF
            </button>
            <button className="flex-1 bg-white border-2 border-slate-200 text-slate-700 hover:border-slate-300 font-bold py-3 px-4 rounded-xl transition-colors flex justify-center items-center gap-2">
              <Save className="w-5 h-5" /> Save Log
            </button>
            <button 
              onClick={() => navigate("/session/confirmation")}
              className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-md flex justify-center items-center gap-2"
            >
              <Share className="w-5 h-5" /> Submit to Teacher
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Screen 14
export function SessionConfirmation() {
  const navigate = useNavigate();
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 h-full p-6 pb-20">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl shadow-slate-200 border border-slate-100 text-center space-y-8"
      >
        <div className="mx-auto w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: 0.2 }}
          >
            <FileCheck className="w-12 h-12 text-emerald-600" />
          </motion.div>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-900">Successfully Submitted!</h2>
          <p className="text-slate-500 font-medium">Your Thinking Log has been sent to Mrs. Davis.</p>
        </div>

        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 space-y-4">
          <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider text-left border-b border-slate-200 pb-2">Session Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-slate-600 text-sm font-medium flex items-center gap-2"><BrainCircuit className="w-4 h-4"/> Critical Thinking</span>
              <span className="font-bold text-emerald-600">+15 pts</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600 text-sm font-medium flex items-center gap-2"><Activity className="w-4 h-4"/> Task Completion</span>
              <span className="font-bold text-slate-900">100%</span>
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-4">
          <button 
            onClick={() => navigate("/student/dashboard")}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-colors shadow-md"
          >
            Return to Dashboard
          </button>
          <button 
            onClick={() => navigate("/student/task")}
            className="w-full bg-white hover:bg-slate-50 text-indigo-600 border border-indigo-100 font-bold py-3.5 rounded-xl transition-colors shadow-sm"
          >
            Start New Session
          </button>
        </div>
      </motion.div>
    </div>
  );
}
