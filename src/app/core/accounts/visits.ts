import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ACCOUNTS } from '../app-config';

const VISITOR_KEY = 'dt_visitor';
let memoryVisitor: string | null = null;

/** A random id kept in this browser, so visits and logins from the same browser can be matched. */
export function visitorId(): string {
  try {
    const saved = localStorage.getItem(VISITOR_KEY);
    if (saved && /^[\w-]{8,64}$/.test(saved)) return saved;
    const made = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, made);
    return made;
  } catch {
    // Storage blocked (private mode): one id for this page load.
    memoryVisitor ??= `m-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    return memoryVisitor;
  }
}

/**
 * Records each time the site is opened (logged in or not): the server adds the IP, the
 * approximate city and the device. Then the browser asks for the GPS location; the answer
 * (or "denied") is added to the same visit. The notice bar tells visitors about this.
 */
@Injectable({ providedIn: 'root' })
export class Visits {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private started = false;

  start(): void {
    if (!this.browser || !ACCOUNTS.enabled || this.started || !navigator.onLine) return;
    this.started = true;
    void this.record();
  }

  private async record(): Promise<void> {
    const id = visitorId();
    let visitId: number | null = null;
    try {
      const response = await fetch('/api/visit', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          visitorId: id,
          page: location.pathname + location.search,
          referrer: document.referrer && !document.referrer.startsWith(location.origin) ? document.referrer : '',
          language: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          screen: `${screen.width}x${screen.height}`,
        }),
      });
      if (!response.ok) return;
      visitId = ((await response.json()) as { visitId?: number | null }).visitId ?? null;
    } catch {
      return;
    }
    if (visitId === null) return;
    const send = (data: Record<string, unknown>) =>
      fetch(`/api/visit/${visitId}/location`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visitorId: id, ...data }),
      }).catch(() => undefined);
    if (!('geolocation' in navigator)) {
      void send({ status: 'unavailable' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => void send({ status: 'allowed', lat: position.coords.latitude, lon: position.coords.longitude, accuracy: position.coords.accuracy }),
      (error) => void send({ status: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 10 * 60_000 },
    );
  }
}
