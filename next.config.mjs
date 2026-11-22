// Only these existing public Firebase identifiers are forwarded from the original .env.
const publicKeys = [
  "FIREBASE_API_KEY", "FIREBASE_AUTH_DOMAIN", "FIREBASE_PROJECT_ID",
  "FIREBASE_STORAGE_BUCKET", "FIREBASE_MESSAGING_SENDER_ID", "FIREBASE_APP_ID",
  "FIREBASE_MEASUREMENT_ID", "RECAPTCHA_ENTERPRISE_SITE_KEY",
];

const isDevelopment = process.env.NODE_ENV === "development";
const isHostedHttpsDeployment = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} https://apis.google.com https://accounts.google.com https://www.gstatic.com https://www.google.com https://www.recaptcha.net`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://www.gstatic.com",
  "media-src 'self' blob:",
  `connect-src 'self' https://*.googleapis.com wss://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://www.google.com https://www.recaptcha.net${isDevelopment ? " ws://localhost:* http://localhost:*" : ""}`,
  "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://www.google.com https://www.recaptcha.net https://recaptcha.google.com",
  "worker-src 'self' blob:",
  ...(isHostedHttpsDeployment ? ["upgrade-insecure-requests"] : []),
].join("; ");

export default {
  poweredByHeader: false,
  experimental: {
    agentUpgrade: "security",
  },
  async redirects() {
    return ["www.mindguide-learn.me", "mindguide-learning.vercel.app"].map((host) => ({
      source: "/:path*",
      has: [{ type: "host", value: host }],
      destination: "https://mindguide-learn.me/:path*",
      permanent: true,
    }));
  },
  async headers() {
    const baselineHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      {
        key: "Permissions-Policy",
        value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
      },
      ...(isDevelopment
        ? []
        : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
    ];

    return [
      {
        source: "/:path*",
        headers: baselineHeaders,
      },
      {
        source: "/((?!api/|api$).*)",
        headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy }],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
  webpack(config) {
    // Existing shared TypeScript modules use ESM .js import specifiers.
    config.resolve.extensionAlias = { ...config.resolve.extensionAlias, ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
  env: Object.fromEntries(publicKeys.map(key => [
    `NEXT_PUBLIC_${key}`, process.env[`NEXT_PUBLIC_${key}`] || process.env[`VITE_${key}`] || "",
  ])),
};
