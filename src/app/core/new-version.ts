import { ErrorHandler, Injectable } from '@angular/core';
import { NavigationError } from '@angular/router';

/**
 * Every deploy gives the lazy-loaded files new names and removes the old ones.
 * A tab opened before a deploy still asks for the old names, so opening a tool,
 * starting the editor or anything else loaded on demand fails. Browsers word
 * that failure differently (Chrome, Safari, Firefox, webpack style).
 */
const MISSING_FILE =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\w-]+ failed/i;

const RELOADED_AT = 'dth-new-version-reload';
/** A second failure this soon after reloading is a real problem, not an old tab. */
const LOOP_GUARD_MS = 10_000;

export function isMissingFileError(error: unknown): boolean {
  for (let e = error, depth = 0; e && depth < 4; depth++) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
    if (MISSING_FILE.test(message)) return true;
    // Promise rejections and wrapped errors keep the original inside.
    const inner = e as { rejection?: unknown; cause?: unknown; error?: unknown };
    e = inner.rejection ?? inner.cause ?? inner.error;
  }
  return false;
}

/**
 * Loads `url` fresh from the server so the tab gets the current version.
 * Returns false, and does nothing, if it already did so a moment ago.
 */
export function loadNewVersion(
  url: string,
  go: (url: string) => void = (u) => location.assign(u),
): boolean {
  try {
    if (Date.now() - Number(sessionStorage.getItem(RELOADED_AT)) < LOOP_GUARD_MS) return false;
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch {
    // Without storage there is no loop guard, so do not risk reloading forever.
    return false;
  }
  go(url);
  return true;
}

/** Opening a page: go straight to the page the user asked for. */
export function onNavigationError(event: NavigationError): void {
  if (typeof location !== 'undefined' && isMissingFileError(event.error)) loadNewVersion(event.url);
}

/** Anything else loaded on demand (the code editor, workers' helpers): reload this page. */
@Injectable()
export class NewVersionErrorHandler extends ErrorHandler {
  override handleError(error: unknown): void {
    if (
      typeof location !== 'undefined' &&
      isMissingFileError(error) &&
      loadNewVersion(location.href)
    )
      return;
    super.handleError(error);
  }
}
