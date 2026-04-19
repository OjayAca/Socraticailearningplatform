import { useNavigate } from "react-router";
import { Users, FileText, Download, CheckCircle, Search, MessageSquare, ExternalLink, ChevronRight, CheckCircle2, AlertCircle } from "lucide-react";
import { motion } from "motion/react";

// Layout wrapper for Teacher Dashboard
function TeacherLayout({ children, activeTab }: { children: React.ReactNode, activeTab: string }) {
  return (
    <div className="flex flex-col md:flex-row h-full w-full bg-slate-50 overflow-hidden font-sans">
      {/* Sidebar */}
      <div className="w-full md:w-64 bg-slate-900 text-slate-300 flex-shrink-0 flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-slate-900">
            <Users className="w-5 h-5" />
          </div>
          <span className="font-bold text-xl tracking-tight text-white">SocratAI Ed</span>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          <button className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium text-sm ${activeTab === 'dashboard' ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-slate-800 text-slate-400'}`}>
            <FileText className="w-5 h-5" /> Submissions
          </button>
          <button className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium text-sm ${activeTab === 'students' ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-slate-800 text-slate-400'}`}>
            <Users className="w-5 h-5" /> My Students
          </button>
          <button className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium text-sm hover:bg-slate-800 text-slate-400`}>
            <Download className="w-5 h-5" /> Export Reports
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        <header className="sticky top-0 bg-white border-b border-slate-200 z-10 px-8 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800">Teacher Dashboard</h1>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-slate-900">Mrs. Davis</p>
              <p className="text-xs text-slate-500 font-medium">Math Dept</p>
            </div>
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold border-2 border-white shadow-sm">
              MD
            </div>
          </div>
        </header>
        <main className="p-8 pb-24">
          {children}
        </main>
      </div>
    </div>
  );
}

// Screen 15
export function TeacherDashboard() {
  const navigate = useNavigate();
  return (
    <TeacherLayout activeTab="dashboard">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-slate-900">Recent Thinking Logs</h2>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="h-4 w-4" />
            </div>
            <input 
              type="text" 
              placeholder="Search student or session..." 
              className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none w-full sm:w-64"
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-bold">
                <th className="p-4">Student</th>
                <th className="p-4">Session Detail</th>
                <th className="p-4">CT Score</th>
                <th className="p-4">Status</th>
                <th className="p-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="hover:bg-slate-50 transition-colors group">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">AS</div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">Alex Student</p>
                      <p className="text-xs text-slate-500">Grade 10</p>
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <p className="font-semibold text-slate-800 text-sm">#MATH-4092</p>
                  <p className="text-xs text-slate-500 truncate w-48">Quadratic Equations Practice</p>
                </td>
                <td className="p-4">
                  <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 font-bold px-2 py-1 rounded text-xs">
                    85/100
                  </span>
                </td>
                <td className="p-4">
                  <span className="inline-flex items-center gap-1 text-amber-600 font-bold text-xs bg-amber-50 px-2 py-1 rounded">
                    <AlertCircle className="w-3 h-3" /> Needs Review
                  </span>
                </td>
                <td className="p-4">
                  <button 
                    onClick={() => navigate("/teacher/review")}
                    className="bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700 font-bold px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
                  >
                    Review <ChevronRight className="w-4 h-4" />
                  </button>
                </td>
              </tr>
              <tr className="hover:bg-slate-50 transition-colors group">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-700 font-bold text-xs">SM</div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">Sarah Miller</p>
                      <p className="text-xs text-slate-500">Grade 10</p>
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <p className="font-semibold text-slate-800 text-sm">#SCI-3911</p>
                  <p className="text-xs text-slate-500 truncate w-48">Kinematics Motion</p>
                </td>
                <td className="p-4">
                  <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 font-bold px-2 py-1 rounded text-xs">
                    92/100
                  </span>
                </td>
                <td className="p-4">
                  <span className="inline-flex items-center gap-1 text-slate-500 font-bold text-xs bg-slate-100 px-2 py-1 rounded">
                    <CheckCircle className="w-3 h-3" /> Reviewed
                  </span>
                </td>
                <td className="p-4">
                  <button className="bg-slate-50 hover:bg-slate-200 text-slate-600 font-bold px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2">
                    View <ExternalLink className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

      </motion.div>
    </TeacherLayout>
  );
}

// Screen 16
export function TeacherReview() {
  const navigate = useNavigate();
  return (
    <TeacherLayout activeTab="dashboard">
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Col: The Thinking Log */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/teacher/dashboard")} className="text-slate-400 hover:text-slate-800 transition-colors">
              <ChevronRight className="w-6 h-6 rotate-180" />
            </button>
            <h2 className="text-2xl font-bold text-slate-900">Reviewing Alex's Log</h2>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <h3 className="font-bold text-slate-500 text-xs uppercase tracking-wider mb-2">Original Question</h3>
              <p className="text-slate-800 font-semibold text-lg">What is the answer to x² - 5x + 6 = 0?</p>
            </div>

            <div className="space-y-4">
              <h3 className="font-bold text-slate-800 text-sm">AI Guidance Summary</h3>
              
              <div className="border-l-2 border-emerald-500 pl-4 py-1 space-y-1">
                <p className="text-sm text-slate-600"><span className="font-bold text-slate-800">Identified goal:</span> Solve quadratic equation</p>
                <p className="text-sm text-slate-600"><span className="font-bold text-slate-800">Method selected:</span> Factoring</p>
                <p className="text-sm text-slate-600"><span className="font-bold text-slate-800">Final Answer:</span> x = 2, x = 3</p>
              </div>

              <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                <h4 className="font-bold text-indigo-900 text-sm flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-indigo-600" /> Student Reflection
                </h4>
                <p className="text-sm text-indigo-800 italic">"I chose factoring because it was easier to see that 2 and 3 multiply to 6 and add to 5. The hardest part was remembering the signs."</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Feedback Form */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sticky top-24">
            <h3 className="font-bold text-slate-900 text-lg mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-emerald-600" /> Teacher Feedback
            </h3>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Add Comments for Alex</label>
                <textarea 
                  rows={5}
                  defaultValue="Great job identifying the factoring method early on! Just be careful with the negative signs next time."
                  className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 text-sm text-slate-800 bg-slate-50"
                ></textarea>
              </div>

              <div className="pt-4 border-t border-slate-100 flex flex-col gap-3">
                <button 
                  onClick={() => navigate("/teacher/dashboard")}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl transition-colors shadow-md shadow-emerald-200 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" /> Approve Submission
                </button>
                <button className="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold py-3.5 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-500" /> Return for Revision
                </button>
              </div>
            </div>
          </div>
        </div>

      </motion.div>
    </TeacherLayout>
  );
}
