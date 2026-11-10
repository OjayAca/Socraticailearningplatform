// The Firebase-hosted redirect page posts the Google credential back to the
// initiating tab. Keep it out of URLs and match the tab's one-time state first.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== "https://socratic-ai-a7765.firebaseapp.com") {
    return new Response(null, { status: 403 });
  }
  const form = new URLSearchParams(await request.text());
  const state = form.get("state") ?? "";
  const token = form.get("token") ?? "";
  if (!/^[a-f0-9-]{36}$/.test(state) || token.length > 12000 ||
      !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
    return new Response("Invalid Google sign-in response.", { status: 400 });
  }
  const nonce = crypto.randomUUID();
  return new Response(`<!doctype html><title>Google sign-in</title>
    <p>Finishing Google sign-in…</p><a href="/login">Return to login</a>
    <script nonce="${nonce}">
      if (sessionStorage.getItem("mindguide.google.state") === "${state}") {
        sessionStorage.removeItem("mindguide.google.state");
        sessionStorage.setItem("mindguide.google.result", "${token}");
        location.replace("/login");
      } else {
        document.querySelector("p").textContent = "This sign-in attempt expired. Please start again.";
      }
    </script>`, { headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  } });
}
