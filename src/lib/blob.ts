import { z } from "zod";

/** Host of our public Blob store. The read write token is `vercel_blob_rw_<storeId>_<secret>`. */
export function blobHost(token = process.env.BLOB_READ_WRITE_TOKEN): string | null {
  const storeId = token?.split("_")[3];
  return storeId ? `${storeId.toLowerCase()}.public.blob.vercel-storage.com` : null;
}

/** Image URLs must come from our own Blob store, never an arbitrary host (spec 0001 invariant). */
export function isOwnBlobUrl(url: string, token?: string): boolean {
  const host = blobHost(token);
  if (!host) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === host;
  } catch {
    return false;
  }
}

export const blobImageUrl = z.string().refine((url) => isOwnBlobUrl(url), "Image must be uploaded to track-pro");
