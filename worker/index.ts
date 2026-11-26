/**
 * The Worker in front of the prerendered site. /api/* is the accounts API (backed by a D1
 * database); every other request is a static page or file, served exactly as before.
 */
import * as admin from './admin';
import * as assistant from './assistant';
import * as auth from './auth';
import type { Env } from './env';
import * as oauth from './oauth';
import * as tracking from './tracking';
import { ApiError, errorResponse, json } from './http';

type Handler = (env: Env, request: Request, id: string) => Promise<Response>;

const ROUTES: [method: string, pattern: RegExp, handler: Handler][] = [
  ['GET', /^\/api\/auth\/me$/, auth.me],
  ['POST', /^\/api\/auth\/signup$/, auth.signup],
  ['POST', /^\/api\/auth\/login$/, auth.login],
  ['POST', /^\/api\/auth\/logout$/, auth.logout],
  ['POST', /^\/api\/auth\/verify-email$/, auth.verifyEmail],
  ['POST', /^\/api\/auth\/resend-verification$/, auth.resendVerification],
  ['POST', /^\/api\/auth\/forgot-password$/, auth.forgotPassword],
  ['POST', /^\/api\/auth\/reset-password$/, auth.resetPassword],
  ['POST', /^\/api\/auth\/change-password$/, auth.changePassword],
  ['GET', /^\/api\/auth\/providers$/, oauth.providers],
  ['GET', /^\/api\/auth\/oauth\/(\w+)\/start$/, oauth.start],
  ['GET', /^\/api\/auth\/oauth\/(\w+)\/callback$/, oauth.callback],
  // Apple sends the answer back as a form POST.
  ['POST', /^\/api\/auth\/oauth\/(\w+)\/callback$/, oauth.callback],
  ['GET', /^\/api\/auth\/activity$/, tracking.activity],
  ['POST', /^\/api\/auth\/sessions\/([\w-]+)\/logout$/, tracking.endSession],
  ['POST', /^\/api\/visit$/, tracking.recordVisit],
  ['POST', /^\/api\/visit\/(\d+)\/location$/, tracking.recordLocation],
  ['GET', /^\/api\/admin\/stats$/, admin.stats],
  ['GET', /^\/api\/admin\/users$/, admin.users],
  ['GET', /^\/api\/admin\/users\/([\w-]+)$/, admin.user],
  ['POST', /^\/api\/admin\/users\/([\w-]+)\/block$/, admin.block],
  ['POST', /^\/api\/admin\/users\/([\w-]+)\/logout$/, admin.logoutEverywhere],
  ['POST', /^\/api\/admin\/users\/([\w-]+)\/delete$/, admin.deleteUser],
  ['GET', /^\/api\/admin\/outbox$/, admin.outbox],
  ['GET', /^\/api\/admin\/log$/, admin.adminLog],
  ['POST', /^\/api\/assistant\/run$/, assistant.run],
  ['GET', /^\/api\/assistant\/profile$/, assistant.getProfile],
  ['POST', /^\/api\/assistant\/profile$/, assistant.saveProfile],
  ['GET', /^\/api\/assistant\/history$/, assistant.history],
  ['POST', /^\/api\/assistant\/history$/, assistant.saveHistory],
  ['POST', /^\/api\/assistant\/history\/(\d+)\/favorite$/, assistant.toggleFavorite],
  ['POST', /^\/api\/assistant\/history\/(\d+)\/delete$/, assistant.deleteHistory],
  ['GET', /^\/api\/admin\/visits$/, admin.visits],
  ['GET', /^\/api\/admin\/logins$/, admin.logins],
];

async function api(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  let pathFound = false;
  for (const [method, pattern, handler] of ROUTES) {
    const match = pattern.exec(pathname);
    if (!match) continue;
    pathFound = true;
    if (method === request.method) return handler(env, request, match[1] ?? '');
  }
  throw new ApiError(pathFound ? 405 : 404, pathFound ? 'This method is not allowed here.' : 'There is no such API address.');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      const response = await api(request, env);
      response.headers.set('x-content-type-options', 'nosniff');
      response.headers.set('referrer-policy', 'same-origin');
      return response;
    } catch (error) {
      return errorResponse(error);
    }
  },
};

export { json };
