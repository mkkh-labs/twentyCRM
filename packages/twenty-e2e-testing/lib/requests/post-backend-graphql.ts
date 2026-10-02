import { type APIResponse, type Page } from '@playwright/test';
import { backendGraphQLUrl, frontendOrigin } from './backend';

// Authenticates by session cookie: page.request shares the browser context's
// cookie jar, which is the only place an httpOnly session cookie exists.
// CookieSessionCsrfMiddleware fails closed on a missing Origin for a
// cookie-authenticated write, and page.request sends none on its own.
export const postBackendGraphQL = ({
  page,
  data,
}: {
  page: Page;
  data: Record<string, unknown>;
}): Promise<APIResponse> => {
  const pageUrl = new URL(page.url());
  const workspaceBoundBackendGraphQLUrl = new URL(backendGraphQLUrl);

  // Multi-workspace routing derives the workspace from the request hostname.
  workspaceBoundBackendGraphQLUrl.hostname = pageUrl.hostname;

  return page.request.post(workspaceBoundBackendGraphQLUrl.toString(), {
    headers: {
      Origin: frontendOrigin,
    },
    data,
  });
};
