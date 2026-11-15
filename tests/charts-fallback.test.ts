import { test } from "node:test";
import assert from "node:assert/strict";
import { pickChartPage, parseChartPage, type ChartPage } from "../src/lib/server/innertube.ts";
import { parseKworbRows } from "../src/lib/server/kworb.ts";

/* ---------- pickChartPage ---------- */

const PAGES: ChartPage[] = [
  { title: "Trending 20 Hong Kong", browseId: "VLtrend" },
  { title: "Daily Top Music Videos - Hong Kong", browseId: "VLdaily" },
  { title: "Top 100 Music Videos Hong Kong", browseId: "VLtop100" },
];

test("pickChartPage prefers the Top 100 page", () => {
  assert.equal(pickChartPage(PAGES)?.browseId, "VLtop100");
});

test("pickChartPage falls back to Daily Top when no Top 100", () => {
  const pages = PAGES.filter((p) => !p.title.includes("Top 100"));
  assert.equal(pickChartPage(pages)?.browseId, "VLdaily");
});

test("pickChartPage falls back to Trending, then to the first page", () => {
  const onlyTrending = [{ title: "Trending 20 Hong Kong", browseId: "VLtrend" }];
  assert.equal(pickChartPage(onlyTrending)?.browseId, "VLtrend");
  const onlyOther = [{ title: "Something else", browseId: "VLother" }];
  assert.equal(pickChartPage(onlyOther)?.browseId, "VLother");
});

test("pickChartPage returns null for an empty list", () => {
  assert.equal(pickChartPage([]), null);
});

/* ---------- parseChartPage ---------- */

/** builds a musicResponsiveListItemRenderer-shaped row */
function row(id: string, title: string, artist: string) {
  return {
    musicResponsiveListItemRenderer: {
      flexColumns: [
        {
          musicResponsiveListItemFlexColumnRenderer: {
            text: {
              runs: [
                {
                  text: title,
                  navigationEndpoint: { watchEndpoint: { videoId: id } },
                },
              ],
            },
          },
        },
        {
          musicResponsiveListItemFlexColumnRenderer: {
            text: { runs: [{ text: artist }] },
          },
        },
      ],
    },
  };
}

test("parseChartPage extracts playable tracks in order", () => {
  const data = {
    contents: [
      row("aaa", "Hong Kong (feat. 王菲季候風)", "The Weeknd"),
      row("bbb", "Sagip", "Jan Roberts"),
      row("ccc", "Janice", "Dilaw"),
    ],
  };
  const tracks = parseChartPage(data, 40);
  assert.equal(tracks.length, 3);
  assert.equal(tracks[0].videoId, "aaa");
  assert.equal(tracks[0].title, "Hong Kong (feat. 王菲季候風)");
  assert.equal(tracks[2].videoId, "ccc");
});

test("parseChartPage deduplicates repeated video ids", () => {
  const data = {
    contents: [row("dup", "Song A", "Artist A"), row("dup", "Song A", "Artist A"), row("other", "Song B", "Artist B")],
  };
  const tracks = parseChartPage(data, 40);
  assert.equal(tracks.length, 2);
  assert.deepEqual(tracks.map((t) => t.videoId), ["dup", "other"]);
});

test("parseChartPage skips rows without a video id", () => {
  const broken = {
    musicResponsiveListItemRenderer: {
      flexColumns: [
        {
          musicResponsiveListItemFlexColumnRenderer: {
            text: { runs: [{ text: "no video here" }] },
          },
        },
      ],
    },
  };
  const data = { contents: [broken, row("ok", "Song C", "Artist C")] };
  const tracks = parseChartPage(data, 40);
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].videoId, "ok");
});

test("parseChartPage respects the limit", () => {
  const data = {
    contents: [
      row("v1", "T1", "A"),
      row("v2", "T2", "B"),
      row("v3", "T3", "C"),
      row("v4", "T4", "D"),
    ],
  };
  assert.equal(parseChartPage(data, 2).length, 2);
});

/* ---------- parseKworbRows ---------- */

const KWORB_HTML = `<table>
<tr><td>1</td><td>=</td><td>Song Title (Official Music Video)</td><td>50,000,000</td><td>#1 Global, #2 United States</td></tr>
<tr><td>2</td><td>↑</td><td>Another Song [Official Video]</td><td>20,000,000</td><td>#5 Global</td></tr>
</table>`;

test("parseKworbRows extracts rank, movement and countries", () => {
  const rows = parseKworbRows(KWORB_HTML);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[0].title, "Song Title (Official Music Video)");
  assert.ok(rows[0].countries.some((c) => c.name === "Global"));
  assert.equal(rows[1].movement, "↑");
});

test("parseKworbRows returns [] for a broken page — caller must not cache it", () => {
  assert.deepEqual(parseKworbRows("<html><body>maintenance</body></html>"), []);
});
