import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isStarterPlaylist,
  isStarterTrack,
  STARTER_PLAYLIST_NAME,
} from "../src/lib/unseed-match.ts";

const track = (title: string, artist: string) => ({
  videoId: "dQw4w9WgXcQ",
  title,
  artist,
  thumb: "",
});

test("isStarterTrack matches the seeded songs by title+artist", () => {
  assert.ok(isStarterTrack(track("Mahal Magmahal", "Esremborak")));
  assert.ok(isStarterTrack(track("Padaba Taka", "dwta")));
  assert.ok(isStarterTrack(track("  mahal   magmahal ", "esremborak")));
});

test("isStarterTrack rejects songs the user added themselves", () => {
  assert.equal(isStarterTrack(track("Mahal Magmahal", "Someone Else")), false);
  assert.equal(isStarterTrack(track("My Own Song", "Esremborak")), false);
  assert.equal(isStarterTrack(track("Totally Different", "Nobody")), false);
});

test("isStarterPlaylist removes the seeded Late night, keeps user versions", () => {
  // the exact seeded shell (starter songs only)
  assert.ok(
    isStarterPlaylist({
      name: "Late night",
      tracks: [track("Tahanan", "El Manu"), track("Padaba Taka", "dwta")],
    })
  );
  // empty seeded shell — remove
  assert.ok(isStarterPlaylist({ name: "Late night", tracks: [] }));
  // user rebuilt "Late night" with their own music — keep
  assert.equal(
    isStarterPlaylist({
      name: "Late night",
      tracks: [track("My Song", "Me"), track("Other Song", "You"), track("Third", "Them")],
    }),
    false
  );
  // different playlist name — untouched
  assert.equal(
    isStarterPlaylist({ name: "Road trip", tracks: [track("Tahanan", "El Manu")] }),
    false
  );
});

test("STARTER_PLAYLIST_NAME is the seeded name", () => {
  assert.equal(STARTER_PLAYLIST_NAME, "Late night");
});
