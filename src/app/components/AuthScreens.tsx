import { useNavigate } from "react-router";
import { BrainCircuit, Mail, Lock, User, GraduationCap, ArrowRight } from "lucide-react";
import { motion } from "motion/react";

// Screen 1
export function Splash() {
  const navigate = useNavigate();
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-100 h-full p-6 pb-20">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-6 max-w-sm w-full"
      >
        <div className="w-24 h-24 bg-indigo-600 text-white rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-200">
          <BrainCircuit className="w-12 h-12" />
        </div>
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">SocratAI</h1>
          <p className="text-lg text-indigo-600 font-medium">Think First, Don't Copy First</p>
        </div>
        
        <div className="w-full space-y-3 mt-12">
          <button 
            onClick={() => navigate("/login")}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 rounded-xl transition-all shadow-md shadow-indigo-100 flex justify-center items-center gap-2"
          >
            Log In
          </button>
          <button 
            onClick={() => navigate("/signup")}
            className="w-full bg-white hover:bg-slate-50 text-indigo-600 font-semibold py-4 rounded-xl transition-all border border-indigo-100 shadow-sm"
          >
            Sign Up
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// Screen 2
export function Login() {
  const navigate = useNavigate();
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 h-full p-6 pb-20">
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="w-full max-w-md bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 space-y-8"
      >
        <div className="space-y-2 text-center">
          <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BrainCircuit className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Welcome Back</h2>
          <p className="text-slate-500 text-sm">Log in to continue your learning journey.</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 block">Email or Username</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Mail className="h-5 w-5" />
              </div>
              <input 
                type="text" 
                placeholder="you@example.com" 
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all outline-none"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700 block">Password</label>
              <a href="#" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">Forgot password?</a>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="h-5 w-5" />
              </div>
              <input 
                type="password" 
                placeholder="••••••••" 
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all outline-none"
              />
            </div>
          </div>
        </div>

        <button 
          onClick={() => navigate("/role")}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 rounded-xl transition-all shadow-md flex justify-center items-center gap-2"
        >
          Log In
          <ArrowRight className="w-4 h-4" />
        </button>
      </motion.div>
    </div>
  );
}

// Screen 3
export function RoleSelection() {
  const navigate = useNavigate();
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 h-full p-6 pb-20">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg space-y-8"
      >
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-slate-900">Welcome back, Alex!</h2>
          <p className="text-slate-500">How are you using SocratAI today?</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button 
            onClick={() => navigate("/student/dashboard")}
            className="group p-8 bg-white border-2 border-slate-100 hover:border-indigo-600 rounded-3xl transition-all shadow-sm hover:shadow-xl hover:shadow-indigo-100 flex flex-col items-center gap-4 text-center"
          >
            <div className="w-20 h-20 bg-indigo-50 group-hover:bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center transition-colors">
              <User className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Student</h3>
              <p className="text-slate-500 text-sm mt-2">I want to learn and solve problems step-by-step.</p>
            </div>
          </button>

          <button 
            onClick={() => navigate("/teacher/dashboard")}
            className="group p-8 bg-white border-2 border-slate-100 hover:border-emerald-600 rounded-3xl transition-all shadow-sm hover:shadow-xl hover:shadow-emerald-100 flex flex-col items-center gap-4 text-center"
          >
            <div className="w-20 h-20 bg-emerald-50 group-hover:bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center transition-colors">
              <GraduationCap className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Teacher</h3>
              <p className="text-slate-500 text-sm mt-2">I want to review logs and support my students.</p>
            </div>
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// Sign Up Screen
export function SignUp() {
  const navigate = useNavigate();
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 h-full p-6 pb-20">
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="w-full max-w-md bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 space-y-8"
      >
        <div className="space-y-2 text-center">
          <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BrainCircuit className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Create an Account</h2>
          <p className="text-slate-500 text-sm">Join SocratAI to start your learning journey.</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 block">Full Name</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <User className="h-5 w-5" />
              </div>
              <input 
                type="text" 
                placeholder="Alex Student" 
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all outline-none"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 block">Email</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Mail className="h-5 w-5" />
              </div>
              <input 
                type="email" 
                placeholder="you@example.com" 
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all outline-none"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 block">Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="h-5 w-5" />
              </div>
              <input 
                type="password" 
                placeholder="Create a password" 
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all outline-none"
              />
            </div>
          </div>
        </div>

        <button 
          onClick={() => navigate("/role")}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 rounded-xl transition-all shadow-md flex justify-center items-center gap-2"
        >
          Sign Up
          <ArrowRight className="w-4 h-4" />
        </button>

        <div className="text-center text-sm text-slate-600">
          Already have an account?{" "}
          <button 
            onClick={() => navigate("/login")}
            className="font-semibold text-indigo-600 hover:text-indigo-700 transition-colors inline-flex"
          >
            Log in
          </button>
        </div>
      </motion.div>
    </div>
  );
}
