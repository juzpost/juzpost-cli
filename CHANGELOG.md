# Changelog

## 0.2.1

- `posts schedule` without `--at`, and the MCP `schedule_post` tool without
  `publishAt`, publish now again: they send `publishNow: true`, which the API
  requires, instead of failing with "publishAt is required".

## 0.2.0

- `juzpost mcp` runs a stdio MCP server over the stored CLI token: 10 tools
  (get_account, get_workspace, list_accounts, list_groups, list_posts, get_post,
  upload_media, create_post, schedule_post, smart_schedule) for Claude, Cursor,
  Codex and any other MCP client.

## 0.1.5

- `posts schedule` takes `--alt` (one description per file) and `--label` (`sexual`,
  `nudity`, `porn`, `graphic-media`) to set Bluesky alt text and content warnings on
  every Bluesky account passed with `--account`.

## 0.1.4

- `auth login` now auto-opens the browser to the approval page (still prints the
  URL as a fallback for headless/SSH sessions).
- Docs: corrected login command to `juzpost auth login` throughout the README.

## 0.1.2

- Send `contentLength` with upload presign requests — the JuzPost API now
  requires it and enforces per-content-type size limits before issuing a URL.

## 0.1.1

- Rewrote the README for discoverability: detailed usage, smart-scheduling
  explainer, use cases, FAQ, and SEO keywords (social media scheduling,
  TikTok/YouTube Shorts scheduler, content calendar, automation).
- Expanded npm `keywords`; added `homepage`.
- Parse both API error shapes (`{ error: { message } }` and `{ error: "string" }`).

## 0.1.0

- First public release.
- Commands: `login`/`logout`/`whoami`, `account status`, `accounts`, `groups`,
  `workspace`, `posts list|create|schedule`, and smart `schedule`
  (`--group`/`--min-per-day`/`--dry-run`).
- Cursor pagination, `--json` output, device-code auth, presigned media upload.
