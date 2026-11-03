// `juzpost mcp`: a stdio MCP server over the same token-only /api/cli/v1/* client the
// CLI uses. Sign in once with `juzpost auth login`; every tool then runs as that token.
// This is the local counterpart of the hosted server at https://www.juzpost.com/mcp.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { api, apiList, type ListParams } from './api.js';
import { uploadMedia } from './upload.js';

const json = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });

const pageShape = {
  limit: z.number().int().min(1).max(100).optional().describe('Page size, 1 to 100 (default 20).'),
  cursor: z.string().optional().describe('nextCursor from the previous page, passed back verbatim.'),
};

const clean = (o: Record<string, unknown>): ListParams =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as ListParams;

export function createServer(version: string): McpServer {
  const server = new McpServer({ name: 'juzpost', version });

  server.registerTool(
    'get_account',
    {
      title: 'Get account',
      description: 'The signed-in user, workspace and plan behind the stored CLI token.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => json(await api('/api/cli/v1/me')),
  );

  server.registerTool(
    'get_workspace',
    {
      title: 'Get workspace',
      description: 'Workspace timezone and the default posting times smart scheduling uses.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => json(await api('/api/cli/v1/workspace')),
  );

  server.registerTool(
    'list_accounts',
    {
      title: 'List connected accounts',
      description: 'Connected social accounts with their ids, platform and display name. Account ids are what schedule_post takes.',
      inputSchema: {
        platform: z.string().optional().describe('Filter by platform, e.g. tiktok, youtube, instagram, x, linkedin, bluesky.'),
        groupId: z.string().optional().describe('Only accounts in this channel group.'),
        ...pageShape,
      },
      annotations: { readOnlyHint: true },
    },
    async (a) => json(await apiList('/api/cli/v1/accounts', clean(a))),
  );

  server.registerTool(
    'list_groups',
    {
      title: 'List channel groups',
      description: 'Channel groups (named sets of accounts). A group name is what smart_schedule takes.',
      inputSchema: { name: z.string().optional().describe('Filter: name contains.'), ...pageShape },
      annotations: { readOnlyHint: true },
    },
    async (a) => json(await apiList('/api/cli/v1/groups', clean(a))),
  );

  server.registerTool(
    'list_posts',
    {
      title: 'List posts',
      description: 'Posts in the workspace: drafts, scheduled, posted and failed.',
      inputSchema: {
        status: z.enum(['draft', 'scheduled', 'posted', 'failed']).optional(),
        accountId: z.string().optional().describe('Only posts targeting this account.'),
        from: z.string().optional().describe('ISO date lower bound.'),
        to: z.string().optional().describe('ISO date upper bound.'),
        ...pageShape,
      },
      annotations: { readOnlyHint: true },
    },
    async (a) => json(await apiList('/api/cli/v1/posts', clean(a))),
  );

  server.registerTool(
    'get_post',
    {
      title: 'Get post',
      description: 'One post with its content, media and per-account publish state.',
      inputSchema: { postId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ postId }) => json(await api(`/api/cli/v1/posts/${encodeURIComponent(postId)}`)),
  );

  server.registerTool(
    'upload_media',
    {
      title: 'Upload media',
      description: 'Upload a local image or video file to the workspace media library. Returns the media key to pass to create_post.',
      inputSchema: { filePath: z.string().describe('Absolute path to an .mp4, .mov, .webm, .png, .jpg or .webp file.') },
    },
    async ({ filePath }) => json({ mediaKey: await uploadMedia(filePath) }),
  );

  server.registerTool(
    'create_post',
    {
      title: 'Create draft post',
      description: 'Create a draft post. Pass filePath to upload one local file, or mediaKeys from upload_media. Drafts publish only after schedule_post or smart_schedule.',
      inputSchema: {
        content: z.string().optional().describe('Caption or body.'),
        title: z.string().optional(),
        description: z.string().optional(),
        hashtags: z.array(z.string()).optional().describe('Without the # prefix.'),
        type: z.enum(['text', 'image', 'video', 'story']).optional(),
        filePath: z.string().optional().describe('Local media file to upload and attach.'),
        mediaKeys: z.array(z.string()).optional().describe('Keys returned by upload_media.'),
        coverKey: z.string().optional().describe('Key of an already uploaded cover image.'),
      },
    },
    async (a) => {
      const mediaUrls = a.filePath ? [await uploadMedia(a.filePath)] : a.mediaKeys;
      return json(
        await api('/api/cli/v1/posts', {
          method: 'POST',
          body: {
            content: a.content,
            mediaUrls,
            title: a.title,
            description: a.description,
            hashtags: a.hashtags,
            type: a.type,
            coverR2Key: a.coverKey,
          },
        }),
      );
    },
  );

  server.registerTool(
    'schedule_post',
    {
      title: 'Schedule post',
      description: 'Schedule one draft to one or more accounts at a time, or publish it now when publishAt is omitted.',
      inputSchema: {
        postId: z.string(),
        accountIds: z.array(z.string()).min(1).max(10).describe('Ids from list_accounts.'),
        publishAt: z.string().optional().describe('ISO 8601 UTC. Omit to publish now.'),
      },
    },
    async ({ postId, accountIds, publishAt }) =>
      json(
        await api(`/api/cli/v1/posts/${encodeURIComponent(postId)}/schedule`, {
          method: 'POST',
          body: { publishAt, socialAccountIds: accountIds },
        }),
      ),
  );

  server.registerTool(
    'smart_schedule',
    {
      title: 'Smart schedule',
      description: 'Spread draft posts across a channel group at the workspace preset times, at least minPerDay a day. dryRun returns the plan without scheduling.',
      inputSchema: {
        group: z.string().describe('Channel group name.'),
        minPerDay: z.number().int().min(1),
        postIds: z.array(z.string()).optional().describe('Specific drafts; default is every draft.'),
        startDate: z.string().optional().describe('First day, ISO date; default tomorrow.'),
        times: z.array(z.string()).optional().describe('HH:MM overrides for the workspace default times.'),
        dryRun: z.boolean().optional(),
      },
    },
    async (a) => json(await api('/api/cli/v1/schedule', { method: 'POST', body: a })),
  );

  return server;
}

export async function serveStdio(version: string): Promise<void> {
  const server = createServer(version);
  await server.connect(new StdioServerTransport());
}
