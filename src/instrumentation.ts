/**
 * Next.js instrumentation — runs once when the server boots (not during
 * build). Warms the home catalog in the background so the first visitor
 * gets warm shelves: before this, a cold server made the home view sit on
 * "Loading what's popular worldwide…" while ~26 chart titles resolved
 * one by one through YouTube Music search.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { warmTrending } = await import("./lib/server/catalog");
      warmTrending();
    } catch (e) {
      console.warn(
        "instrumentation: warm-up could not start (%s)",
        e instanceof Error ? e.message : e
      );
    }
  }
}
