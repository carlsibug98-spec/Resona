"use client";

import { useEffect, useState } from "react";
import type { Track } from "@/lib/types";
import { useLibrary } from "@/stores/library";
import { useUi } from "@/stores/ui";
import { usePlayer } from "@/stores/player";
import { useSettings } from "@/stores/settings";
import { TrackRow, TrackTableHead } from "@/components/track/TrackRow";
import { MiniArt, CoverArt, plGrad } from "@/lib/art";
import { Icon } from "@/components/Icon";
import { SEED_MIXES, useSeedTracks, seedTrack } from "@/lib/seed";
import { useAsyncData } from "@/lib/useFetch";
import { toast } from "@/stores/toast";

type Chip = "all" | "music" | "playlists";

function QTile({
  label,
  art,
  onOpen,
  onPlay,
}: {
  label: string;
  art: React.ReactNode;
  onOpen: () => void;
  onPlay?: () => void;
}) {
  return (
    <div className="qtile">
      <button className="main-btn" onClick={onOpen} aria-label={label}>
        {art}
        <span className="label trunc">{label}</span>
      </button>
      {onPlay && (
        <button className="go" onClick={onPlay} aria-label={`Play ${label}`}>
          <Icon name="play" fill />
        </button>
      )}
    </div>
  );
}

/** home shelf card: cover + title + sub + centred frosted play fab */
function Card({
  cover,
  title,
  sub,
  onOpen,
  onPlay,
}: {
  cover: React.ReactNode;
  title: string;
  sub: string;
  onOpen: () => void;
  onPlay: () => void;
}) {
  return (
    <div className="card-item">
      <button className="face" onClick={onOpen} aria-label={title}>
        {cover}
        <div className="t trunc">{title}</div>
        <div className="s trunc">{sub}</div>
      </button>
      <button className="fab" onClick={onPlay} aria-label={`Play ${title}`}>
        <Icon name="play" fill />
      </button>
    </div>
  );
}

export function HomeView() {
  const ui = useUi();
  const player = usePlayer();
  const library = useLibrary();
  const region = useSettings((s) => s.region);
  const resolvedSeeds = useSeedTracks((s) => s.resolved);
  const [chip, setChip] = useState<Chip>("all");
  const [greeting, setGreeting] = useState("Welcome back");
  const trending = useAsyncData(`trending:${region}`, async (signal) => {
    const r = await fetch(`/api/trending?region=${encodeURIComponent(region)}&limit=8`, { signal });
    const d = await r.json();
    return (Array.isArray(d.tracks) ? d.tracks : []) as Track[];
  });
  const trendingState = trending.state;
  const trendingTracks = trending.data ?? [];

  useEffect(() => {
    const h = new Date().getHours();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only clock, must run after hydration
    setGreeting(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);

  const history = library.history.map((h) => h.track);
  const likedTracks = Object.values(library.liked)
    .sort((a, b) => b.likedAt - a.likedAt)
    .map((l) => l.track);
  const playlists = library.playlists;
  const dlCount = Object.values(library.downloads).filter((d) => d.complete).length;

  const mixTracks = (keys: string[]): Track[] =>
    keys.map((k) => seedTrack(k)).filter((t): t is Track => !!t);

  /** resolves any missing seeds first, then plays the mix */
  const playMix = async (keys: string[]) => {
    await useSeedTracks.getState().resolveMany(keys);
    const tracks = mixTracks(keys);
    if (!tracks.length) return toast("Couldn't load the starter mix — check your connection");
    player.playQueue(tracks, 0, "Starter mix");
  };

  const showMusic = chip === "all" || chip === "music";
  const showPl = chip === "all" || chip === "playlists";

  const lateNight = playlists[0];

  const tiles = [
    {
      key: "liked",
      label: "Liked songs",
      art: (
        <span className="mini tile heart">
          <Icon name="heart" fill />
        </span>
      ),
      onOpen: () => ui.navigate({ name: "library", tab: "liked" }),
    },
    lateNight && {
      key: `pl:${lateNight.id}`,
      label: lateNight.name,
      art: (
        <span className="mini tile" style={{ background: plGrad(280) }}>
          <span>{lateNight.name.slice(0, 1).toUpperCase()}</span>
        </span>
      ),
      onOpen: () => ui.navigate({ name: "playlist", id: lateNight.id }),
    },
    history.length > 0 && {
      key: "recent",
      label: "Recently played",
      art: (
        <span className="mini tile soft">
          <Icon name="bars" />
        </span>
      ),
      onOpen: () => {
        const ids = history;
        if (ids.length) player.playQueue(ids, 0, "Recently played");
      },
    },
    resolvedSeeds["t4"] !== undefined && {
      key: "opmdaily",
      label: "OPM Daily Mix",
      art: <MiniArt track={seedTrack("t4")} className="mini tile" />,
      onOpen: () => void playMix(["t4", "t2", "t3", "t5"]),
    },
    {
      key: "downloads",
      label: "Downloads",
      art: (
        <span className="mini tile ok">
          <Icon name="download" />
        </span>
      ),
      onOpen: () => ui.navigate({ name: "library", tab: "downloads" }),
    },
    {
      key: "trending",
      label: "Trending PH",
      art: (
        <span className="mini tile trend">
          <Icon name="bars" />
        </span>
      ),
      onOpen: () => ui.navigate({ name: "trending" }),
    },
  ].filter(Boolean) as { key: string; label: string; art: React.ReactNode; onOpen: () => void }[];

  const historyCards = history.slice(0, 6);

  const madeForYou = [
    ...SEED_MIXES.map((m) => ({
      key: m.name,
      name: m.name,
      sub: m.sub,
      cover: <CoverArt className="cov" letter={m.name[0]} hue={m.hue} />,
      onPlay: () => void playMix(m.keys),
    })),
    ...playlists.map((p) => ({
      key: `pl:${p.id}`,
      name: p.name,
      sub: `Playlist · ${p.tracks.length} songs`,
      cover: <CoverArt className="cov" letter={p.name.slice(0, 1).toUpperCase()} hue={280} />,
      onPlay: () => p.tracks.length && player.playQueue(p.tracks, 0, p.name),
    })),
  ].slice(0, 4);

  return (
    <>
      <div className="hero">
        <div>
          <h1>{greeting}</h1>
          <p className="muted">Pick up where you left off, or let Resona surprise you.</p>
        </div>
      </div>

      <div className="chips flush">
        {(
          [
            ["all", "All"],
            ["music", "Music"],
            ["playlists", "Playlists"],
          ] as [Chip, string][]
        ).map(([k, l]) => (
          <button key={k} className={`chip${chip === k ? " on" : ""}`} onClick={() => setChip(k)}>
            {l}
          </button>
        ))}
      </div>

      <div className="section">
        <div className="quick">
          {tiles.map((t) => (
            <QTile key={t.key} label={t.label} art={t.art} onOpen={t.onOpen} />
          ))}
        </div>
      </div>

      {showMusic && historyCards.length > 0 && (
        <div className="section">
          <div className="section-h">
            <h2>Jump back in</h2>
            <button onClick={() => ui.navigate({ name: "library", tab: "history" })}>Show all</button>
          </div>
          <div className="shelf">
            {historyCards.map((t) => (
              <Card
                key={t.videoId}
                cover={<CoverArt track={t} className="cov" />}
                title={t.title}
                sub={t.artist}
                onOpen={() => player.playTrack(t, "Jump back in")}
                onPlay={() => player.playQueue(historyCards, Math.max(0, historyCards.indexOf(t)), "Jump back in")}
              />
            ))}
          </div>
        </div>
      )}

      {showPl && madeForYou.length > 0 && (
        <div className="section">
          <div className="section-h">
            <h2>Made for you</h2>
            <button onClick={() => ui.navigate({ name: "library", tab: "playlists" })}>Show all</button>
          </div>
          <div className="shelf">
            {madeForYou.map((m) => (
              <Card
                key={m.key}
                cover={m.cover}
                title={m.name}
                sub={m.sub}
                onOpen={m.onPlay}
                onPlay={m.onPlay}
              />
            ))}
          </div>
        </div>
      )}

      {showMusic && (
        <div className="section">
          <div className="section-h">
            <h2>Trending now</h2>
            <button onClick={() => ui.navigate({ name: "trending" })}>See chart</button>
          </div>
          {trendingState === "loading" && <p className="muted pad-note">Loading the chart…</p>}
          {trendingState === "error" && (
            <p className="muted pad-note">
              Trending isn&apos;t available right now — your own music is still here.
            </p>
          )}
          {trendingState === "ready" && (
            <div className="tlist">
              <TrackTableHead />
              {trendingTracks.slice(0, 6).map((t, i) => (
                <TrackRow
                  key={t.videoId}
                  track={t}
                  index={i}
                  list={trendingTracks}
                  contextLabel={`Trending · ${region}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
