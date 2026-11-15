import { NextRequest, NextResponse } from "next/server";

const paths: Record<string, string[]> = {
  "account/signup": ["POST"], "account/login": ["POST"], "account/logout": ["POST"],
  "account/me": ["GET", "PATCH"], "account/pin": ["POST", "PATCH"],
  "account/contacts": ["GET", "POST"],
  "account/reports": ["GET", "POST"],
  "safety/analyze-route": ["POST"], "safety/emergency-resources": ["POST"], "voice/process": ["POST"],
  "incidents": ["GET", "POST"], "incidents/assessment": ["POST"], "incidents/notify": ["POST"],
  "incidents/demo-call": ["POST"],
};

async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join("/");
  const methods = paths[path] ?? (
    /^incidents\/demo-call\/[a-f0-9-]{36}$/.test(path) ? ["GET"] :
    /^account\/contacts\/\d+$/.test(path) ? ["PATCH", "DELETE"] : []
  );
  if (!methods.includes(request.method)) return NextResponse.json({ error: "Unknown operation" }, { status: 404 });
  const origin = request.headers.get("origin");
  if (request.method !== "GET" && origin) {
    const site = process.env.JUGNU_SITE_ORIGIN || request.nextUrl.origin;
    if (origin !== site) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const base = (process.env.JUGNU_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  try {
    const hasBody = ["POST", "PATCH"].includes(request.method);
    if (hasBody && Number(request.headers.get("content-length")) > 512 * 1024) {
      return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    }
    const body = hasBody ? await request.text() : undefined;
    if (body && Buffer.byteLength(body) > 512 * 1024) {
      return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    }
    const upstream = await fetch(`${base}/api/${path}`, {
      method: request.method,
      headers: {
        "Content-Type": "application/json", Cookie: request.headers.get("cookie") || "",
        "X-Jugnu-Client-Address": (request.headers.get("x-forwarded-for") || "local").split(",").at(-1)?.trim() || "local",
      },
      body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(35000),
    });
    const response = NextResponse.json(await upstream.json(), {
      status: upstream.status, headers: { "Cache-Control": "no-store" },
    });
    for (const value of upstream.headers.getSetCookie()) response.headers.append("Set-Cookie", value);
    return response;
  } catch {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
