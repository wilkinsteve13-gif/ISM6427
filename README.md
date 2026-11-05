# ISM6427

## SongForge — AI music generator

Web app that turns a text idea (or your own style + lyrics) into full songs using the [SunoAPI.org](https://docs.sunoapi.org/) API.

**Stack:** static HTML/CSS/JS in `public/` + Netlify Functions in `netlify/functions/` that proxy the Suno API. The API key lives only in a Netlify environment variable. It never goes to the browser or the repo.

### Features
- **Simple mode:** describe a song and Suno writes the lyrics and music.
- **Custom mode:** title, style tags, your own lyrics, styles to avoid, vocal gender, and length.
- **Write lyrics with AI:** generates lyric options you can drop into Custom mode.
- Instrumental toggle and model picker (V6, V6 Mini, V6 Wild).
- Live status. Each run produces 2 tracks, and you can stream them as soon as the first audio is ready.
- Song history saved in the browser, with download, lyrics, and "reuse settings".
- Remaining-credit counter.
- Optional password gate so strangers can't spend your credits.

### Deploy on Netlify
1. Netlify → **Add new site → Import from Git** → pick this repo, branch `main`. Build settings come from `netlify.toml` (publish `public`, functions `netlify/functions`), so leave the build command blank.
2. **Site configuration → Environment variables** → add:
   - `SUNO_API_KEY` = your SunoAPI.org key (**required**)
   - `APP_PASSWORD` = any password (**recommended**). Without it, anyone with the URL can spend your credits.
3. Trigger a redeploy so the functions pick up the variables.

### API routes (Netlify Functions)
| Route | Suno endpoint |
|---|---|
| `POST /api/generate` | `POST /api/v1/generate` |
| `GET /api/status?taskId=` | `GET /api/v1/generate/record-info` |
| `POST /api/lyrics`, `GET /api/lyrics?taskId=` | `POST /api/v1/lyrics`, `GET /api/v1/lyrics/record-info` |
| `GET /api/credits` | `GET /api/v1/generate/credit` |
| `POST /api/callback` | no-op receiver for Suno's required `callBackUrl` (the app polls for results instead) |

Generated audio is hosted by Suno and expires after about 14 days.

### Other projects
- Weather app: `public/weather/` (served at `/weather/`)
