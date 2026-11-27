import { describe, expect, it, vi } from "vitest";
import {
  ApiError,
  api,
  retryDelay,
  setAccessToken,
  setRefreshHandler,
  shouldRetryQuery,
} from "./api";

describe("query retry policy", () => {
  it("retries gateway failures while the API wakes up", () => {
    expect(shouldRetryQuery(0, new ApiError("bad gateway", 502))).toBe(true);
    expect(shouldRetryQuery(1, new ApiError("unavailable", 503))).toBe(true);
    expect(shouldRetryQuery(2, new ApiError("timeout", 504))).toBe(true);
  });

  it("retries a request that timed out without a response", () => {
    expect(
      shouldRetryQuery(0, new ApiError("The API did not respond in time.", 0))
    ).toBe(true);
  });

  it("retries an application error while the instance boots", () => {
    expect(shouldRetryQuery(0, new ApiError("internal error", 500))).toBe(true);
  });

  it("retries network rejections", () => {
    expect(shouldRetryQuery(0, new TypeError("Failed to fetch"))).toBe(true);
  });

  it("does not retry responses the client caused", () => {
    expect(shouldRetryQuery(0, new ApiError("unauthorized", 401))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError("not found", 404))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError("conflict", 409))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError("invalid", 422))).toBe(false);
  });

  it("gives up after four attempts", () => {
    expect(shouldRetryQuery(3, new ApiError("bad gateway", 502))).toBe(true);
    expect(shouldRetryQuery(4, new ApiError("bad gateway", 502))).toBe(false);
  });

  it("backs off with a ceiling", () => {
    expect(retryDelay(0)).toBe(1000);
    expect(retryDelay(2)).toBe(4000);
    expect(retryDelay(10)).toBe(8000);
  });
});

describe("authenticated requests", () => {
  it("attaches the access token and rotates it once on a 401", async () => {
    const sent: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      sent.push(headers.Authorization ?? "none");
      if (sent.length === 1) {
        return new Response(JSON.stringify({ detail: "expired" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ id: 1, username: "A" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    setAccessToken("old-token");
    setRefreshHandler(async () => {
      setAccessToken("new-token");
      return true;
    });

    const profile = await api.profile();

    expect(profile).toMatchObject({ id: 1 });
    expect(sent).toEqual(["Bearer old-token", "Bearer new-token"]);

    setAccessToken(null);
    setRefreshHandler(null);
    vi.unstubAllGlobals();
  });
});
