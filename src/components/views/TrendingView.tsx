"use client";

import { useEffect, useState } from "react";
import type { Track } from "@/lib/types";
import { useUi } from "@/stores/ui";
import { useSettings } from "@/stores/settings";
import { TrackRow, TrackTableHead } from "@/components/track/TrackRow";
import { Icon } from "@/components/Icon";
import { usePlayer } from "@/stores/player";
import { useAsyncData } from "@/lib/useFetch";

/** full kworb chart for the chosen region — reached from the home tiles */
export function TrendingView() {
  const ui = useUi();
  const player = usePlayer();
  const region = useSettings((s) => s.region);
  const setRegion = useSettings((s) => s.setRegion);
  const chart = useAsyncData(`trending:${region}:50`, async (signal) => {
    const r = await fetch(`/api/trending?region=${encodeURIComponent(region)}&limit=50`, { signal });
    const d = await r.json();
    return {
      regions: (Array.isArray(d.regions) ? d.regions : []) as string[],
      tracks: (Array.isArray(d.tracks) ? d.tracks : []) as Track[],
    };
  });
  const regions = chart.data?.regions ?? [];
  const tracks = chart.data?.tracks ?? [];
  const state = chart.state === "ready" && !tracks.length ? "error" : chart.state;

  return (
    <>
      <div className="hero">
        <div>
          <h1>Trending</h1>
          <p className="muted">The {region} chart, refreshed every few hours.</p>
        </div>
      </div>

      <div className="chips flush">
        {regions.slice(0, 12).map((r) => (
          <button key={r} className={`chip${region === r ? " on" : ""}`} onClick={() => setRegion(r)}>
            {r}
          </button>
        ))}
      </div>

      {state === "loading" && <p className="muted pad-note">Loading the chart…</p>}
      {state === "error" && (
        <div className="empty">
          <Icon name="bars" />
          <h3>Chart unavailable</h3>
          <p>The trending source didn&apos;t respond. Try another region or come back later.</p>
          <button className="btn2" onClick={() => ui.navigate({ name: "home" })}>
            Back to home
          </button>
        </div>
      )}
      {state === "ready" && (
        <div className="tlist top-gap">
          <TrackTableHead />
          {tracks.map((t, i) => (
            <TrackRow key={t.videoId} track={t} index={i} list={tracks} contextLabel={`Trending · ${region}`} />
          ))}
        </div>
      )}
    </>
  );
}
