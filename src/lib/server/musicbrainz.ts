import { cacheGet, cacheSet, fetchWithTimeout } from "./cache";

/**
 * Real credits (writers / producers / performers) from MusicBrainz.
 * Two throttled requests per unknown track (search + lookup), cached 24 h.
 */

export interface CreditPerson {
  name: string;
  role: string;
}

export interface CreditsResult {
  source: "musicbrainz" | "none";
  persons: CreditPerson[];
  album?: string;
  year?: string;
}

const MB = "https://musicbrainz.org/ws/2";
const UA = "Resona/1.4.0 ( https://github.com/carlsibug98-spec/Resona )";

/* MusicBrainz asks anonymous clients to stay at ~1 request/second */
let lastReq = 0;
/* after a 503, hold off a little before the next request */
let cooldownUntil = 0;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function mbFetch(path: string): Promise<any> {
  const attempt = async (): Promise<Response> => {
    const wait = Math.max(cooldownUntil, lastReq + 1100) - Date.now();
    if (wait > 0) await sleep(wait);
    lastReq = Date.now();
    return fetchWithTimeout(
      `${MB}${path}`,
      {
        headers: { "User-Agent": UA, Accept: "application/json" },
      },
      12000
    );
  };
  let res = await attempt();
  // rate limited — patient backoff, then give up (caller doesn't cache)
  for (const backoff of [3000, 8000]) {
    if (res.status !== 503) break;
    cooldownUntil = Date.now() + backoff;
    await sleep(backoff);
    res = await attempt();
  }
  if (!res.ok) throw new Error(`musicbrainz ${res.status}`);
  return res.json();
}

/** strip Lucene metacharacters so user data can't break the query */
function luceneSafe(s: string): string {
  return s.replace(/[\\"+\-!(){}[\]^~*?:/]/g, " ").replace(/\s+/g, " ").trim();
}

const RECORDING_ROLES: Record<string, string> = {
  producer: "Producer",
  "co-producer": "Co-producer",
  "executive producer": "Executive producer",
  mix: "Mixing engineer",
  mastering: "Mastering engineer",
  engineer: "Engineer",
  "audio engineer": "Engineer",
  "vocal engineer": "Vocal engineer",
  performer: "Performer",
  vocals: "Vocals",
  "guest vocalist": "Guest vocals",
};

const WORK_ROLES: Record<string, string> = {
  composer: "Composer",
  lyricist: "Lyricist",
  librettist: "Librettist",
  author: "Author",
  writer: "Writer",
  arranger: "Arranger",
  orchestrator: "Orchestrator",
  translator: "Translator",
};

const ROLE_ORDER = ["Main artist", "Composer", "Lyricist", "Writer", "Author", "Producer", "Co-producer"];

function prettyRole(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function pickRelease(releases: any[]): { title?: string; year?: string } {
  const official = (releases || []).filter(
    (r) => r.status === "Official" || !r.status
  );
  const withDate = (official.length ? official : releases || []).filter((r) => r.date);
  const r = (withDate.length ? withDate : official[0] || (releases || [])[0]) as any;
  if (!r) return {};
  return { title: r.title, year: r.date ? String(r.date).slice(0, 4) : undefined };
}

export async function getCredits(title: string, artist: string): Promise<CreditsResult> {
  const qTitle = luceneSafe(title);
  const qArtist = luceneSafe(artist);
  if (!qTitle || !qArtist) return { source: "none", persons: [] };

  const key = `mb:${qTitle.toLowerCase()}::${qArtist.toLowerCase()}`;
  const hit = cacheGet<CreditsResult>(key);
  if (hit) return hit;
  let result: CreditsResult;
  try {
    result = await fetchCredits(qTitle, qArtist);
  } catch {
    // transient (rate limit / network) — show the fallback card, don't cache
    return { source: "none", persons: [] };
  }
  // real data keeps for a day; "genuinely not found" half an hour
  cacheSet(
    key,
    result,
    result.source === "musicbrainz" ? 1000 * 60 * 60 * 24 : 1000 * 60 * 30
  );
  return result;
}

async function fetchCredits(qTitle: string, qArtist: string): Promise<CreditsResult> {
  const query = encodeURIComponent(
    `recording:"${qTitle}" AND artist:"${qArtist}"`
  );
  const search = await mbFetch(
    `/recording?query=${query}&fmt=json&limit=8`
  );
  const recordings: any[] = search?.recordings || [];
  if (!recordings.length) return { source: "none", persons: [] };

  // prefer a high-scoring match whose artist actually matches and whose
  // title is the exact song (skips "… (outtake)" / "… (rehearsals)" takes)
  const targetArtist = qArtist.toLowerCase();
  const targetTitle = qTitle.toLowerCase();
  const artistMatches = (r: any) =>
    (r["artist-credit"] || []).some(
      (c: any) =>
        typeof c?.name === "string" &&
        c.name.toLowerCase().includes(targetArtist)
    );
  const candidates = recordings.filter((r) => (r.score ?? 0) >= 60);
  const best =
    candidates.find(
      (r) => artistMatches(r) && String(r.title || "").toLowerCase() === targetTitle
    ) ||
    candidates.find(artistMatches) ||
    candidates[0] ||
    recordings[0];
  if ((best.score ?? 0) < 40) return { source: "none", persons: [] };

  const detail = await mbFetch(
    `/recording/${best.id}?inc=artist-credits+releases+artist-rels+work-rels+work-level-rels&fmt=json`
  );
  const persons: CreditPerson[] = [];
  const seen = new Set<string>();
  const push = (name?: string, role?: string) => {
    if (!name || !role) return;
    const n = name.trim();
    if (!n || /^(various artists|unknown)$/i.test(n)) return;
    const key = `${n.toLowerCase()}::${role}`;
    if (seen.has(key)) return;
    seen.add(key);
    persons.push({ name: n, role });
  };

  // performers — first credited artist is the main artist
  if ((detail["artist-credit"] || []).length) {
    const first = (detail["artist-credit"] || []).find((c: any) => c?.artist?.name);
    for (const c of detail["artist-credit"] || []) {
      if (!c?.artist?.name) continue;
      push(c.artist.name, c === first ? "Main artist" : "Performer");
    }
  }

  // recording-level relations (producers, engineers…)
  for (const rel of detail.relations || []) {
    if (rel?.artist?.name) {
      const role =
        RECORDING_ROLES[String(rel.type || "").toLowerCase()] ||
        prettyRole(String(rel.type || ""));
      push(rel.artist.name, role);
    }
  }

  // work-level relations (writers) via the performance link
  for (const rel of detail.relations || []) {
    const work = rel?.work;
    if (!work?.relations) continue;
    for (const w of work.relations) {
      if (w?.artist?.name) {
        const role =
          WORK_ROLES[String(w.type || "").toLowerCase()] ||
          prettyRole(String(w.type || ""));
        push(w.artist.name, role);
      }
    }
  }

  persons.sort((a, b) => {
    const ai = ROLE_ORDER.indexOf(a.role);
    const bi = ROLE_ORDER.indexOf(b.role);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  const rel = pickRelease(detail.releases || best.releases);
  return {
    source: "musicbrainz",
    persons: persons.slice(0, 9),
    album: rel.title,
    year: rel.year,
  };
}
