import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type ScenePlan = {
  label?: string;
  time?: string;
  narration?: string;
  visual?: string;
};

type VideoJobRequest = {
  paper?: Record<string, unknown>;
  abstract?: string;
  duration?: number | string;
  scenePlan?: {
    hook?: string;
    notes?: string[];
    scenes?: ScenePlan[];
  };
  sessionId?: string;
  includeTts?: boolean;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-render-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const STYLE_SYSTEM = {
  name: "PaperTrail Geometric Research",
  format: "vertical 9:16",
  width: 1080,
  height: 1920,
  palette: {
    canvas: "#050914",
    panel: "#0d1b32",
    ink: "#f4fbff",
    muted: "#9eb3c7",
    cyan: "#58e6ff",
    gold: "#ffcf70",
    violet: "#9d7cff",
  },
  typography: "system sans-serif with tabular research labels",
  safety:
    "Original geometric explainer. Do not copy any creator branding, logo, exact palette, voice, music, character system, or recurring visual style.",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function env(name: string) {
  return Deno.env.get(name) || "";
}

function adminClient() {
  const url = env("SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function getUserId(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return null;

  const url = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;

  const client = createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { data } = await client.auth.getUser();
  return data.user?.id || null;
}

function cleanText(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.replace(/\s+/g, " ").trim() || fallback;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clampDuration(value: unknown) {
  const duration = Number(value) || 60;
  if (duration <= 45) return 45;
  if (duration >= 90) return 90;
  return 60;
}

function parseSceneTime(scene: ScenePlan, index: number, duration: number) {
  const match = cleanText(scene.time).match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)s$/);
  if (match) {
    const start = Math.max(0, Number(match[1]));
    const end = Math.min(duration, Number(match[2]));
    return {
      start,
      end: Math.max(start + 1, end),
    };
  }

  const sceneCount = 6;
  const each = duration / sceneCount;
  const start = Math.round(index * each * 10) / 10;
  return {
    start,
    end: Math.round((index + 1) * each * 10) / 10,
  };
}

function normalizeScenes(scenePlan: VideoJobRequest["scenePlan"], duration: number) {
  const sourceScenes = scenePlan?.scenes?.length ? scenePlan.scenes.slice(0, 8) : [];
  const fallbackScenes: ScenePlan[] = [
    {
      label: "Hook",
      narration: cleanText(scenePlan?.hook, "This paper becomes clearer when its argument is rebuilt visually."),
      visual: "A research question forms from dots, lines, and a narrowing evidence path.",
    },
    {
      label: "Problem",
      narration: "The field has a gap, uncertainty, or measurement problem that the paper tries to resolve.",
      visual: "A noisy field map collapses into one highlighted gap.",
    },
    {
      label: "Method",
      narration: "The method transforms assumptions, data, or theory into a testable claim.",
      visual: "Input blocks flow through a method frame into a claim panel.",
    },
    {
      label: "Evidence",
      narration: "The evidence should be separated from the authors' interpretation.",
      visual: "Evidence bars rise beside an interpretation label.",
    },
    {
      label: "Limit",
      narration: "The strongest limitation is the pressure point for critique or replication.",
      visual: "One assumption glows while the rest of the system dims.",
    },
    {
      label: "Decision",
      narration: "The research decision is whether to cite, replicate, challenge, build on, monitor, or skip.",
      visual: "A decision matrix resolves into a final research action.",
    },
  ];

  return (sourceScenes.length ? sourceScenes : fallbackScenes).map((scene, index) => {
    const timing = parseSceneTime(scene, index, duration);
    return {
      label: cleanText(scene.label, `Scene ${index + 1}`).slice(0, 80),
      start: timing.start,
      end: timing.end,
      duration: Math.max(1, Math.round((timing.end - timing.start) * 10) / 10),
      narration: cleanText(scene.narration, "Narration pending.").slice(0, 900),
      visual: cleanText(scene.visual, "Original geometric research animation.").slice(0, 900),
    };
  });
}

function buildNarration(scenes: ReturnType<typeof normalizeScenes>) {
  return scenes.map((scene) => scene.narration).join("\n\n");
}

function buildCaptions(scenes: ReturnType<typeof normalizeScenes>) {
  return scenes.map((scene) => ({
    start: scene.start,
    end: scene.end,
    text: scene.narration,
  }));
}

function buildVisualInstructions(paper: Record<string, unknown>, scenes: ReturnType<typeof normalizeScenes>, includeTts: boolean) {
  return {
    styleSystem: STYLE_SYSTEM,
    title: cleanText(paper.title, "Untitled research paper"),
    aspectRatio: "9:16",
    safeArea: "Keep captions within the central 820px width and above platform UI zones.",
    motion:
      "Use precise geometric motion: graph nodes, research grids, evidence bars, method blocks, assumption highlights, and decision matrices.",
    audio: includeTts
      ? "Generate neutral professional narration from narration_text. No celebrity imitation or creator voice matching."
      : "No TTS requested. Renderer may export silent video with captions.",
    scenes,
  };
}

function buildCompositionHtml(jobId: string, paper: Record<string, unknown>, scenes: ReturnType<typeof normalizeScenes>, duration: number) {
  const title = cleanText(paper.title, "Research paper");
  const source = cleanText(paper.source, "PaperTrail");
  const sceneMarkup = scenes
    .map((scene, index) => {
      const accent = index % 3 === 0 ? STYLE_SYSTEM.palette.cyan : index % 3 === 1 ? STYLE_SYSTEM.palette.gold : STYLE_SYSTEM.palette.violet;
      return `
        <section class="scene" data-start="${scene.start}" data-duration="${scene.duration}" style="--accent:${accent};">
          <div class="scene-grid">
            <p class="scene-kicker">${escapeHtml(scene.label)} / ${scene.start}s-${scene.end}s</p>
            <h2>${escapeHtml(scene.narration)}</h2>
            <div class="diagram diagram-${index % 4}">
              <span></span><span></span><span></span><span></span><span></span>
            </div>
            <p class="visual-note">${escapeHtml(scene.visual)}</p>
          </div>
        </section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=1080,height=1920">
    <title>${escapeHtml(title)} | PaperTrail Short</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        width: 1080px;
        height: 1920px;
        overflow: hidden;
        color: ${STYLE_SYSTEM.palette.ink};
        background: ${STYLE_SYSTEM.palette.canvas};
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      [data-composition-id="papertrail-short"] {
        position: relative;
        width: 1080px;
        height: 1920px;
        overflow: hidden;
        background:
          radial-gradient(circle at 20% 10%, rgba(88, 230, 255, 0.18), transparent 360px),
          radial-gradient(circle at 82% 20%, rgba(157, 124, 255, 0.18), transparent 420px),
          linear-gradient(180deg, #050914 0%, #0b1426 55%, #050914 100%);
      }
      .brand {
        position: absolute;
        z-index: 20;
        top: 64px;
        left: 70px;
        right: 70px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: ${STYLE_SYSTEM.palette.muted};
        font-size: 26px;
        font-weight: 800;
        letter-spacing: 0;
      }
      .brand-mark {
        display: grid;
        width: 68px;
        height: 68px;
        place-items: center;
        border-radius: 8px;
        color: #04101a;
        background: linear-gradient(135deg, ${STYLE_SYSTEM.palette.cyan}, ${STYLE_SYSTEM.palette.gold});
        font-size: 20px;
      }
      .title-card {
        position: absolute;
        z-index: 10;
        inset: 0;
        display: grid;
        align-content: center;
        padding: 160px 80px;
      }
      .title-card h1 {
        max-width: 900px;
        margin: 0;
        font-size: 78px;
        line-height: 1.02;
        letter-spacing: 0;
      }
      .title-card p {
        margin: 26px 0 0;
        color: ${STYLE_SYSTEM.palette.muted};
        font-size: 31px;
        line-height: 1.45;
      }
      .scene {
        position: absolute;
        inset: 0;
        display: grid;
        align-items: center;
        padding: 160px 74px 190px;
        opacity: 0;
      }
      .scene-grid {
        display: grid;
        gap: 32px;
      }
      .scene-kicker {
        margin: 0;
        color: var(--accent);
        font-size: 24px;
        font-weight: 900;
        text-transform: uppercase;
      }
      .scene h2 {
        margin: 0;
        font-size: 58px;
        line-height: 1.08;
        letter-spacing: 0;
      }
      .visual-note {
        max-width: 850px;
        margin: 0;
        color: ${STYLE_SYSTEM.palette.muted};
        font-size: 28px;
        line-height: 1.46;
      }
      .diagram {
        position: relative;
        height: 520px;
        border: 1px solid rgba(158, 219, 255, 0.18);
        border-radius: 8px;
        overflow: hidden;
        background:
          linear-gradient(rgba(158, 219, 255, 0.08) 1px, transparent 1px),
          linear-gradient(90deg, rgba(158, 219, 255, 0.08) 1px, transparent 1px),
          rgba(9, 18, 34, 0.74);
        background-size: 56px 56px;
      }
      .diagram span {
        position: absolute;
        display: block;
        border-radius: 999px;
        background: var(--accent);
        box-shadow: 0 0 38px color-mix(in srgb, var(--accent), transparent 40%);
      }
      .diagram span:nth-child(1) { width: 92px; height: 92px; left: 110px; top: 110px; }
      .diagram span:nth-child(2) { width: 62px; height: 62px; left: 382px; top: 220px; }
      .diagram span:nth-child(3) { width: 138px; height: 12px; left: 520px; top: 270px; border-radius: 6px; }
      .diagram span:nth-child(4) { width: 220px; height: 18px; left: 610px; top: 360px; border-radius: 6px; opacity: 0.72; }
      .diagram span:nth-child(5) { width: 22px; height: 320px; left: 820px; top: 130px; border-radius: 6px; opacity: 0.5; }
      .captions {
        position: absolute;
        z-index: 30;
        left: 70px;
        right: 70px;
        bottom: 88px;
        border: 1px solid rgba(158, 219, 255, 0.2);
        border-radius: 8px;
        padding: 22px 26px;
        color: ${STYLE_SYSTEM.palette.ink};
        background: rgba(5, 9, 20, 0.72);
        font-size: 32px;
        line-height: 1.28;
      }
      .caption { opacity: 0; }
    </style>
  </head>
  <body>
    <div data-composition-id="papertrail-short" data-width="1080" data-height="1920" data-duration="${duration}">
      <div class="brand"><span class="brand-mark">PT</span><span>Research Intelligence Short</span></div>
      <section class="title-card" data-start="0" data-duration="4">
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(source)} / original geometric explainer / job ${escapeHtml(jobId)}</p>
      </section>
      ${sceneMarkup}
      ${scenes
        .map(
          (scene, index) =>
            `<div class="captions caption" data-caption-index="${index}" data-start="${scene.start}" data-duration="${scene.duration}">${escapeHtml(scene.narration)}</div>`,
        )
        .join("\n")}
    </div>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <script>
      window.__timelines = window.__timelines || {};
      const scenes = ${JSON.stringify(scenes)};
      const tl = gsap.timeline({ paused: true });
      tl.fromTo(".title-card", { opacity: 1, y: 0 }, { opacity: 0, y: -80, duration: 0.7, ease: "power2.in" }, 3.2);
      scenes.forEach((scene, index) => {
        const selector = ".scene:nth-of-type(" + (index + 2) + ")";
        tl.fromTo(selector, { opacity: 0, y: 90 }, { opacity: 1, y: 0, duration: 0.65, ease: "power3.out" }, scene.start);
        tl.from(selector + " .diagram span", { scale: 0.5, opacity: 0, stagger: 0.08, duration: 0.5, ease: "back.out(1.5)" }, scene.start + 0.25);
        const captionSelector = '.caption[data-caption-index="' + index + '"]';
        tl.fromTo(captionSelector, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.25 }, scene.start);
        tl.to(captionSelector, { opacity: 0, y: -16, duration: 0.25 }, Math.max(scene.start + 0.8, scene.end - 0.3));
        tl.to(selector, { opacity: 0, y: -70, duration: 0.45, ease: "power2.in" }, Math.max(scene.start + 0.8, scene.end - 0.5));
      });
      window.__timelines["papertrail-short"] = tl;
    </script>
  </body>
</html>`;
}

async function maybeTriggerRenderer(job: Record<string, unknown>) {
  const renderWebhookUrl = env("VIDEO_RENDER_WEBHOOK_URL");
  if (!renderWebhookUrl) return;

  const response = await fetch(renderWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-render-secret": env("VIDEO_RENDER_SECRET"),
    },
    body: JSON.stringify({
      job_id: job.id,
      public_token: job.public_token,
      composition_html: job.composition_html,
      render_manifest: job.render_manifest,
      callback_url: `${env("SUPABASE_URL")}/functions/v1/video-jobs?callback=renderer`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Renderer webhook returned ${response.status}`);
  }
}

async function createVideoJob(request: Request) {
  const body = (await request.json()) as VideoJobRequest;
  const duration = clampDuration(body.duration);
  const paper = body.paper || {};
  const scenes = normalizeScenes(body.scenePlan, duration);
  const narrationText = buildNarration(scenes);
  const captions = buildCaptions(scenes);
  const visualInstructions = buildVisualInstructions(paper, scenes, Boolean(body.includeTts));
  const compositionHtml = buildCompositionHtml("pending", paper, scenes, duration);
  const supabase = adminClient();
  const userId = await getUserId(request);
  if (!userId) {
    return jsonResponse({ error: "Sign in to create a video export." }, 401);
  }

  const renderManifest = {
    renderer: "papertrail-geometric-v1",
    target: {
      width: STYLE_SYSTEM.width,
      height: STYLE_SYSTEM.height,
      fps: 30,
      format: "mp4",
      codec: "h264",
      aspect_ratio: "9:16",
    },
    tts: {
      requested: Boolean(body.includeTts),
      voice: "neutral-professional",
      source: "narration_text",
    },
    safety: STYLE_SYSTEM.safety,
  };

  const { data, error } = await supabase
    .from("video_jobs")
    .insert({
      user_id: userId,
      anonymous_session_id: typeof body.sessionId === "string" ? cleanText(body.sessionId, "") : null,
      status: env("VIDEO_RENDER_WEBHOOK_URL") ? "rendering" : "queued",
      paper,
      abstract: cleanText(body.abstract || paper.summary, ""),
      duration_seconds: duration,
      scene_plan: body.scenePlan || { scenes },
      narration_text: narrationText,
      captions,
      scene_timings: scenes.map(({ label, start, end, duration }) => ({ label, start, end, duration })),
      visual_instructions: visualInstructions,
      composition_html: compositionHtml,
      render_manifest: renderManifest,
    })
    .select("*")
    .single();

  if (error || !data) {
    return jsonResponse({ error: error?.message || "Could not create video job" }, 400);
  }

  const compositionWithJobId = buildCompositionHtml(data.id, paper, scenes, duration);
  await supabase.from("video_jobs").update({ composition_html: compositionWithJobId }).eq("id", data.id);
  const job = { ...data, composition_html: compositionWithJobId };
  let returnedStatus = env("VIDEO_RENDER_WEBHOOK_URL") ? "rendering" : "queued";

  try {
    await maybeTriggerRenderer(job);
  } catch (rendererError) {
    returnedStatus = "queued";
    await supabase
      .from("video_jobs")
      .update({
        status: "queued",
        error_message: rendererError instanceof Error ? rendererError.message : "Renderer trigger failed",
      })
      .eq("id", data.id);
  }

  return jsonResponse({
    job_id: data.id,
    public_token: data.public_token,
    status: returnedStatus,
    preview_url: null,
    video_url: null,
    error: null,
  });
}

async function readVideoJob(request: Request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("job_id");
  const token = url.searchParams.get("token");
  if (!jobId || !token) {
    return jsonResponse({ error: "Missing job_id or token" }, 400);
  }

  const { data, error } = await adminClient()
    .from("video_jobs")
    .select("id,public_token,status,preview_url,video_url,audio_url,error_message,created_at,updated_at,completed_at,render_manifest")
    .eq("id", jobId)
    .eq("public_token", token)
    .single();

  if (error || !data) {
    return jsonResponse({ error: "Video job not found" }, 404);
  }

  return jsonResponse({
    job_id: data.id,
    status: data.status,
    preview_url: data.preview_url,
    video_url: data.video_url,
    audio_url: data.audio_url,
    error: data.error_message,
    created_at: data.created_at,
    updated_at: data.updated_at,
    completed_at: data.completed_at,
    render_manifest: data.render_manifest,
  });
}

async function updateFromRenderer(request: Request) {
  const expectedSecret = env("VIDEO_RENDER_SECRET");
  if (expectedSecret && request.headers.get("x-render-secret") !== expectedSecret) {
    return jsonResponse({ error: "Unauthorized renderer callback" }, 401);
  }

  const body = await request.json();
  const jobId = cleanText(body.job_id, "");
  const token = cleanText(body.public_token, "");
  if (!jobId || !token) return jsonResponse({ error: "Missing job identity" }, 400);

  const status = cleanText(body.status, "completed");
  const update = {
    status: status === "failed" ? "failed" : "completed",
    preview_url: cleanText(body.preview_url, ""),
    video_url: cleanText(body.video_url, ""),
    audio_url: cleanText(body.audio_url, ""),
    error_message: status === "failed" ? cleanText(body.error, "Renderer failed") : null,
    completed_at: status === "failed" ? null : new Date().toISOString(),
  };

  const { error } = await adminClient()
    .from("video_jobs")
    .update(update)
    .eq("id", jobId)
    .eq("public_token", token);

  if (error) return jsonResponse({ error: error.message }, 400);
  return jsonResponse({ ok: true });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (request.method === "GET") {
      return await readVideoJob(request);
    }

    if (request.method === "POST") {
      const url = new URL(request.url);
      if (url.searchParams.get("callback") === "renderer") {
        return await updateFromRenderer(request);
      }
      return await createVideoJob(request);
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Unexpected video job error",
      },
      500,
    );
  }
});
