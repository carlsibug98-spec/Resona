export interface Track {
  videoId: string;
  title: string;
  artist: string;
  artistId?: string;
  album?: string;
  duration?: number;
  durationText?: string;
  thumb: string;
  views?: string;
}

export interface AlbumCard {
  playlistId: string;
  title: string;
  subtitle: string;
  thumb: string;
}

export interface ArtistPage {
  name: string;
  thumb?: string;
  description?: string;
  songs: Track[];
  albums: AlbumCard[];
  singles: AlbumCard[];
}

/** global home shelf entry: a top artist from the worldwide trending chart */
export interface CatalogArtist {
  name: string;
  artistId?: string;
  hue: number;
  /** the artist's best-charting track — playable, opens their page */
  track: Track;
}

/** global home shelf entry: a trending release / new chart entry */
export interface CatalogRelease {
  track: Track;
  type: string;
  /** relative freshness label, e.g. "Today" for new chart entries */
  when?: string;
  hue: number;
}

export interface HomeCatalog {
  artists: CatalogArtist[];
  releases: CatalogRelease[];
  newReleases: CatalogRelease[];
}

export interface LyricLine {
  t: number;
  text: string;
}

export interface Lyrics {
  synced: LyricLine[] | null;
  plain: string | null;
  source: string;
}

export interface SpotifyImportResult {
  id: string;
  name: string;
  cover?: string;
  total: number;
  tracks: Track[];
  unmatched: { title: string; artist: string }[];
}

export type RepeatMode = "off" | "all" | "one";

export interface Playlist {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  tracks: Track[];
}
