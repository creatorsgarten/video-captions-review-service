import cors from "@elysiajs/cors";
import { Elysia, t } from "elysia";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import { grist } from "./grist";

async function getRawGitHubFile(
  repo: string,
  branch: string,
  file: string
): Promise<string> {
  // Return data from filesystem instead if the environment variable "VIDEOS_PATH" is set.
  if (process.env["VIDEOS_PATH"]) {
    return fs.readFileSync(`${process.env["VIDEOS_PATH"]}/${file}`, "utf-8");
  }

  const url = `https://raw.githubusercontent.com/${repo}/${branch}/${file}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`
    );
  }
  return response.text();
}

function parseYouTubeId(content: string): string {
  const match = content.match(/youtube:\s*["']?([a-zA-Z0-9_-]+)/);
  if (!match) {
    throw new Error("YouTube ID not found in content");
  }
  return match[1];
}

function createFlagId(id: number) {
  const secret = process.env["FLAG_SECRET"]!;
  if (!secret) {
    throw new Error("FLAG_SECRET environment variable is not set");
  }
  const hmac = createHmac("sha256", secret);
  hmac.update(String(id));
  return `flag-${id}-${hmac.digest("hex")}`;
}

function formatTime(t: number) {
  const h = Math.floor(t / 3600)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((t % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(t % 60)
    .toString()
    .padStart(2, "0");
  const ms = Math.floor((t * 1000) % 1000)
    .toString()
    .padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

const app = new Elysia()
  .onBeforeHandle(async ({ set }) => {
    set.headers["Access-Control-Allow-Private-Network"] = "true";
  })
  .use(cors())
  .get(
    "/videos/:event/:slug/:lang",
    async ({ params }) => {
      const content = await getRawGitHubFile(
        "creatorsgarten/videos",
        "refs/heads/main",
        `data/videos/${params.event}/${params.slug}.md`
      );

      const youtubeId = parseYouTubeId(content);
      const videoUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
      const vttUrl = `/captions/${params.event}/${params.slug}/${params.lang}`;
      const flaggingUrl = `/flags/${params.event}/${params.slug}/${params.lang}`;

      return {
        videoUrl,
        vttUrl,
        flaggingUrl,
      };
    },
    {
      params: t.Object({
        event: t.String(),
        slug: t.String(),
        lang: t.String(),
      }),
    }
  )
  .get(
    "/captions/:event/:slug/:lang",
    async ({ params }) => {
      return getRawGitHubFile(
        "creatorsgarten/videos",
        "refs/heads/main",
        `data/videos/${params.event}/${params.slug}_${params.lang}.vtt`
      );
    },
    {
      params: t.Object({
        event: t.String(),
        slug: t.String(),
        lang: t.String(),
      }),
    }
  )
  .post(
    "/flags/:event/:slug/:lang",
    async ({ params, body }) => {
      const result = await grist.addRecords("Flags", [
        {
          vtt: `${params.event}/${params.slug}_${params.lang}.vtt`,
          timestamp: formatTime(body.timestamp / 1000),
          text: body.text,
        },
      ]);
      return { flagId: createFlagId(result[0]) };
    },
    {
      params: t.Object({
        event: t.String(),
        slug: t.String(),
        lang: t.String(),
      }),
      body: t.Object({
        timestamp: t.Number(),
        text: t.String(),
      }),
    }
  )
  .delete(
    "/flags/:event/:slug/:lang/:flagId",
    async ({ params }) => {
      const [, id, signature] = params.flagId.split("-");
      if (signature !== createFlagId(Number(id)).split("-")[2]) {
        throw new Error("Invalid flag ID");
      }
      await grist.deleteRecords("Flags", [Number(id)]);
      return { ok: true };
    },
    {
      params: t.Object({
        event: t.String(),
        slug: t.String(),
        lang: t.String(),
        flagId: t.String(),
      }),
    }
  );
export default app;
