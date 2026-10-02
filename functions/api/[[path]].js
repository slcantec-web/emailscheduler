// Cloudflare Pages Function: every /api/* request is handled by the shared Worker code.
import { handle } from '../../worker/src/index.js';

export const onRequest = (ctx) => handle(ctx.request, ctx.env, new URL(ctx.request.url));
