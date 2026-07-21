import { NextResponse, type NextRequest } from "next/server";

export interface BasicAuthOptions {
  readonly username?: string;
  readonly password?: string;
  readonly required: boolean;
}

function safeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;

  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}

function credentialsFrom(request: NextRequest): { username: string; password: string } | undefined {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) return undefined;

  try {
    const decoded = atob(authorization.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    if (separator === -1) return undefined;
    return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return undefined;
  }
}

export function protectWithBasicAuth(request: NextRequest, options: BasicAuthOptions): NextResponse | Response {
  const { username, password, required } = options;
  if (!username || !password) {
    return required
      ? new Response("Authentication is not configured.", {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        })
      : NextResponse.next();
  }

  const provided = credentialsFrom(request);
  if (provided && safeEqual(provided.username, username) && safeEqual(provided.password, password)) {
    return NextResponse.next();
  }

  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "Cache-Control": "no-store",
      "WWW-Authenticate": 'Basic realm="HFC", charset="UTF-8"',
    },
  });
}

export function middleware(request: NextRequest): NextResponse | Response {
  return protectWithBasicAuth(request, {
    username: process.env.HFC_AUTH_USERNAME,
    password: process.env.HFC_AUTH_PASSWORD,
    required: process.env.NODE_ENV === "production",
  });
}

