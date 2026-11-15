import { test } from "node:test";
import assert from "node:assert/strict";
import { cached, cacheSet, cacheGet } from "../src/lib/server/cache.ts";

test("cached shares one computation between concurrent callers", async () => {
  let runs = 0;
  const fn = async () => {
    runs++;
    await new Promise((r) => setTimeout(r, 20));
    return { ok: true, runs };
  };
  const key = "test:inflight:" + Math.random();
  // three callers racing on a cold key must trigger exactly one computation
  const [a, b, c] = await Promise.all([cached(key, 10_000, fn), cached(key, 10_000, fn), cached(key, 10_000, fn)]);
  assert.equal(runs, 1, "fn should run once for concurrent callers");
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
});

test("cached still serves the cached value after the computation lands", async () => {
  let runs = 0;
  const fn = async () => {
    runs++;
    return runs;
  };
  const key = "test:inflight:landed:" + Math.random();
  const first = await cached(key, 10_000, fn);
  const second = await cached(key, 10_000, fn);
  assert.equal(runs, 1);
  assert.equal(first, 1);
  assert.equal(second, 1);
});

test("a rejected computation is not cached — the next caller retries", async () => {
  let runs = 0;
  const key = "test:inflight:reject:" + Math.random();
  const boom = () => {
    runs++;
    return Promise.reject(new Error("boom"));
  };
  await assert.rejects(() => cached(key, 10_000, boom), /boom/);
  await assert.rejects(() => cached(key, 10_000, boom), /boom/);
  assert.equal(runs, 2, "each failed call should be retried, not served the rejection");
  // and the failed key never poisons the store
  assert.equal(cacheGet(key), null);
});

test("cacheSet/cacheGet roundtrip and expiry still work", async () => {
  const key = "test:inflight:roundtrip:" + Math.random();
  cacheSet(key, 42, 10);
  assert.equal(cacheGet(key), 42);
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(cacheGet(key), null, "expired entries are dropped");
});
