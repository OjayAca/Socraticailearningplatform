import { randomBytes } from "node:crypto";
import { readBoundedBuffer } from "../../../../server/http-security";
import { ServiceError } from "../../../../server/platform";

const GOOGLE_RETURN_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
};

// The Firebase-hosted redirect page posts the Google credential back to the
// initiating tab. Keep it out of URLs and match the tab's one-time state first.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== "https://socratic-ai-a7765.firebaseapp.com") {
    return new Response(null, { status: 403, headers: GOOGLE_RETURN_HEADERS });
  }
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/x-www-form-urlencoded")) {
    return new Response("Unsupported media type.", {
      status: 415,
      headers: GOOGLE_RETURN_HEADERS,
    });
  }

  let bodyText: string;
  try {
    const rawBuffer = await readBoundedBuffer(
      request,
      16_384,
      "Google sign-in response is too large.",
    );
    bodyText = rawBuffer.toString("utf8");
  } catch (error) {
    if (error instanceof ServiceError) {
      return new Response(error.message, {
        status: error.status,
        headers: GOOGLE_RETURN_HEADERS,
      });
    }
    return new Response("Invalid Google sign-in response.", {
      status: 400,
      headers: GOOGLE_RETURN_HEADERS,
    });
  }

  const form = new URLSearchParams(bodyText);
  const state = form.get("state") ?? "";
  const token = form.get("token") ?? "";
  if (!/^[a-f0-9-]{36}$/.test(state) || token.length > 12000 ||
      !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
    return new Response("Invalid Google sign-in response.", {
      status: 400,
      headers: GOOGLE_RETURN_HEADERS,
    });
  }
  const nonce = randomBytes(16).toString("base64");
  const serializedState = JSON.stringify(state);
  const serializedToken = JSON.stringify(token);
  return new Response(`<!doctype html><title>Google sign-in</title>
    <p>Finishing Google sign-in…</p><a href="/login">Return to login</a>
    <script nonce="${nonce}">
      if (sessionStorage.getItem("mindguide.google.state") === ${serializedState}) {
        sessionStorage.removeItem("mindguide.google.state");
        sessionStorage.setItem("mindguide.google.result", ${serializedToken});
        location.replace("/login");
      } else {
        document.querySelector("p").textContent = "This sign-in attempt expired. Please start again.";
      }
    </script>`, { headers: {
    ...GOOGLE_RETURN_HEADERS,
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`,
  } });
}
