// Only these existing public Firebase identifiers are forwarded from the original .env.
const publicKeys = [
  "FIREBASE_API_KEY", "FIREBASE_AUTH_DOMAIN", "FIREBASE_PROJECT_ID",
  "FIREBASE_STORAGE_BUCKET", "FIREBASE_MESSAGING_SENDER_ID", "FIREBASE_APP_ID",
  "FIREBASE_MEASUREMENT_ID", "RECAPTCHA_ENTERPRISE_SITE_KEY",
];

export default {
  webpack(config) {
    // Existing shared TypeScript modules use ESM .js import specifiers.
    config.resolve.extensionAlias = { ...config.resolve.extensionAlias, ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
  env: Object.fromEntries(publicKeys.map(key => [
    `NEXT_PUBLIC_${key}`, process.env[`NEXT_PUBLIC_${key}`] || process.env[`VITE_${key}`] || "",
  ])),
};
