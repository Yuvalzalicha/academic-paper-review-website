# PaperTrail Video Export Pipeline

PaperTrail's static frontend calls a Supabase Edge Function at:

```text
<SUPABASE_URL>/functions/v1/video-jobs
```

The function creates a `video_jobs` row containing:

- paper metadata and abstract
- selected duration
- generated scene plan
- narration text
- captions
- scene timings
- visual instructions
- vertical 9:16 composition HTML
- render manifest for an MP4 renderer

## Deployment

Run the updated `supabase-schema.sql` in Supabase SQL Editor, then deploy:

```bash
supabase functions deploy video-jobs
```

Required Edge Function secrets:

```bash
supabase secrets set SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
supabase secrets set SUPABASE_ANON_KEY="YOUR_ANON_KEY"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
```

Optional renderer integration:

```bash
supabase secrets set VIDEO_RENDER_WEBHOOK_URL="https://your-renderer.example.com/render"
supabase secrets set VIDEO_RENDER_SECRET="a-long-random-shared-secret"
```

If `VIDEO_RENDER_WEBHOOK_URL` is not configured, jobs remain queued with a complete render package in `video_jobs`.

## Renderer Contract

The renderer receives:

```json
{
  "job_id": "uuid",
  "public_token": "token",
  "composition_html": "<!doctype html>...",
  "render_manifest": {
    "target": {
      "width": 1080,
      "height": 1920,
      "fps": 30,
      "format": "mp4",
      "codec": "h264",
      "aspect_ratio": "9:16"
    }
  },
  "callback_url": "https://PROJECT.supabase.co/functions/v1/video-jobs?callback=renderer"
}
```

When rendering finishes, POST back to `callback_url`:

```json
{
  "job_id": "uuid",
  "public_token": "token",
  "status": "completed",
  "preview_url": "https://...",
  "video_url": "https://...",
  "audio_url": "https://..."
}
```

For failures:

```json
{
  "job_id": "uuid",
  "public_token": "token",
  "status": "failed",
  "error": "Renderer error message"
}
```

Send the shared secret in `x-render-secret`.

## Visual Safety

The render package uses an original PaperTrail geometric research style. It must not copy any creator branding, logo, exact color palette, voice, music, character system, or recurring visual style.
