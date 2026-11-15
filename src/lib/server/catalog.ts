import type { CatalogArtist, CatalogRelease, HomeCatalog } from "@/lib/types";
import { hueFor, isMusicEntry } from "@/lib/catalog-utils";
import { cached } from "./cache";
import { getTrendingDetailed, type TrendingEntry } from "./kworb";

/**
 * Global home shelves — Popular artists / Popular albums and singles /
 * New releases — built from the worldwide trending chart (kworb Global),
 * the same source that powers the Trending view. Every entry resolves to a
 * real, playable YouTube track; artists carry real channel ids so their
 * pages open. Result is cached for 6h, so a warm home costs nothing.
 */


export async function getHomeCatalog(): Promise<HomeCatalog> {
  return cached("catalog:home", 1000 * 60 * 60 * 6, async () => {
    const detailed = await getTrendingDetailed("Global", 26);
    const music = detailed.filter((e) => isMusicEntry(e.title, e.track.artist));

    // Popular artists: group chart tracks by artist, rank by best position
    const byArtist = new Map<string, CatalogArtist>();
    for (const e of music) {
      const name = e.track.artist;
      const key = e.track.artistId || name.toLowerCase();
      const existing = byArtist.get(key);
      if (!existing) {
        byArtist.set(key, {
          name,
          artistId: e.track.artistId,
          hue: hueFor(name),
          track: e.track,
        });
      }
    }
    const artists = [...byArtist.values()].slice(0, 8);

    // Popular albums and singles: the chart's top tracks, presented as releases
    const releases: CatalogRelease[] = music.slice(0, 8).map((e) => ({
      track: e.track,
      type: e.track.album && e.track.album !== e.track.title ? "Album" : "Single",
      hue: hueFor(e.track.title),
    }));

    // New releases: entries that just charted ("NEW" movement), in chart order
    const fresh = music.filter((e) => /new/i.test(e.movement));
    const newReleases: CatalogRelease[] = fresh.slice(0, 8).map((e) => ({
      track: e.track,
      type: e.track.album && e.track.album !== e.track.title ? "Album" : "Single",
      when: "Today",
      hue: hueFor(e.track.title),
    }));
    // not enough fresh entries? top up with the newest-looking rest
    if (newReleases.length < 6) {
      const used = new Set(newReleases.map((r) => r.track.videoId));
      for (const e of music) {
        if (newReleases.length >= 6) break;
        if (used.has(e.track.videoId)) continue;
        used.add(e.track.videoId);
        newReleases.push({
          track: e.track,
          type: e.track.album && e.track.album !== e.track.title ? "Album" : "Single",
          when: "Charting now",
          hue: hueFor(e.track.title),
        });
      }
    }

    return { artists, releases, newReleases };
  });
}
