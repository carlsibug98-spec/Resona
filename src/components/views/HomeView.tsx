"use client";

import { useEffect, useRef, useState } from "react";
import type { ArtistPage, CatalogArtist, CatalogRelease, HomeCatalog, Track } from "@/lib/types";
import { useLibrary } from "@/stores/library";
import { useUi } from "@/stores/ui";
import { usePlayer } from "@/stores/player";
import { useSettings } from "@/stores/settings";
import { TrackRow, TrackTableHead } from "@/components/track/TrackRow";
import { MiniArt, CoverArt, plGrad, initials } from "@/lib/art";
import { Icon } from "@/components/Icon";
import { SEED_MIXES, useSeedTracks, seedTrack } from "@/lib/seed";
import { useAsyncData } from "@/lib/useFetch";
import { toast } from "@/stores/toast";

type Chip = "all" | "music" | "playlists";

/* ───────── Getting started carousel — mockup GS_CARDS, actions wired to real features ───────── */

function GettingStarted() {
  const ui = useUi();
  const [page, setPage] = useState(0);
  const perPage = 3;
  const cards: { n: string; title: string; text: string; hue: number; run: () => void }[] = [
    {
      n: "01",
      title: "Search anything",
      text: "Find songs, artists and radios by name.",
      hue: 30,
      run: () => ui.navigate({ name: "search" }),
    },
    {
      n: "02",
      title: "Make a playlist",
      text: "Put songs together for any mood or moment.",
      hue: 150,
      run: () => ui.openModal({ kind: "createPlaylist" }),
    },
    {
      n: "03",
      title: "Like songs",
      text: "Tap the heart and they collect in Liked songs.",
      hue: 345,
      run: () => toast("Tap the heart on any track to like it"),
    },
    {
      n: "04",
      title: "Start a radio",
      text: "Pick one artist and let the mix keep going.",
      hue: 215,
      run: () => toast("Open an artist to start their radio"),
    },
    {
      n: "05",
      title: "Download offline",
      text: "Save songs to this device for listening without signal.",
      hue: 280,
      run: () => toast("Tap the download icon on a song to save it"),
    },
    {
      n: "06",
      title: "Import your music",
      text: "Bring playlists over from another music app.",
      hue: 170,
      run: () => ui.openModal({ kind: "import" }),
    },
  ];
  const pages = Math.ceil(cards.length / perPage);
  const cur = Math.max(0, Math.min(pages - 1, page));

  const chunks: (typeof cards)[] = [];
  for (let i = 0; i < cards.length; i += perPage) chunks.push(cards.slice(i, i + perPage));

  return (
    <div className="section gs">
      <div className="gs-head">
        <h2>Getting started</h2>
        <div className="gs-arrows">
          <button
            className="iconbtn"
            disabled={cur === 0}
            onClick={() => setPage(cur - 1)}
            aria-label="Previous"
          >
            <Icon name="back" />
          </button>
          <button
            className="iconbtn"
            disabled={cur >= pages - 1}
            onClick={() => setPage(cur + 1)}
            aria-label="Next"
          >
            <Icon name="fwd" />
          </button>
        </div>
      </div>
      <div className="gs-viewport">
        <div className="gs-track" style={{ transform: `translateX(-${cur * 100}%)` }}>
          {chunks.map((ch, i) => (
            <div className="gs-page" key={i}>
              {ch.map((c) => (
                <button
                  key={c.n}
                  className="gs-card"
                  style={{ "--c": `hsl(${c.hue} 70% 42%)` } as React.CSSProperties}
                  onClick={c.run}
                >
                  <span className="gs-n">{c.n}</span>
                  <b>{c.title}</b>
                  <span>{c.text}</span>
                  <em>Try it</em>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="gs-dots">
        {chunks.map((_, i) => (
          <span key={i} className={`gs-dot${i === cur ? " on" : ""}`} />
        ))}
      </div>
    </div>
  );
}

/* ───────── single-row shelves with arrows (mockup .hscroll) ───────── */
function GlobalShelf({
  id,
  title,
  showAllMsg,
  children,
}: {
  id: string;
  title: string;
  showAllMsg: string;
  children: React.ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const scroll = (d: number) => {
    const el = rowRef.current;
    if (el) el.scrollBy({ left: d * el.clientWidth * 0.85, behavior: "smooth" });
  };
  return (
    <div className="section">
      <div className="section-h">
        <h2>{title}</h2>
        <div className="hr-right">
          <div className="gs-arrows">
            <button className="iconbtn" onClick={() => scroll(-1)} aria-label="Scroll left">
              <Icon name="back" />
            </button>
            <button className="iconbtn" onClick={() => scroll(1)} aria-label="Scroll right">
              <Icon name="fwd" />
            </button>
          </div>
          <button onClick={() => toast(showAllMsg)}>Show all</button>
        </div>
      </div>
      <div className="shelf hscroll" id={id} ref={rowRef}>
        {children}
      </div>
    </div>
  );
}

/** round-cover artist card — real YouTube Music artwork when the artist page
 *  has resolved, hue-gradient initials until then; opens their page, fab plays their charting track */
function ArtistCard({ a, thumb }: { a: CatalogArtist; thumb?: string }) {
  const ui = useUi();
  const player = usePlayer();
  return (
    <div className="card-item">
      <button
        className="face"
        onClick={() =>
          a.artistId
            ? ui.navigate({ name: "artist", id: a.artistId, label: a.name })
            : toast(`${a.name}: artist page coming soon`)
        }
      >
        <div
          className="cov round"
          style={
            thumb
              ? undefined
              : {
                  background: `linear-gradient(135deg,hsl(${a.hue} 70% 46%),hsl(${(a.hue + 60) % 360} 55% 14%))`,
                }
          }
        >
          {thumb ? <img src={thumb} alt={a.name} loading="lazy" /> : <span>{initials(a.name)}</span>}
        </div>
        <div className="t trunc">{a.name}</div>
        <div className="s">Artist</div>
      </button>
      <button
        className="fab"
        aria-label={`Play ${a.name}`}
        onClick={() => player.playTrack(a.track, `Popular artists · ${a.name}`)}
      >
        <Icon name="play" fill />
      </button>
    </div>
  );
}

/** release / new-release card — cover, type line, green New badge */
function ReleaseCard({ r, context }: { r: CatalogRelease; context: string }) {
  const player = usePlayer();
  return (
    <div className="card-item">
      {r.when && <span className="new-badge">New</span>}
      <button className="face" onClick={() => player.playTrack(r.track, context)}>
        <CoverArt track={r.track} className="cov" />
        <div className="t trunc">{r.track.title}</div>
        <div className="s trunc">
          {r.type} · {r.track.artist}
          {r.when ? ` · ${r.when}` : ""}
        </div>
      </button>
      <button
        className="fab"
        aria-label={`Play ${r.track.title}`}
        onClick={() => player.playTrack(r.track, context)}
      >
        <Icon name="play" fill />
      </button>
    </div>
  );
}

/** the three global shelves, fed by /api/catalog (worldwide trending chart).
 *  Artist cards load their real YouTube Music artwork through /api/artist —
 *  the shelf renders immediately with gradient covers and the photos arrive
 *  as each artist page resolves, so a slow lookup never leaves a gap. */
function GlobalShelves({ catalog, state }: { catalog: HomeCatalog | null; state: string }) {
  const artistIds = (catalog?.artists ?? [])
    .map((a) => a.artistId)
    .filter((x): x is string => !!x);
  const thumbsAsync = useAsyncData(`home-artists:${artistIds.join(",")}`, async (signal) => {
    const pages = await Promise.allSettled(
      artistIds.map(async (id) => {
        const r = await fetch(`/api/artist?id=${encodeURIComponent(id)}`, { signal });
        const d = await r.json();
        if (d.error) throw new Error("artist_failed");
        return { id, page: d as ArtistPage };
      })
    );
    return pages.flatMap((p) =>
      p.status === "fulfilled" && p.value.page.thumb ? [{ id: p.value.id, thumb: p.value.page.thumb }] : []
    );
  });
  const thumbs = Object.fromEntries((thumbsAsync.data ?? []).map((t) => [t.id, t.thumb] as const));
  if (state === "loading" || !catalog) {
    return (
      <div className="section">
        <p className="muted pad-note">Loading what&apos;s popular worldwide…</p>
      </div>
    );
  }
  if (state === "error" || (!catalog.artists.length && !catalog.releases.length && !catalog.newReleases.length)) {
    return (
      <div className="section">
        <p className="muted pad-note">
          Global shelves aren&apos;t available right now — your own music is still here.
        </p>
      </div>
    );
  }
  return (
    <>
      {catalog.artists.length > 0 && (
        <GlobalShelf id="hs-art" title="Popular artists" showAllMsg="Full artist pages come in the next build">
          {catalog.artists.map((a) => (
            <ArtistCard key={a.artistId || a.name} a={a} thumb={a.artistId ? thumbs[a.artistId] : undefined} />
          ))}
        </GlobalShelf>
      )}
      {catalog.releases.length > 0 && (
        <GlobalShelf id="hs-rel" title="Popular albums and singles" showAllMsg="Full discography comes in the next build">
          {catalog.releases.map((r) => (
            <ReleaseCard key={r.track.videoId} r={r} context="Popular albums and singles" />
          ))}
        </GlobalShelf>
      )}
      {catalog.newReleases.length > 0 && (
        <GlobalShelf id="hs-new" title="New releases" showAllMsg="New releases update every Friday">
          {catalog.newReleases.map((r) => (
            <ReleaseCard key={r.track.videoId} r={r} context="New releases" />
          ))}
        </GlobalShelf>
      )}
    </>
  );
}

/* ───────── home ───────── */

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
      {/* the play disc is centred on the cover itself, not on the whole card */}
      <div className="cover-wrap">
        <button className="cover-btn" onClick={onOpen} aria-label={title}>
          {cover}
        </button>
        <button className="fab cover-fab" onClick={onPlay} aria-label={`Play ${title}`}>
          <Icon name="play" fill />
        </button>
      </div>
      <button className="face" onClick={onOpen} tabIndex={-1}>
        <div className="t trunc">{title}</div>
        <div className="s trunc">{sub}</div>
      </button>
    </div>
  );
}

export function HomeView() {
  const ui = useUi();
  const player = usePlayer();
  const library = useLibrary();
  const region = useSettings((s) => s.region);
  const isNew = useSettings((s) => s.onboarding) === "new";
  const resolvedSeeds = useSeedTracks((s) => s.resolved);
  const [chip, setChip] = useState<Chip>("all");
  const [greeting, setGreeting] = useState("Welcome back");

  const catalogAsync = useAsyncData("catalog", async (signal) => {
    const r = await fetch(`/api/catalog`, { signal });
    const d = await r.json();
    return {
      artists: (d.artists || []) as CatalogArtist[],
      releases: (d.releases || []) as CatalogRelease[],
      newReleases: (d.newReleases || []) as CatalogRelease[],
    } as HomeCatalog;
  });
  const catalogState = catalogAsync.state;
  const catalog = catalogState === "ready" ? catalogAsync.data : null;

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
  const playlists = library.playlists;

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

  const chips = (
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
  );

  /* first-time listener — mockup new-user home: Getting started on top,
     no quick tiles, then the three global shelves */
  if (isNew) {
    return (
      <>
        <div className="hero">
          <div>
            <h1>Welcome to Resona</h1>
            <p className="muted">Let&apos;s get you started. Everything here is optional.</p>
          </div>
        </div>
        {chips}
        <GettingStarted />
        <GlobalShelves catalog={catalog} state={catalogState} />
      </>
    );
  }

  return (
    <>
      <div className="hero">
        <div>
          <h1>{greeting}</h1>
          <p className="muted">Pick up where you left off, or let Resona surprise you.</p>
        </div>
      </div>

      {chips}

      <div className="section">
        <div className="quick">{tiles.map((t) => (
          <QTile key={t.key} label={t.label} art={t.art} onOpen={t.onOpen} />
        ))}</div>
      </div>

      {showMusic && <GettingStarted />}

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

      {showMusic && <GlobalShelves catalog={catalog} state={catalogState} />}

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
