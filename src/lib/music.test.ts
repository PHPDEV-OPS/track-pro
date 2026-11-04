import { describe, expect, it } from "vitest";
import { canonicalUrl, defaultTitle, oembedUrl, parseMusicUrl, spotifyUri } from "./music";

const VID = "jfKfPfyJRdk";
const LIST = "PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI";
const SP = "37i9dQZF1DWWQRwui0ExPn";

describe("parseMusicUrl (spec 0005 AC-1)", () => {
  it.each([
    [`https://www.youtube.com/playlist?list=${LIST}`, "YOUTUBE", "PLAYLIST", LIST],
    [`https://www.youtube.com/watch?v=${VID}`, "YOUTUBE", "VIDEO", VID],
    [`https://www.youtube.com/watch?v=${VID}&list=${LIST}`, "YOUTUBE", "VIDEO", VID],
    [`https://youtu.be/${VID}?si=abc123`, "YOUTUBE", "VIDEO", VID],
    [`https://m.youtube.com/watch?v=${VID}`, "YOUTUBE", "VIDEO", VID],
    [`https://music.youtube.com/playlist?list=${LIST}`, "YOUTUBE", "PLAYLIST", LIST],
    [`https://open.spotify.com/playlist/${SP}?si=xyz`, "SPOTIFY", "PLAYLIST", SP],
    [`https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy`, "SPOTIFY", "ALBUM", "4aawyAB9vmqN3uQ7FjRGTy"],
    [`https://open.spotify.com/intl-de/track/${SP}`, "SPOTIFY", "TRACK", SP],
    [`  https://open.spotify.com/track/${SP}/  `, "SPOTIFY", "TRACK", SP],
  ])("accepts %s", (url, provider, kind, externalId) => {
    expect(parseMusicUrl(url)).toEqual({ provider, kind, externalId });
  });

  it.each([
    `https://www.youtube.com/shorts/${VID}`,
    `https://www.youtube.com/@somechannel`,
    `https://open.spotify.com/artist/${SP}`,
    `https://open.spotify.com/episode/${SP}`,
    `https://evil.example/playlist?list=${LIST}`,
    `https://youtube.com.evil.example/watch?v=${VID}`,
    `javascript:alert(1)`,
    `https://www.youtube.com/watch?v=<script>`,
    `not a url`,
  ])("rejects %s", (url) => {
    expect(parseMusicUrl(url)).toBeNull();
  });
});

describe("derived values (spec 0005 AC-2)", () => {
  it("rebuilds canonical and lookup URLs from the parsed id, with exact default titles", () => {
    const sp = parseMusicUrl(`https://open.spotify.com/intl-de/album/${SP}?si=1`)!;
    expect(canonicalUrl(sp)).toBe(`https://open.spotify.com/album/${SP}`);
    expect(oembedUrl(sp)).toBe(`https://open.spotify.com/oembed?url=${encodeURIComponent(canonicalUrl(sp))}`);
    expect(spotifyUri(sp)).toBe(`spotify:album:${SP}`);
    expect(defaultTitle(sp)).toBe("Spotify album");
    expect(defaultTitle({ provider: "YOUTUBE", kind: "VIDEO" })).toBe("YouTube video");
    expect(defaultTitle({ provider: "YOUTUBE", kind: "PLAYLIST" })).toBe("YouTube playlist");
  });
});
