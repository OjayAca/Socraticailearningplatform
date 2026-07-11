
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";

if (import.meta.env.DEV && window.location.hostname === "127.0.0.1") {
  const localUrl = new URL(window.location.href);
  localUrl.hostname = "localhost";
  window.location.replace(localUrl.toString());
} else {
  createRoot(document.getElementById("root")!).render(<App />);
}
  
