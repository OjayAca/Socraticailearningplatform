"use client";

import dynamic from "next/dynamic";

// Retain the existing browser router and UI without running Firebase or DOM code in SSR.
const App = dynamic(() => import("../src/app/App"), { ssr: false });

export default function ClientApp() { return <App />; }
