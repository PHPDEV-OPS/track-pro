import { describe, expect, it } from "vitest";
import { blobHost, isOwnBlobUrl } from "./blob";

const token = "vercel_blob_rw_AbC123xYz_secretpart";

describe("isOwnBlobUrl", () => {
  it("derives the store host from the token", () => {
    expect(blobHost(token)).toBe("abc123xyz.public.blob.vercel-storage.com");
  });
  it("accepts https URLs on our store", () => {
    expect(isOwnBlobUrl("https://abc123xyz.public.blob.vercel-storage.com/shot-x1.png", token)).toBe(true);
  });
  it("rejects other hosts, other stores, http and junk", () => {
    expect(isOwnBlobUrl("https://evil.example.com/shot.png", token)).toBe(false);
    expect(isOwnBlobUrl("https://other.public.blob.vercel-storage.com/shot.png", token)).toBe(false);
    expect(isOwnBlobUrl("https://abc123xyz.public.blob.vercel-storage.com.evil.com/a.png", token)).toBe(false);
    expect(isOwnBlobUrl("http://abc123xyz.public.blob.vercel-storage.com/a.png", token)).toBe(false);
    expect(isOwnBlobUrl("not a url", token)).toBe(false);
  });
  it("rejects everything when no token is configured", () => {
    expect(isOwnBlobUrl("https://abc123xyz.public.blob.vercel-storage.com/a.png", "")).toBe(false);
  });
});
