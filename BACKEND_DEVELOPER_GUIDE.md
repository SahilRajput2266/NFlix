# Backend Developer Guide

This guide describes the APIs and backend flow currently used by this website. It distinguishes movie metadata from actual video playback: the catalog is populated from metadata providers, while playback is either loaded from a third-party embed or served from the site's separate upload/transcode pipeline.

## 1. Architecture at a glance

```text
Browser
  ├─ GET /api/catalog/* ──> Express catalog routes
  │                          └─ TMDB API (primary) / Cinemeta (fallback)
  ├─ Third-party iframe ────> 2Embed, AutoEmbed, Vidsrc
  └─ GET /api/videos/* ────> Express video routes
                               ├─ JSON job/playback state
                               ├─ FFmpeg-generated HLS in storage/hls
                               └─ AES-128 key endpoint
```

The server is an Express application started by `npm start` (`node src/server.js`). Its default port is `4000`; set `PORT` to override it. Static website assets are served from `src/public`, and generated HLS files are exposed under `/storage/hls`.

## 2. Movie catalog and metadata providers

### Primary provider: TMDB API v3

The server-side adapter is `src/services/tmdbService.js`. It calls `https://api.themoviedb.org/3`, keeping the TMDB credential on the server. Requests use the `api_key` query parameter. If `TMDB_ACCESS_TOKEN` is set, the adapter also sends it as a bearer authorization header.

The adapter currently uses these TMDB endpoints:

| Website data | TMDB endpoint | How the website uses it |
|---|---|---|
| Trending movies | `GET /trending/movie/day` | Top 10 row and fallback for the latest row |
| Currently playing movies | `GET /movie/now_playing` | “Latest Releases” row (the label in the UI is static; the API is not restricted to 2024–2025) |
| Action / Sci-Fi rows | `GET /discover/movie?with_genres=28&sort_by=popularity.desc` and `...with_genres=878...` | Genre rows; TMDB genre IDs 28 = Action and 878 = Science Fiction |
| Search | `GET /search/movie?query={query}` | Search suggestions |
| Full movie details | `GET /movie/{tmdbId}?append_to_response=credits,videos,external_ids` | Overview, runtime, genre names, cast, director, trailer key, and IMDb ID |
| Resolve an IMDb ID | `GET /find/{imdbId}?external_source=imdb_id` | Converts an IMDb ID to a TMDB movie ID before requesting details |

The service also defines `GET /movie/top_rated`, but the current website routes do not call it.

### Fallback metadata provider: Cinemeta

On TMDB request failures, catalog and search methods fall back to:

- `https://v3-cinemeta.strem.io/catalog/movie/top.json`
- `https://v3-cinemeta.strem.io/catalog/movie/top/genre={genre}.json`
- `https://v3-cinemeta.strem.io/catalog/movie/top/search={query}.json`
- For IMDb-ID detail fallback: `https://v3-cinemeta.strem.io/meta/movie/{imdbId}.json`

These are best-effort fallbacks. The service uses an 8-second timeout for TMDB and a 5-second timeout for Cinemeta. In-memory metadata results are cached for five minutes. A failed fallback returns an empty list (or `null` for details).

### Image URLs and normalized movie shape

TMDB image paths are expanded using:

- Poster: `https://image.tmdb.org/t/p/w500/{poster_path}`
- Backdrop: `https://image.tmdb.org/t/p/original/{backdrop_path}`

The backend normalizes catalog items to fields such as:

```json
{
  "id": 123,
  "tmdbId": 123,
  "imdbId": "tt1234567",
  "title": "Example Movie",
  "year": "2025",
  "rating": "7.8",
  "matchScore": "91% Match",
  "duration": "2h 5m",
  "genre": "Action / Sci-Fi",
  "synopsis": "Overview text",
  "poster": "https://image.tmdb.org/t/p/w500/...",
  "backdrop": "https://image.tmdb.org/t/p/original/..."
}
```

Some values are presentation defaults, not verified metadata: for example, missing year/runtime/rating/overview use fallback strings or values, and `matchScore` is calculated from the rating. Catalog lists generally have genre IDs but not runtime, so a default duration may be shown.

## 3. Website-facing catalog API

All endpoints below are same-origin and do not require authentication in the current implementation.

### `GET /api/catalog/categories`

Called on initial page load. The route fetches currently playing, trending, Action, and Science Fiction data concurrently and returns:

```json
{
  "success": true,
  "categories": [
    { "id": "latest", "title": "...", "movies": [] },
    { "id": "top10", "title": "...", "isRanked": true, "movies": [] },
    { "id": "action", "title": "...", "movies": [] },
    { "id": "scifi", "title": "...", "movies": [] }
  ]
}
```

The latest row takes up to 12 currently playing results, or trending results if the latest list is empty. The Top 10 row takes up to 10 trending results. Each genre row takes up to 12 results. The first unique catalog item is used as the hero item.

### `GET /api/catalog/movie/:id`

Fetches full metadata for a movie. `:id` should normally be a TMDB movie ID. The service also attempts to resolve IDs beginning with `tt` as IMDb IDs. The result is `{ "success": true, "movie": {...} }`, where the normalized movie adds:

- `genresList`: full genre-name list
- `cast`: up to eight `{ name, character, profile }` entries
- `director`
- `trailerKey`
- `tagline`
- `imdbId`
- `downloads`: three hard-coded embed URLs and displayed quality/size labels

The download entries are not generated download files or first-party streaming endpoints. They point to third-party embed hosts and use displayed size estimates.

### `GET /api/catalog/search?q={query}`

Returns up to ten normalized results:

```json
{ "success": true, "query": "example", "count": 1, "movies": [] }
```

**Frontend integration issue to account for:** `src/public/cloudStream.js` currently reads `data.results`, but this route returns `data.movies`. As written, the search suggestions do not consume the response correctly. When recreating or integrating this backend, use one consistent response key (preferably `movies`) on both sides.

### `GET /api/catalog/trending`

Returns `{ "success": true, "count": n, "movies": [...] }` from the trending service.

## 4. Playback choices and third-party embeds

The movie detail and player UI use IMDb IDs to construct iframe URLs. The current embed choices are:

| UI server choice | URL pattern |
|---|---|
| 2Embed | `https://www.2embed.cc/embed/{imdbId}` |
| AutoEmbed | `https://player.autoembed.co/embed/movie/{imdbId}` |
| Vidsrc.to | `https://vidsrc.to/embed/movie/{imdbId}` |
| Vidsrc.xyz | `https://vidsrc.xyz/embed/movie?imdb={imdbId}` |

The browser loads these providers directly in an iframe; the Express backend does not fetch, proxy, or transcode their video. Availability, content rights, and provider terms are external to this application. Detail/download URL quality and file-size labels are static UI data, not verified provider responses.

The code currently constructs a fallback IMDb-like value as `tt${id}` when no IMDb ID is present. A numeric TMDB ID is not necessarily an IMDb ID, so a production integration should resolve it through TMDB `external_ids` or `/find` rather than assume the prefix conversion is valid.

## 5. Separate local upload and HLS streaming API

This is a different path from the TMDB movie catalog. Uploaded local videos get a generated UUID and are processed into HLS; catalog movies are not automatically downloaded or added to this pipeline.

### Endpoints

| Method and path | Purpose |
|---|---|
| `POST /api/videos/upload` | Multipart upload. File field is `video`; optional text field `title`. Accepts MP4, MOV, MKV, and WEBM, with a 500 MiB limit. Returns `201` with the queued job. |
| `GET /api/videos` | Lists jobs and attaches each video's saved playback record as `playback` (or `null`). |
| `GET /api/videos/continue-watching` | Returns ready videos whose progress is over 2% and below 95%, ordered by most recently watched. |
| `GET /api/videos/cluster-stats` | Returns queue totals and worker telemetry. |
| `GET /api/videos/:videoId/status` | Returns job state and its playback record; returns `404` if the job is missing. |
| `GET /api/videos/:videoId/key` | Returns the raw 16-byte AES key as `application/octet-stream`; returns `404` if missing. |
| `POST /api/videos/:videoId/heartbeat` | Saves progress from JSON `{ "currentTime": number, "duration": number, "profile": "..." }`. |
| `DELETE /api/videos/:videoId` | Removes the job, source file, HLS output, and playback record. |

`GET /api/health` returns server status, transcoder label, and timestamp.

### Upload-to-playback lifecycle

1. Multer writes the accepted upload to `storage/raw` with a UUID filename.
2. The job is persisted in `storage/jobs.json` with status `queued`.
3. The in-process job queue assigns queued jobs to one of two simulated workers (`node-alpha`, `node-beta`). These are not separate machines or a distributed cluster.
4. FFprobe reads media metadata; FFmpeg extracts a poster and transcodes eligible profiles.
5. Profiles are HLS VOD playlists with four-second segments. The configured target profiles are 360p, 720p, and 1080p, limited to profiles no taller than the source (with a 360p minimum fallback).
6. AES-128-CBC encryption uses a generated 16-byte key and IV. FFmpeg writes encrypted profile playlists and segments; a master playlist is written under `storage/hls/{videoId}/master.m3u8`.
7. The browser can request the master playlist at `/storage/hls/{videoId}/master.m3u8`. The key URI in the encrypted playlist points to `/api/videos/{videoId}/key`.
8. Playback state is written to `storage/playback.json` through the heartbeat endpoint and can be used to resume a video.

The upload limit, accepted MIME types/extensions, encoder settings, and output profile bitrates are implemented in `src/routes/videoRoutes.js` and `src/config.js`. Persistent job/playback state is local JSON, not a shared database, so it is not suitable for horizontally scaled servers without replacing the state store.

### Current playback integration gap

`src/public/index.html` loads `cloudStream.js`, which uses the third-party iframe path. The separate `src/public/app.js` contains native HLS playback code for uploaded videos, but it is not loaded by the page. It also declares heartbeat-related variables without wiring periodic heartbeat requests. To expose local HLS playback in the website, load/integrate that client code and send periodic `POST /api/videos/:videoId/heartbeat` updates; do not assume the catalog Play button invokes the local transcoder.

## 6. Configuration and local development

1. Install the declared dependencies with `npm install`.
2. Set `TMDB_API_KEY` in the environment (or a root `.env` file). Optionally configure `TMDB_ACCESS_TOKEN` and `PORT`.
3. Start with `npm start` or `npm run dev`.
4. Open `http://localhost:4000`. Check `GET /api/health` if the server does not respond.

FFmpeg and FFprobe binaries are supplied by the declared installer packages. Node.js must provide global `fetch`, `AbortController`, and `setImmediate` (use a modern Node.js release, such as Node 18 or newer).

The current configuration contains a hard-coded TMDB API-key fallback. Replace it with a required environment variable and rotate the credential before deployment; never commit a working API key. Also note that the current API has permissive CORS, no authentication, and an unauthenticated raw-key endpoint. Add access control, origin policy, rate limits, upload/content validation, and proper key protection before exposing it publicly.

## 7. Implementation map

| Concern | Source |
|---|---|
| Express server, static content, HLS static serving | `src/server.js` |
| Port, credentials, storage paths, profiles | `src/config.js` |
| Catalog API responses | `src/routes/catalogRoutes.js` |
| TMDB/Cinemeta requests, caching, normalization | `src/services/tmdbService.js` |
| Upload, video status, key, heartbeat, deletion APIs | `src/routes/videoRoutes.js` |
| In-process job queue and simulated workers | `src/queue/jobQueue.js` |
| FFprobe/FFmpeg transcoding and HLS output | `src/services/transcoder.js` |
| AES key and key-info file generation | `src/services/encryptionService.js` |
| HLS master playlist generation | `src/services/playlistBuilder.js` |
| Playback history persistence | `src/services/playbackService.js` |
| Catalog, details, search, and embed player UI | `src/public/cloudStream.js` |
| Separate local HLS player client (not currently loaded by the page) | `src/public/app.js` |
