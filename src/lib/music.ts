// Parsing and embedding of saved YouTube and Spotify links (spec 0005). Pure, safe on server and client.

export type MusicProvider = "YOUTUBE" | "SPOTIFY";
export type MusicKind = "PLAYLIST" | "VIDEO" | "ALBUM" | "TRACK";
export type ParsedLink = { provider: MusicProvider; kind: MusicKind; externalId: string };

const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);
const YT_VIDEO = /^[A-Za-z0-9_-]{11}$/;
const YT_LIST = /^[A-Za-z0-9_-]{10,64}$/;
const SPOTIFY_PATH = /^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(playlist|album|track)\/([A-Za-z0-9]{22})\/?$/i;

/**
 * An allow list parse (AC-1): only known hosts and id shapes pass, so nothing a user types reaches
 * an embed or a server fetch unchecked. Query strings like ?si= are ignored. Returns null otherwise.
 */
export function parseMusicUrl(raw: string): ParsedLink | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).replace(/\/$/, "");
    return YT_VIDEO.test(id) ? { provider: "YOUTUBE", kind: "VIDEO", externalId: id } : null;
  }
  if (YT_HOSTS.has(host)) {
    if (url.pathname === "/watch") {
      // A watch link that also carries list= is that video (AC-1).
      const v = url.searchParams.get("v") ?? "";
      return YT_VIDEO.test(v) ? { provider: "YOUTUBE", kind: "VIDEO", externalId: v } : null;
    }
    if (url.pathname === "/playlist") {
      const list = url.searchParams.get("list") ?? "";
      return YT_LIST.test(list) ? { provider: "YOUTUBE", kind: "PLAYLIST", externalId: list } : null;
    }
    return null; // Shorts, channels and anything else
  }
  if (host === "open.spotify.com") {
    const m = SPOTIFY_PATH.exec(url.pathname);
    if (!m) return null;
    return { provider: "SPOTIFY", kind: m[1].toUpperCase() as MusicKind, externalId: m[2] };
  }
  return null;
}

/** The canonical public URL, rebuilt from the parsed id (never the pasted text). */
export function canonicalUrl(l: ParsedLink) {
  if (l.provider === "SPOTIFY") return `https://open.spotify.com/${l.kind.toLowerCase()}/${l.externalId}`;
  return l.kind === "PLAYLIST"
    ? `https://www.youtube.com/playlist?list=${l.externalId}`
    : `https://www.youtube.com/watch?v=${l.externalId}`;
}

/** The provider's public title lookup (oEmbed), built from the canonical URL. */
export function oembedUrl(l: ParsedLink) {
  const target = encodeURIComponent(canonicalUrl(l));
  return l.provider === "SPOTIFY"
    ? `https://open.spotify.com/oembed?url=${target}`
    : `https://www.youtube.com/oembed?url=${target}&format=json`;
}

/** The exact fallback titles (AC-2). */
export function defaultTitle(l: Pick<ParsedLink, "provider" | "kind">) {
  return `${l.provider === "SPOTIFY" ? "Spotify" : "YouTube"} ${l.kind.toLowerCase()}`;
}

export const spotifyUri = (l: Pick<ParsedLink, "kind" | "externalId">) => `spotify:${l.kind.toLowerCase()}:${l.externalId}`;
