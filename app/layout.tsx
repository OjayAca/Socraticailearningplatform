import type { Metadata, Viewport } from "next";
import Providers from "./providers";
import "../src/styles/index.css";

export const metadata: Metadata = {
  title: "MINDGUIDE - Reason Before Reveal",
  description: "MINDGUIDE is a formative Socratic learning platform for guided Quantitative Methods and Discrete Mathematics problem-solving.",
  icons: { icon: "/mindguide-logo.png", apple: "/mindguide-logo.png" },
  openGraph: { title: "MINDGUIDE — Reason Before Reveal", description: "Build your reasoning through guided Quantitative Methods and Discrete Mathematics practice.", type: "website", images: ["/mindguide-logo.png"] },
};
export const viewport: Viewport = { themeColor: "#4f46e5" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" style={{ height: "100%" }} suppressHydrationWarning>
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
    </head>
    {/* Grammar extensions can add body attributes before React hydrates. */}
    <body suppressHydrationWarning style={{ height: "100%", margin: 0, fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
      <Providers>
        <div id="root" style={{ height: "100%" }}>{children}</div>
      </Providers>
    </body>
  </html>;
}
