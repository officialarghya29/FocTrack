import { describe, expect, it } from "vitest";
import { ApiError, retryDelay, shouldRetryQuery } from "./api";

describe("query retry policy", () => {
  it("retries gateway failures while the API wakes up", () => {
    expect(shouldRetryQuery(0, new ApiError("bad gateway", 502))).toBe(true);
    expect(shouldRetryQuery(1, new ApiError("unavailable", 503))).toBe(true);
    expect(shouldRetryQuery(2, new ApiError("timeout", 504))).toBe(true);
  });

  it("retries network rejections", () => {
    expect(shouldRetryQuery(0, new TypeError("Failed to fetch"))).toBe(true);
  });

  it("does not retry responses the client caused", () => {
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
