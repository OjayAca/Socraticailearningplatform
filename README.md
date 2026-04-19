# SocratAI Learning Platform

> **Think First, Don't Copy First** — An AI-powered Socratic learning assistant.

SocratAI guides students through problems using the Socratic method. Instead of providing direct answers, the AI asks probing questions that develop critical thinking skills. Teachers can then review the student's thinking process and provide feedback.

## Features

- 🎯 **Socratic AI Questioning** — AI guides students step-by-step (never gives answers directly)
- 🛡️ **Answer-Block Filter** — Detects pasted answers and redirects to genuine reasoning
- 💡 **Progressive Hints** — 3-level hint system (subtle → moderate → strong)
- 🗺️ **Logic Map** — Visual representation of the student's reasoning process
- 📝 **Draft & Reflection** — Students write their answer, methodology, and reflections
- 📊 **Critical Thinking Score** — AI-evaluated score based on reasoning quality
- 👨‍🏫 **Teacher Dashboard** — Review submitted thinking logs, approve or return with feedback
- 🔐 **Firebase Authentication** — Email/password + Google OAuth
- ☁️ **Cloud Firestore** — Real-time data persistence

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | TailwindCSS v4 |
| State | Zustand |
| Auth & DB | Firebase (Spark Free Plan) |
| AI | Google Gemini 2.5 Flash (free tier) / Ollama (local) |
| Icons | Lucide React |
| Animation | Framer Motion |

## Getting Started

### Prerequisites

- Node.js 18+
- A [Firebase project](https://console.firebase.google.com/) (free Spark plan)
- A [Gemini API key](https://aistudio.google.com/apikey) (free) **or** [Ollama](https://ollama.com/) with Gemma 3

### Setup

1. **Clone and install:**
   ```bash
   git clone <repo-url>
   cd Socraticailearningplatform
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Fill in your Firebase config and Gemini API key in `.env`.

3. **Firebase Setup:**
   - Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com/)
   - Enable **Authentication** → Email/Password and Google providers
   - Enable **Cloud Firestore** → Start in test mode
   - Copy the web app config into your `.env` file

4. **Run locally:**
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:5173`.

### Using Ollama (Local AI)

If you prefer to use a local model instead of Gemini:

1. Install [Ollama](https://ollama.com/)
2. Pull Gemma 3: `ollama pull gemma3`
3. Set in `.env`:
   ```env
   VITE_AI_PROVIDER=ollama
   VITE_OLLAMA_BASE_URL=http://localhost:11434
   VITE_OLLAMA_MODEL=gemma3
   ```

## Project Structure

```
src/
├── app/
│   ├── components/
│   │   ├── AuthScreens.tsx         # Login, Signup, Role Selection
│   │   ├── StudentScreens.tsx      # Student Dashboard, Task Start
│   │   ├── TeacherScreens.tsx      # Teacher Dashboard, Review
│   │   ├── SessionScreensPart1.tsx # Trigger, Questioning, Hints, Logic Map
│   │   ├── SessionScreensPart2.tsx # Draft, Review, Log, Confirmation
│   │   └── ProtectedRoute.tsx      # Route guard
│   ├── App.tsx
│   └── routes.tsx
├── lib/
│   ├── firebase.ts      # Firebase init
│   ├── ai-config.ts     # AI provider config
│   ├── gemini.ts        # Gemini/Ollama client
│   ├── prompts.ts       # System prompts & templates
│   └── socratic-engine.ts # AI orchestration
├── stores/
│   ├── auth-store.ts    # Auth state (Zustand)
│   └── session-store.ts # Session state (Zustand)
└── types/
    └── index.ts         # TypeScript interfaces
```

## Team

Capstone project for CC-TECHNO32.

## License

See [ATTRIBUTIONS.md](./ATTRIBUTIONS.md) for third-party licenses.