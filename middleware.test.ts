import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { protectWithBasicAuth } from "./middleware";

const options = { username: "hfc", password: "correct-horse", required: true } as const;

function request(authorization?: string): NextRequest {
  return new NextRequest("https://hfc.example/api/transcribe", {
    headers: authorization ? { authorization } : undefined,
  });
}

function basic(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

describe("Basic authentication middleware", () => {
  it("challenges missing and incorrect credentials", () => {
    const missing = protectWithBasicAuth(request(), options);
    expect(missing.status).toBe(401);
    expect(missing.headers.get("WWW-Authenticate")).toBe('Basic realm="HFC", charset="UTF-8"');

    expect(protectWithBasicAuth(request(basic("hfc", "wrong")), options).status).toBe(401);
    expect(protectWithBasicAuth(request(basic("wrong", "correct-horse")), options).status).toBe(401);
  });

  it("allows the configured username and password", () => {
    const response = protectWithBasicAuth(request(basic("hfc", "correct-horse")), options);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("fails closed when production credentials are missing", () => {
    const response = protectWithBasicAuth(request(), { required: true });
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("does not require local development credentials", () => {
    const response = protectWithBasicAuth(request(), { required: false });
    expect(response.status).toBe(200);
  });
});

