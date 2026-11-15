"use client";

import { useEffect, useRef, useState } from "react";
import type { SpotifyImportResult, Track } from "@/lib/types";
import { useUi } from "@/stores/ui";
import { useLibrary } from "@/stores/library";
import { usePlayer } from "@/stores/player";
import { MiniArt } from "@/lib/art";
import { Icon } from "@/components/Icon";
import { removeDownloadConfirmed, startDownload } from "@/lib/useDownload";
import { removeStarterContent } from "@/lib/seed";
import { startRadio } from "@/lib/radio";
import { toast } from "@/stores/toast";

/**
 * Every dialog renders through the mockup's scrim + modal:
 * track menu, add-to-playlist, create/rename, import, restore,
 * and the confirmations (offline polish).
 */
export function ModalHost() {
  const modal = useUi((s) => s.modal);
  const closeModal = useUi((s) => s.closeModal);

  // Esc closes whatever is on top
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modal, closeModal]);

  if (!modal) return null;

  return (
    <div
      className="scrim open"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true">
        {modal.kind === "import" && <ImportModal onDone={closeModal} />}
        {modal.kind === "trackMenu" && (
          <TrackMenuModal track={modal.track} fromPlaylistId={modal.fromPlaylistId} onDone={closeModal} />
        )}
        {modal.kind === "addToPlaylist" && <AddToPlaylistModal track={modal.track} onDone={closeModal} />}
        {modal.kind === "createPlaylist" && <CreatePlaylistModal onDone={closeModal} />}
        {modal.kind === "renamePlaylist" && (
          <RenameModal id={modal.id} initial={modal.name} onDone={closeModal} />
        )}
        {modal.kind === "confirmDeletePlaylist" && (
          <ConfirmModal
            title={`Delete “${modal.name}”?`}
            text="This cannot be undone. Your liked songs and other playlists are not affected."
            confirmLabel="Delete"
            danger
            onDone={closeModal}
            onConfirm={() => {
              useLibrary.getState().deletePlaylist(modal.id);
              toast("Playlist deleted", true);
              useUi.getState().navigate({ name: "library", tab: "playlists" });
            }}
          />
        )}
        {modal.kind === "confirmRemoveDownload" && (
          <ConfirmModal
            title={`Remove “${modal.track.title}” from downloads?`}
            text="The saved audio is deleted from this device. You can download it again anytime."
            confirmLabel="Remove"
            danger
            onDone={closeModal}
            onConfirm={() => void removeDownloadConfirmed(modal.track.videoId)}
          />
        )}
        {modal.kind === "playlistMenu" && (
          <PlaylistMenuModal id={modal.id} name={modal.name} onDone={closeModal} />
        )}
        {modal.kind === "confirmRemoveStarter" && (
          <ConfirmModal
            title="Remove starter content?"
            text="The starter playlist, seeded likes and sample history are removed. Songs you added yourself stay."
            confirmLabel="Remove"
            danger
            onDone={closeModal}
            onConfirm={() => {
              removeStarterContent();
              toast("Starter content removed", true);
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ── track menu (mockup sheet) ─────────────────────────────── */
function TrackMenuModal({
  track,
  fromPlaylistId,
  onDone,
}: {
  track: Track;
  fromPlaylistId?: string;
  onDone: () => void;
}) {
  const liked = useLibrary((s) => !!s.liked[track.videoId]);
  const downloaded = useLibrary((s) => !!s.downloads[track.videoId]?.complete);
  const enqueue = usePlayer((s) => s.enqueue);
  const index = usePlayer((s) => s.index);
  const player = usePlayer();

  return (
    <>
      <div className="head">
        <MiniArt track={track} className="mini" />
        <div className="grow">
          <b className="trunc">{track.title}</b>
          <span className="sub">{track.artist}</span>
        </div>
      </div>
      <div className="sheet">
        <button
          onClick={() => {
            useLibrary.getState().toggleLike(track);
            toast(liked ? "Removed from Liked songs" : "Added to Liked songs", !liked);
            onDone();
          }}
        >
          <Icon name="heart" fill={liked} /> {liked ? "Remove from Liked songs" : "Add to Liked songs"}
        </button>
        {downloaded ? (
          <button
            onClick={() => {
              onDone();
              useUi.getState().openModal({ kind: "confirmRemoveDownload", track });
            }}
          >
            <Icon name="download" /> Remove download
          </button>
        ) : (
          <button
            onClick={() => {
              onDone();
              void startDownload(track);
            }}
          >
            <Icon name="download" /> Download for offline
          </button>
        )}
        <button
          onClick={() => {
            enqueue(track, true);
            toast("Added to queue", true);
            onDone();
          }}
        >
          <Icon name="queue" /> Add to queue
        </button>
        <button
          onClick={() => {
            onDone();
            void startRadio(track);
          }}
        >
          <Icon name="radio" /> Start radio
        </button>
        <button
          onClick={() => {
            onDone();
            useUi.getState().openModal({ kind: "addToPlaylist", track });
          }}
        >
          <Icon name="plus" /> Add to playlist
        </button>
        {fromPlaylistId && (
          <button
            onClick={() => {
              useLibrary.getState().removeFromPlaylist(fromPlaylistId, track.videoId);
              toast("Removed from playlist", true);
              onDone();
            }}
          >
            <Icon name="x" /> Remove from this playlist
          </button>
        )}
        <button
          onClick={() => {
            const url = `https://www.youtube.com/watch?v=${track.videoId}`;
            void navigator.clipboard?.writeText(url).catch(() => {});
            toast("Link copied", true);
            onDone();
          }}
        >
          <Icon name="link" /> Copy link
        </button>
        {player.queue.length > 0 && track.videoId === player.current()?.videoId && (
          <button
            onClick={() => {
              void startDownload(track);
              void index;
              onDone();
            }}
          >
            <Icon name="download" /> Save current track offline
          </button>
        )}
      </div>
    </>
  );
}

/* ── playlist menu (rename / export / delete — mockup sheet) ── */
function PlaylistMenuModal({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const exportJson = () => {
    const p = useLibrary.getState().playlists.find((x) => x.id === id);
    if (!p) return;
    const data = {
      name: p.name,
      exportedFrom: "Resona",
      exportedAt: new Date().toISOString(),
      tracks: p.tracks.map((t) => ({ title: t.title, artist: t.artist, videoId: t.videoId })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${p.name.replace(/[^\w-]+/g, "_")}.resona.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Playlist exported", true);
  };

  return (
    <>
      <div className="head">
        <span className="mini" style={{ background: "var(--elev)" }}>
          <span>{name.slice(0, 1).toUpperCase()}</span>
        </span>
        <div className="grow">
          <b className="trunc">{name}</b>
          <span className="sub">Playlist</span>
        </div>
      </div>
      <div className="sheet">
        <button
          onClick={() => {
            onDone();
            useUi.getState().openModal({ kind: "renamePlaylist", id, name });
          }}
        >
          <Icon name="gear" /> Rename playlist
        </button>
        <button onClick={() => { exportJson(); onDone(); }}>
          <Icon name="download" /> Export as JSON
        </button>
        <button
          onClick={() => {
            onDone();
            useUi.getState().openModal({ kind: "confirmDeletePlaylist", id, name });
          }}
        >
          <Icon name="x" /> Delete playlist
        </button>
      </div>
    </>
  );
}

/* ── add to playlist ───────────────────────────────────────── */
function AddToPlaylistModal({ track, onDone }: { track: Track; onDone: () => void }) {
  const playlists = useLibrary((s) => s.playlists);
  const addToPlaylist = useLibrary((s) => s.addToPlaylist);
  const createPlaylist = useLibrary((s) => s.createPlaylist);

  return (
    <>
      <h3>Add to playlist</h3>
      <p>Choose a playlist, or start a new one with this song.</p>
      <div className="sheet">
        {playlists.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              const n = addToPlaylist(p.id, track);
              toast(n ? `Added to ${p.name}` : `Already in ${p.name}`, !!n);
              onDone();
            }}
          >
            <Icon name="queue" /> {p.name}
          </button>
        ))}
        <button
          onClick={() => {
            const id = createPlaylist(`My playlist ${playlists.length + 1}`, [track]);
            toast("Playlist created", true);
            onDone();
            useUi.getState().navigate({ name: "playlist", id });
          }}
        >
          <Icon name="plus" /> New playlist with this song
        </button>
      </div>
      <div className="row">
        <button className="btn2 ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </>
  );
}

/* ── create / rename ───────────────────────────────────────── */
function NameInput({
  initial,
  placeholder,
  onSubmit,
  submitLabel,
  onDone,
}: {
  initial?: string;
  placeholder: string;
  onSubmit: (name: string) => void;
  submitLabel: string;
  onDone: () => void;
}) {
  const [name, setName] = useState(initial || "");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <>
      <h3>{initial ? "Rename playlist" : "New playlist"}</h3>
      <p>{initial ? "Give it a name that fits." : "Playlists live on this device — no account needed."}</p>
      <input
        ref={ref}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) {
            onSubmit(name.trim());
            onDone();
          }
        }}
      />
      <div className="row">
        <button className="btn2 ghost" onClick={onDone}>
          Cancel
        </button>
        <button
          className="btn2"
          disabled={!name.trim()}
          onClick={() => {
            if (!name.trim()) return;
            onSubmit(name.trim());
            onDone();
          }}
        >
          {submitLabel}
        </button>
      </div>
    </>
  );
}

function CreatePlaylistModal({ onDone }: { onDone: () => void }) {
  const count = useLibrary((s) => s.playlists.length);
  return (
    <NameInput
      placeholder={`My playlist ${count + 1}`}
      submitLabel="Create"
      onDone={onDone}
      onSubmit={(name) => {
        const id = useLibrary.getState().createPlaylist(name);
        toast("Playlist created", true);
        useUi.getState().navigate({ name: "playlist", id });
      }}
    />
  );
}

function RenameModal({ id, initial, onDone }: { id: string; initial: string; onDone: () => void }) {
  return (
    <NameInput
      initial={initial}
      placeholder="Playlist name"
      submitLabel="Save"
      onDone={onDone}
      onSubmit={(name) => {
        useLibrary.getState().renamePlaylist(id, name);
        toast("Playlist renamed", true);
      }}
    />
  );
}

/* ── generic confirm ───────────────────────────────────────── */
function ConfirmModal({
  title,
  text,
  confirmLabel,
  danger,
  onDone,
  onConfirm,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  onDone: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <h3>{title}</h3>
      <p>{text}</p>
      <div className="row">
        <button className="btn2 ghost" onClick={onDone}>
          Cancel
        </button>
        <button
          className="btn2"
          style={danger ? { background: "var(--danger)", color: "#fff" } : undefined}
          onClick={() => {
            onConfirm();
            onDone();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </>
  );
}

/* ── spotify import (mockup modal, real pipeline) ──────────── */
function ImportModal({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SpotifyImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const run = async () => {
    if (!url.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/import/spotify?url=${encodeURIComponent(url.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setResult(data);
    } catch (e) {
      setError(
        e instanceof Error && e.message !== "Import failed"
          ? `Import failed: ${e.message}`
          : "Import failed — is the playlist public?"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h3>Import playlist</h3>
      <p>
        Paste a public Spotify playlist link. Every song is search-matched and added
        to your library as a local playlist.
      </p>
      <input
        ref={ref}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://open.spotify.com/playlist/…"
        onKeyDown={(e) => e.key === "Enter" && void run()}
        disabled={loading}
      />
      {loading && <p className="sub" style={{ marginTop: 10 }}>Matching tracks… this can take a minute.</p>}
      {error && (
        <p className="sub" style={{ marginTop: 10, color: "var(--danger)" }}>
          {error}
        </p>
      )}
      {result && (
        <div className="sheet" style={{ marginTop: 12, maxHeight: 220, overflow: "auto" }}>
          <button style={{ cursor: "default" }}>
            <Icon name="check" /> <b>{result.name}</b>&nbsp;· {result.tracks.length}/{result.total} matched
            {result.unmatched.length ? ` · ${result.unmatched.length} not found` : ""}
          </button>
          {result.tracks.slice(0, 30).map((t) => (
            <div key={t.videoId} className="qrow" style={{ cursor: "default", padding: "6px 12px" }}>
              <MiniArt track={t} className="mini" style={{ width: 32, height: 32 }} />
              <div className="grow">
                <div className="title trunc" style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="row">
        <button className="btn2 ghost" onClick={onDone}>
          Cancel
        </button>
        {!result ? (
          <button className="btn2" disabled={!url.trim() || loading} onClick={() => void run()}>
            {loading ? "Importing…" : "Import"}
          </button>
        ) : (
          <button
            className="btn2"
            disabled={!result.tracks.length}
            onClick={() => {
              const id = useLibrary
                .getState()
                .createPlaylist(result.name || "Imported playlist", result.tracks);
              toast(`Imported ${result.tracks.length}/${result.total} tracks`, true);
              onDone();
              useUi.getState().navigate({ name: "playlist", id });
            }}
          >
            Save {result.tracks.length} tracks
          </button>
        )}
      </div>
    </>
  );
}
