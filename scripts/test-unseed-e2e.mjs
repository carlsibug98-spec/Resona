// Simulate the unseed migration end-to-end against real store code:
// seed a library like v1.6.8 did, run removeStarterContent, verify.
// Run: node --experimental-vm-modules nope — instead plain node with the
// built stores. Stores are "use client" but zustand works headless.
process.env.NODE_ENV = process.env.NODE_ENV || "test";

// resolve the @/ path alias for raw node (stores import @/lib/...)
import { register } from "node:module";
import { pathToFileURL } from "node:url";
register(
  new URL("./alias-loader.mjs", import.meta.url),
  pathToFileURL("./")
);

// minimal localStorage/IndexedDB shims so zustand persist doesn't crash
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
globalThis.fetch = async (url, init) => {
  // record mirror calls for assertion
  const body = JSON.parse(String(init?.body || "{}"));
  mirrorCalls.push(body);
  return { ok: true, json: async () => ({}) };
};
const mirrorCalls = [];

async function main() {
  const { useLibrary } = await import("../src/stores/library.ts");
  const { useSettings } = await import("../src/stores/settings.ts");
  const { removeStarterContent } = await import("../src/lib/unseed.ts");

  const t = (videoId, title, artist) => ({ videoId, title, artist, thumb: "" });
  const starter = [
    t("aaaaaaaaaaa", "Mahal Magmahal", "Esremborak"),
    t("bbbbbbbbbbb", "Janice", "Dilaw"),
    t("ccccccccccc", "Tahanan", "El Manu"),
  ];
  const mine = [
    t("ddddddddddd", "My Song", "Me"),
    t("eeeeeeeeeee", "Another", "You"),
  ];

  // --- v1.6.8 state: seeded likes, Late night playlist, seeded + real history
  useLibrary.setState({
    liked: {
      [starter[0].videoId]: { track: starter[0], likedAt: 1 },
      [mine[0].videoId]: { track: mine[0], likedAt: 2 },
    },
    playlists: [
      {
        id: "pl1", name: "Late night", createdAt: 1, updatedAt: 1,
        tracks: [starter[2], starter[1]],
      },
      {
        id: "pl2", name: "Road trip", createdAt: 1, updatedAt: 1,
        tracks: [mine[1]],
      },
    ],
    history: [
      { track: starter[0], at: 3 },
      { track: mine[1], at: 4 },
    ],
  });
  useSettings.setState({ unseededAt: null });

  await removeStarterContent();

  const lib = useLibrary.getState();
  const errors = [];
  const likedIds = Object.keys(lib.liked);
  if (likedIds.length !== 1 || likedIds[0] !== mine[0].videoId)
    errors.push(`liked wrong: ${likedIds}`);
  if (lib.playlists.length !== 1 || lib.playlists[0].id !== "pl2")
    errors.push(`playlists wrong: ${lib.playlists.map((p) => p.id)}`);
  if (lib.history.length !== 1 || lib.history[0].track.videoId !== mine[1].videoId)
    errors.push(`history wrong: ${lib.history.map((h) => h.track.title)}`);
  if (!useSettings.getState().unseededAt) errors.push("unseededAt not set");

  // mirror calls: unlike starter like, playlist.delete pl1, history.delete starter
  const actions = mirrorCalls.map((m) => m.action);
  for (const expected of ["unlike", "playlist.delete", "history.delete"]) {
    if (!actions.includes(expected)) errors.push(`missing mirror ${expected}: ${actions}`);
  }

  // --- second run: no-op (flag set), no extra mirror calls
  const callsBefore = mirrorCalls.length;
  await removeStarterContent();
  if (mirrorCalls.length !== callsBefore) errors.push("second run was not a no-op");

  // --- user-rebuilt "Late night" survives
  useSettings.setState({ unseededAt: null });
  mirrorCalls.length = 0;
  useLibrary.setState({
    playlists: [
      {
        id: "pl3", name: "Late night", createdAt: 1, updatedAt: 1,
        tracks: [mine[0], mine[1]],
      },
    ],
  });
  await removeStarterContent();
  if (useLibrary.getState().playlists.length !== 1)
    errors.push("user-rebuilt Late night was deleted");
  if (mirrorCalls.some((m) => m.action === "playlist.delete"))
    errors.push("user-rebuilt Late night delete was mirrored");

  if (errors.length) {
    console.error("FAILED:\n" + errors.map((e) => " - " + e).join("\n"));
    process.exit(1);
  }
  console.log("unseed E2E simulation: ALL CHECKS PASS");
  console.log("mirror actions:", actions.join(", "));
}

main().catch((e) => { console.error(e); process.exit(1); });
