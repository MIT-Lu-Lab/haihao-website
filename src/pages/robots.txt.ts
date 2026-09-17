import type { APIRoute } from 'astro';
import { allowSearchEngines } from '../data/site';

const body = allowSearchEngines
  ? 'User-agent: *\nAllow: /\n'
  : 'User-agent: *\nDisallow: /\n';

export const GET: APIRoute = () => new Response(body, {
  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
});
