import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** The browser's "install this app" offer (Chrome, Edge, Android), shown as a button only when it is available. */
@Injectable({ providedIn: 'root' })
export class InstallPrompt {
  readonly available = signal(false);
  private event: InstallEvent | null = null;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.event = e as InstallEvent;
      this.available.set(true);
    });
    addEventListener('appinstalled', () => {
      this.event = null;
      this.available.set(false);
    });
  }

  async install(): Promise<void> {
    if (!this.event) return;
    await this.event.prompt();
    await this.event.userChoice;
    this.event = null;
    this.available.set(false);
  }
}
