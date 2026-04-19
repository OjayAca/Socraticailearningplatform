import { useNavigate } from "react-router";
import { Plus, History, Activity, Bell, Settings, User, BookOpen, BrainCircuit, Upload, ChevronRight } from "lucide-react";
import { motion } from "motion/react";

// Layout wrapper for Student Dashboard/Task
function StudentLayout({ children, activeTab }: { children: React.ReactNode, activeTab: string }) {
  return (
    <div className="flex flex-col md:flex-row h-full w-full bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <div className="w-full md:w-64 bg-white border-r border-slate-200 flex-shrink-0 flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <span className="font-bold text-xl tracking-tight text-slate-900">SocratAI</span>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          <button className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium text-sm ${activeTab === 'dashboard' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>
            <Activity className="w-5 h-5" /> Dashboard
          </button>
          <button className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium text-sm ${activeTab === 'history' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>
            <History className="w-5 h-5" /> Previous Sessions
          </button>
          <button className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium text-sm ${activeTab === 'notifications' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>
            <Bell className="w-5 h-5" /> Notifications
          </button>
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-2">
          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-600 hover:text-slate-900 transition-colors font-medium text-sm">
            <User className="w-5 h-5" /> Profile
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-600 hover:text-slate-900 transition-colors font-medium text-sm">
            <Settings className="w-5 h-5" /> Settings
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-slate-200 z-10 px-8 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800">Welcome, Alex! 👋</h1>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-slate-900">Alex Student</p>
              <p className="text-xs text-slate-500">Grade 10 • Science</p>
            </div>
            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold border-2 border-white shadow-sm">
              AS
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

// Screen 4
export function StudentDashboard() {
  const navigate = useNavigate();
  return (
    <StudentLayout activeTab="dashboard">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-8">
        
        {/* Progress Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center mb-2">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <span className="text-slate-500 text-sm font-medium">Critical Thinking Score</span>
            <span className="text-3xl font-bold text-slate-900">85<span className="text-lg text-slate-400">/100</span></span>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center mb-2">
              <Activity className="w-5 h-5" />
            </div>
            <span className="text-slate-500 text-sm font-medium">Tasks Completed</span>
            <span className="text-3xl font-bold text-slate-900">24</span>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2">
            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center mb-2">
              <BookOpen className="w-5 h-5" />
            </div>
            <span className="text-slate-500 text-sm font-medium">Current Streak</span>
            <span className="text-3xl font-bold text-slate-900">5 Days</span>
          </div>
        </div>

        {/* Start New Session CTA */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-3xl p-8 text-white flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl shadow-indigo-200/50">
          <div className="space-y-2 text-center sm:text-left">
            <h2 className="text-2xl font-bold">Ready to tackle a new problem?</h2>
            <p className="text-indigo-100 max-w-md">Start a new guided session. Remember, we focus on the process, not just the answer.</p>
          </div>
          <button 
            onClick={() => navigate("/student/task")}
            className="flex-shrink-0 bg-white text-indigo-600 px-6 py-4 rounded-xl font-bold hover:bg-slate-50 transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Start New Session
          </button>
        </div>

        {/* Recent Activity */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900">Recent Sessions</h3>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 sm:p-6 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Quadratic Equations Practice</h4>
                    <p className="text-sm text-slate-500">Math • 2 days ago</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="hidden sm:inline-flex items-center px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">Completed</span>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </div>
              </div>
            ))}
          </div>
        </div>

      </motion.div>
    </StudentLayout>
  );
}

// Screen 5
export function TaskStart() {
  const navigate = useNavigate();
  return (
    <StudentLayout activeTab="dashboard">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-3xl mx-auto">
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 p-8 space-y-8">
          
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-slate-900">Start a New Task</h2>
            <p className="text-slate-500">What do you need help with today?</p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Select Subject</label>
              <select defaultValue="" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none appearance-none bg-white text-slate-800 font-medium">
                <option value="" disabled>Choose a subject...</option>
                <option value="math">Mathematics</option>
                <option value="science">Science</option>
                <option value="history">History</option>
                <option value="english">English / Literature</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Your Question or Problem</label>
              <textarea 
                rows={5}
                placeholder="Type or paste the problem you're trying to solve..."
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none resize-none text-slate-800"
              ></textarea>
            </div>

            <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-2 hover:bg-slate-50 hover:border-indigo-400 transition-colors cursor-pointer group">
              <div className="w-12 h-12 bg-slate-100 group-hover:bg-indigo-50 text-slate-500 group-hover:text-indigo-600 rounded-full flex items-center justify-center transition-colors mb-2">
                <Upload className="w-6 h-6" />
              </div>
              <h4 className="font-semibold text-slate-700 group-hover:text-indigo-700">Upload an image or file</h4>
              <p className="text-sm text-slate-500">JPG, PNG, PDF up to 10MB</p>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between border-t border-slate-100">
            <button 
              onClick={() => navigate(-1)}
              className="text-slate-500 hover:text-slate-700 font-semibold px-4 py-2 transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={() => navigate("/session/trigger")}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 py-3 rounded-xl transition-all shadow-md shadow-indigo-200 flex items-center gap-2"
            >
              Start Guidance
              <BrainCircuit className="w-4 h-4" />
            </button>
          </div>

        </div>
      </motion.div>
    </StudentLayout>
  );
}
