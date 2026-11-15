import test from "node:test";
import assert from "node:assert/strict";
import { thumbarState } from "../src/lib/thumbar.ts";

const base = {
  isPlaying: false,
  index: 0,
  queue: { length: 0 },
  repeat: "off",
  autoplayRadio: false,
};

test("thumbarState: empty queue disables everything", () => {
  assert.deepEqual(thumbarState(base), {
    playing: false,
    hasTrack: false,
    hasPrev: false,
    hasNext: false,
  });
});

test("thumbarState: single paused track — play works, next dead-ends", () => {
  const s = thumbarState({ ...base, index: 0, queue: { length: 1 } });
  assert.equal(s.hasTrack, true);
  assert.equal(s.hasPrev, true); // prev restarts-or-backs like the player bar
  assert.equal(s.hasNext, false); // nothing after, no repeat, no autoplay
  assert.equal(s.playing, false);
});

test("thumbarState: single track with autoplay radio keeps next alive", () => {
  const s = thumbarState({ ...base, index: 0, queue: { length: 1 }, autoplayRadio: true });
  assert.equal(s.hasNext, true);
});

test("thumbarState: middle of a queue — prev and next both enabled", () => {
  const s = thumbarState({
    ...base,
    isPlaying: true,
    index: 2,
    queue: { length: 5 },
  });
  assert.equal(s.playing, true);
  assert.equal(s.hasPrev, true);
  assert.equal(s.hasNext, true);
});

test("thumbarState: last track dead-ends without repeat or autoplay", () => {
  const s = thumbarState({ ...base, index: 4, queue: { length: 5 } });
  assert.equal(s.hasTrack, true);
  assert.equal(s.hasNext, false);
});

test("thumbarState: repeat keeps next alive at the end of the queue", () => {
  assert.equal(
    thumbarState({ ...base, index: 4, queue: { length: 5 }, repeat: "all" }).hasNext,
    true
  );
  assert.equal(
    thumbarState({ ...base, index: 4, queue: { length: 5 }, repeat: "one" }).hasNext,
    true
  );
});

test("thumbarState: invalid index means no track", () => {
  assert.equal(thumbarState({ ...base, index: -1, queue: { length: 5 } }).hasTrack, false);
  assert.equal(thumbarState({ ...base, index: 9, queue: { length: 5 } }).hasTrack, false);
});
