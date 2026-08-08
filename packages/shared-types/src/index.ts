/**
 * @streamify/shared-types — packages/shared-types/src/index.ts
 *
 * Single source of truth for every TypeScript interface, type alias, and enum
 * shared across all Streamify services and the React web app.
 *
 * Organisation:
 *  1. Primitive helpers & enums
 *  2. Auth
 *  3. User, Profile, Preferences, Listening History
 *  4. Catalog — Artist, Album, Track, Genre
 *  5. Playlist & PlaylistTrack
 *  6. Stream (HLS / CloudFront)
 *  7. Search
 *  8. RabbitMQ event catalogue
 *  9. Common API shapes (success, error, pagination)
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. PRIMITIVE HELPERS & ENUMS
// ─────────────────────────────────────────────────────────────────────────────

/** ISO-8601 date-time string (returned by all services as JSON). */
export type ISODateString = string;

/** UUID v4 string. */
export type UUID = string;

// ─── Audio quality ───────────────────────────────────────────────────────────

export enum AudioQuality {
  LOW = 'LOW',         // 128 kbps
  NORMAL = 'NORMAL',   // 256 kbps
  HIGH = 'HIGH',       // 320 kbps
  LOSSLESS = 'LOSSLESS', // future / placeholder
}

// ─── Track transcoding status ─────────────────────────────────────────────────

export enum TrackStatus {
  PROCESSING = 'PROCESSING', // raw MP3 received, awaiting FFmpeg
  READY = 'READY',           // HLS segments on S3, ready to stream
  ERROR = 'ERROR',           // transcoding failed
}

// ─── Playlist visibility ──────────────────────────────────────────────────────

export enum PlaylistVisibility {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE',
  UNLISTED = 'UNLISTED',
}

// ─── OAuth provider ───────────────────────────────────────────────────────────

export enum OAuthProvider {
  GOOGLE = 'GOOGLE',
  LOCAL = 'LOCAL', // email + password
}

// ─── Follow entity type ───────────────────────────────────────────────────────

export enum FollowTargetType {
  USER = 'USER',
  ARTIST = 'ARTIST',
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. AUTH
// ─────────────────────────────────────────────────────────────────────────────

/** Access + refresh token pair returned on login / register. */
export interface TokenPair {
  /** Short-lived JWT (15 min). Stored in-memory (Zustand) — never localStorage. */
  accessToken: string;
  /**
   * Long-lived UUID v4 (7-day TTL in Redis).
   * Delivered via httpOnly cookie; this field is only present during
   * the initial auth response so the client can verify issuance.
   */
  refreshToken: string;
}

/** Claims decoded from the JWT access token. */
export interface JwtPayload {
  /** Subject — the Streamify userId (UUID). */
  sub: UUID;
  email: string;
  displayName: string;
  iat: number; // issued at (Unix seconds)
  exp: number; // expires at (Unix seconds)
}

/** Body accepted by POST /auth/register */
export interface RegisterDto {
  email: string;
  password: string;
  displayName: string;
}

/** Body accepted by POST /auth/login */
export interface LoginDto {
  email: string;
  password: string;
}

/** Body accepted by POST /auth/oauth/google (after Google callback) */
export interface GoogleOAuthDto {
  code: string;      // authorisation code from Google
  redirectUri: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. USER, PROFILE, PREFERENCES, LISTENING HISTORY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full user document stored in the user-service (MongoDB).
 * Contains both public and private fields.
 */
export interface User {
  /** MongoDB _id cast to string. */
  id: UUID;
  /** Auth-service userId — used as the cross-service identity key. */
  authId: UUID;
  email: string;
  displayName: string;
  avatarUrl?: string;
  country?: string;
  /** ISO 3166-1 alpha-2, e.g. "IN", "US". */
  bio?: string;
  provider: OAuthProvider;
  followerCount: number;
  followingCount: number;
  isVerifiedArtist: boolean;
  preferences: UserPreferences;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/**
 * Public-facing subset of a User — returned by GET /users/:id.
 * Never exposes email or private preferences.
 */
export interface UserProfile {
  id: UUID;
  displayName: string;
  avatarUrl?: string;
  country?: string;
  bio?: string;
  followerCount: number;
  followingCount: number;
  isVerifiedArtist: boolean;
  createdAt: ISODateString;
}

/** Stored per-user in MongoDB; updated via PUT /users/me/preferences */
export interface UserPreferences {
  audioQuality: AudioQuality;
  /** If false, explicit tracks are hidden from results. */
  explicitContent: boolean;
  /** BCP-47 language tag, e.g. "en-US". */
  language: string;
  /** Whether to receive email newsletters. */
  emailNotifications: boolean;
  /** Whether to receive browser/mobile push notifications. */
  pushNotifications: boolean;
  /** Preferred genres used by the recommendation engine. */
  preferredGenres: string[];
}

/**
 * A single entry in a user's listening history.
 * Stored in MongoDB (user-service) and also published as a track.played event.
 */
export interface ListeningHistoryEntry {
  id: UUID;
  userId: UUID;
  trackId: UUID;
  /** Resolved track metadata (denormalised for fast reads). */
  track?: TrackSummary;
  /** Milliseconds of the track the user actually listened to. */
  durationPlayedMs: number;
  /** Range 0–1: durationPlayed / track.durationMs. */
  completionRatio: number;
  /** Source context in which the track was played. */
  context: PlaybackContext;
  playedAt: ISODateString;
}

/** Lightweight track reference embedded in listening history and playlists. */
export interface TrackSummary {
  id: UUID;
  title: string;
  artistId: UUID;
  artistName: string;
  albumId: UUID;
  albumName: string;
  coverUrl: string;
  durationMs: number;
  explicit: boolean;
}

/** Where a track was played from — used for analytics and recommendation context. */
export interface PlaybackContext {
  type: 'PLAYLIST' | 'ALBUM' | 'ARTIST_PAGE' | 'SEARCH' | 'DISCOVER' | 'QUEUE' | 'UNKNOWN';
  /** The playlist / album / artist id that initiated playback, if applicable. */
  sourceId?: UUID;
}

/** Follow relationship document (stored in user-service MongoDB). */
export interface Follow {
  id: UUID;
  followerId: UUID;
  followedId: UUID;
  targetType: FollowTargetType;
  createdAt: ISODateString;
}

/** Body accepted by PUT /users/me */
export interface UpdateProfileDto {
  displayName?: string;
  country?: string;
  bio?: string;
}

/** Body accepted by PUT /users/me/preferences */
export type UpdatePreferencesDto = Partial<UserPreferences>;

// ─────────────────────────────────────────────────────────────────────────────
// 4. CATALOG — ARTIST, ALBUM, TRACK, GENRE
// ─────────────────────────────────────────────────────────────────────────────

/** Music genre tag (free-form string normalised to lowercase). */
export interface Genre {
  id: UUID;
  name: string;
  slug: string;
}

/**
 * Artist entity — stored in catalog-service (PostgreSQL).
 * An artist can be linked to a Streamify user account (isVerifiedArtist = true).
 */
export interface Artist {
  id: UUID;
  name: string;
  bio?: string;
  avatarUrl?: string;
  /** ISO 3166-1 alpha-2 country code. */
  country?: string;
  genres: string[];
  followerCount: number;
  /** Links artist to a user-service userId when they have a verified account. */
  linkedUserId?: UUID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Artist with their full discography — returned by GET /catalog/artists/:id */
export interface ArtistWithDiscography extends Artist {
  albums: AlbumSummary[];
  topTracks: Track[];
}

/** Lightweight album reference used inside Artist and Track responses. */
export interface AlbumSummary {
  id: UUID;
  title: string;
  coverUrl: string;
  releaseDate: ISODateString;
  trackCount: number;
}

/**
 * Album entity — stored in catalog-service (PostgreSQL).
 */
export interface Album {
  id: UUID;
  title: string;
  artistId: UUID;
  artistName: string;
  coverUrl: string;
  releaseDate: ISODateString;
  genres: string[];
  totalTracks: number;
  durationMs: number;
  label?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Album with full track list — returned by GET /catalog/albums/:id */
export interface AlbumWithTracks extends Album {
  tracks: Track[];
}

/**
 * Track entity — stored in catalog-service (PostgreSQL).
 *
 * Lifecycle:
 *   PROCESSING  →  client uploads MP3 to S3 presigned URL
 *   (stream-service transcodes to HLS)
 *   READY       →  hlsKey is set, track is streamable
 */
export interface Track {
  id: UUID;
  title: string;
  artistId: UUID;
  artistName: string;
  albumId: UUID;
  albumName: string;
  coverUrl: string;
  durationMs: number;
  trackNumber: number;
  discNumber: number;
  genres: string[];
  explicit: boolean;
  isrc?: string; // International Standard Recording Code
  status: TrackStatus;
  /** S3 key prefix for HLS manifest + segments, e.g. "hls/abc123/". Set when READY. */
  hlsKey?: string;
  /** Relative popularity score 0–100 (updated by analytics-service). */
  popularity: number;
  playCount: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Body accepted by POST /catalog/tracks */
export interface CreateTrackDto {
  title: string;
  artistId: UUID;
  albumId: UUID;
  trackNumber: number;
  discNumber?: number;
  durationMs: number;
  genres?: string[];
  explicit?: boolean;
  isrc?: string;
}

/** Response from POST /catalog/tracks — includes presigned S3 URL for direct upload. */
export interface CreateTrackResponse {
  track: Track;
  /** PUT this URL directly from the browser/client to upload the raw audio file to S3. */
  uploadUrl: string;
  /** The S3 object key that will be written to. */
  s3Key: string;
  /** When the presigned URL expires (ISO string). */
  expiresAt: ISODateString;
}

/** Body accepted by PUT /catalog/tracks/:id */
export type UpdateTrackDto = Partial<
  Pick<Track, 'title' | 'trackNumber' | 'discNumber' | 'genres' | 'explicit' | 'isrc'>
>;

// ─────────────────────────────────────────────────────────────────────────────
// 5. PLAYLIST & PLAYLISTTRACK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Playlist entity — stored in playlist-service (MongoDB).
 */
export interface Playlist {
  id: UUID;
  name: string;
  description?: string;
  coverUrl?: string;
  ownerId: UUID;
  ownerDisplayName?: string;
  visibility: PlaylistVisibility;
  /** Ordered array of track IDs. The canonical order of the playlist. */
  trackIds: UUID[];
  trackCount: number;
  /** Total duration of all tracks in milliseconds. */
  durationMs: number;
  collaborative: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/**
 * A track within a playlist — includes position metadata and resolved track data.
 * Stored in playlist-service (MongoDB) as an embedded document.
 */
export interface PlaylistTrack {
  /** Monotonically increasing position index within the playlist (0-based). */
  position: number;
  trackId: UUID;
  /** Resolved track data (denormalised from catalog-service for fast reads). */
  track: TrackSummary;
  /** The userId who added this track. */
  addedBy: UUID;
  addedAt: ISODateString;
}

/** Playlist with fully resolved tracks — returned by GET /playlists/:id */
export interface PlaylistWithTracks extends Playlist {
  tracks: PlaylistTrack[];
}

/** Body accepted by POST /playlists */
export interface CreatePlaylistDto {
  name: string;
  description?: string;
  visibility?: PlaylistVisibility;
  collaborative?: boolean;
}

/** Body accepted by PUT /playlists/:id */
export type UpdatePlaylistDto = Partial<
  Pick<Playlist, 'name' | 'description' | 'visibility' | 'collaborative'>
>;

/** Body accepted by POST /playlists/:id/tracks */
export interface AddTracksDto {
  /** One or more trackIds to add. Added in order at the end of the playlist. */
  trackIds: UUID[];
  /** Optional position to insert at (defaults to end). */
  position?: number;
}

/** Body accepted by PUT /playlists/:id/tracks/reorder */
export interface ReorderTracksDto {
  /**
   * New ordered array of all trackIds in the playlist.
   * Must contain exactly the same trackIds that are already in the playlist.
   */
  trackIds: UUID[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. STREAM (HLS / CLOUDFRONT)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Response from GET /stream/:trackId
 * The client should load `signedUrl` into HLS.js to begin playback.
 * Signed URLs expire after 1 hour; request a fresh one at the start of each session.
 */
export interface StreamUrl {
  trackId: UUID;
  /** CloudFront signed URL pointing to the HLS master manifest (.m3u8). */
  signedUrl: string;
  /** ISO timestamp — HLS.js will stop working after this time. */
  expiresAt: ISODateString;
}

/** Internal webhook body posted to POST /stream/webhook by S3 event notifications. */
export interface StreamWebhookDto {
  /** The S3 object key of the uploaded raw audio file. */
  s3Key: string;
  /** The trackId extracted from the S3 key path convention. */
  trackId: UUID;
  eventType: 'ObjectCreated';
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. SEARCH
// ─────────────────────────────────────────────────────────────────────────────

/** Full search results — returned by GET /search?q= */
export interface SearchResults {
  query: string;
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  /** Total hit count across all indexes. */
  total: number;
  /** Time taken by Elasticsearch in milliseconds. */
  tookMs: number;
}

/** A single typeahead suggestion — returned by GET /search/suggest?q= */
export interface SearchSuggestion {
  type: 'track' | 'album' | 'artist';
  id: UUID;
  /** Display label shown in the dropdown. */
  label: string;
  /** Optional subtitle (e.g. artist name under a track suggestion). */
  subLabel?: string;
  /** Cover/avatar URL for the thumbnail in the dropdown. */
  imageUrl?: string;
}

/** Trending search entry — stored in Redis sorted set; returned by GET /search/trending */
export interface TrendingSearch {
  query: string;
  /** Relative score (higher = more searches recently). */
  score: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. RABBITMQ EVENT CATALOGUE
//
// Source of truth for all async events flowing through the broker.
// Each event has:
//   - type          → routing key / discriminant
//   - payload       → strongly-typed body
//   - occurredAt    → ISO timestamp set by the publisher
//
// Event → Publisher / Consumers map:
//   user.registered    auth-service     → user-service, notification-service
//   user.followed      user-service     → notification-service
//   track.uploaded     catalog-service  → stream-service
//   track.ready        stream-service   → catalog-service, search-service
//   track.played       stream-service   → user-service, analytics-service, recommendation-service
//   artist.new_release catalog-service  → notification-service, search-service
//   search.performed   search-service   → analytics-service
// ─────────────────────────────────────────────────────────────────────────────

/** All valid event type discriminants. */
export type EventType =
  | 'user.registered'
  | 'user.followed'
  | 'track.uploaded'
  | 'track.ready'
  | 'track.played'
  | 'artist.new_release'
  | 'search.performed';

/**
 * Generic envelope wrapping every RabbitMQ message.
 * Services should publish and consume this shape.
 */
export interface StreamifyEvent<T = unknown> {
  /** Discriminant used for routing and type narrowing. */
  type: EventType;
  /** Event-specific payload. */
  payload: T;
  /** ISO timestamp set by the publisher at the moment of publishing. */
  occurredAt: ISODateString;
  /** Optional correlation ID for distributed tracing. */
  correlationId?: UUID;
}

// ─── Individual payload types ─────────────────────────────────────────────────

/**
 * user.registered
 * Publisher: auth-service
 * Consumers: user-service (create profile document), notification-service (welcome email)
 */
export interface UserRegisteredPayload {
  userId: UUID;
  authId: UUID;
  email: string;
  displayName: string;
  avatarUrl?: string;
  provider: OAuthProvider;
  registeredAt: ISODateString;
}

/**
 * user.followed
 * Publisher: user-service
 * Consumers: notification-service (push notification to followed user)
 */
export interface UserFollowedPayload {
  followerId: UUID;
  followerDisplayName: string;
  followedId: UUID;
  targetType: FollowTargetType;
  followedAt: ISODateString;
}

/**
 * track.uploaded
 * Publisher: catalog-service (after client completes the S3 presigned PUT)
 * Consumers: stream-service (begin FFmpeg → HLS transcoding pipeline)
 */
export interface TrackUploadedPayload {
  trackId: UUID;
  /** Raw MP3 S3 object key, e.g. "raw/audio/abc123.mp3" */
  s3Key: string;
  /** Artist name — included for logging/tracing convenience. */
  artistName: string;
  uploadedAt: ISODateString;
}

/**
 * track.ready
 * Publisher: stream-service (after HLS segments are written to S3)
 * Consumers:
 *   - catalog-service (update track.status = READY, set track.hlsKey)
 *   - search-service  (index the track in Elasticsearch)
 */
export interface TrackReadyPayload {
  trackId: UUID;
  /** S3 key prefix for the HLS manifest, e.g. "hls/abc123/master.m3u8" */
  hlsKey: string;
  /** Available bitrate variants produced by FFmpeg. */
  variants: HlsVariant[];
  transcodedAt: ISODateString;
}

/** A single HLS quality variant produced by the stream-service transcoder. */
export interface HlsVariant {
  bitrate: 128 | 256 | 320; // kbps
  /** S3 key for this variant's m3u8 playlist. */
  playlistKey: string;
}

/**
 * track.played
 * Publisher: stream-service (when the client requests a signed streaming URL,
 *            and again on meaningful play completion via the browser's timeupdate events)
 * Consumers:
 *   - user-service          (append to listening history)
 *   - analytics-service     (increment play counts)
 *   - recommendation-service (update collaborative-filtering model inputs)
 */
export interface TrackPlayedPayload {
  trackId: UUID;
  userId: UUID;
  /** Milliseconds actually listened (not necessarily the full track duration). */
  durationPlayedMs: number;
  /** Fraction of the track played: durationPlayedMs / track.durationMs (0–1). */
  completionRatio: number;
  context: PlaybackContext;
  playedAt: ISODateString;
}

/**
 * artist.new_release
 * Publisher: catalog-service (when a new album is published / made READY)
 * Consumers:
 *   - notification-service (email all followers of the artist)
 *   - search-service       (index or update the album in Elasticsearch)
 */
export interface ArtistNewReleasePayload {
  artistId: UUID;
  artistName: string;
  albumId: UUID;
  albumTitle: string;
  coverUrl: string;
  releaseDate: ISODateString;
  releasedAt: ISODateString;
}

/**
 * search.performed
 * Publisher: search-service (after every GET /search?q= call)
 * Consumers:
 *   - analytics-service (track search analytics, feed trending queries)
 */
export interface SearchPerformedPayload {
  query: string;
  /** Null when the request is unauthenticated. */
  userId?: UUID;
  /** Total Elasticsearch hit count across all indexes. */
  resultCount: number;
  tookMs: number;
  performedAt: ISODateString;
}

// ─── Concrete event types (convenience aliases) ───────────────────────────────

export type UserRegisteredEvent = StreamifyEvent<UserRegisteredPayload>;
export type UserFollowedEvent = StreamifyEvent<UserFollowedPayload>;
export type TrackUploadedEvent = StreamifyEvent<TrackUploadedPayload>;
export type TrackReadyEvent = StreamifyEvent<TrackReadyPayload>;
export type TrackPlayedEvent = StreamifyEvent<TrackPlayedPayload>;
export type ArtistNewReleaseEvent = StreamifyEvent<ArtistNewReleasePayload>;
export type SearchPerformedEvent = StreamifyEvent<SearchPerformedPayload>;

/** Discriminated union of all possible events — useful for type-safe consumer switches. */
export type AnyStreamifyEvent =
  | UserRegisteredEvent
  | UserFollowedEvent
  | TrackUploadedEvent
  | TrackReadyEvent
  | TrackPlayedEvent
  | ArtistNewReleaseEvent
  | SearchPerformedEvent;

// ─────────────────────────────────────────────────────────────────────────────
// 9. COMMON API SHAPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard JSON success envelope.
 * All services wrap successful responses in this shape.
 *
 * @example
 * { success: true, data: { id: "…", title: "…" } }
 */
export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

/**
 * Standard JSON error envelope.
 * All services use this shape for 4xx / 5xx responses via AppError + errorHandler.
 *
 * @example
 * { success: false, statusCode: 400, message: "Validation failed", errors: { email: ["Invalid format"] } }
 */
export interface ApiError {
  success: false;
  statusCode: number;
  message: string;
  /** Field-level validation errors from Zod, keyed by field name. */
  errors?: Record<string, string[]>;
  /** Stack trace — only included when NODE_ENV !== 'production'. */
  stack?: string;
}

/**
 * Paginated list response.
 * All list endpoints return this envelope.
 */
export interface PaginatedResponse<T> {
  data: T[];
  /** Total number of matching records in the database. */
  total: number;
  /** Current page number (1-indexed). */
  page: number;
  /** Number of records per page. */
  limit: number;
  /** Total pages: Math.ceil(total / limit). */
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Common query parameters accepted by list / search endpoints.
 * Validated with Zod in each service before use.
 */
export interface PaginationQuery {
  /** Page number (1-indexed, default: 1). */
  page?: number;
  /** Records per page (default: 20, max: 100). */
  limit?: number;
  /** Sort field name. */
  sortBy?: string;
  /** Sort direction. */
  sortOrder?: 'asc' | 'desc';
}
