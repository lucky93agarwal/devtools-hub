import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { REPO_URL, SITE_NAME } from '../../core/app-config';
import { InfoPage } from './info-page';

@Component({
  selector: 'app-privacy-page',
  imports: [InfoPage, RouterLink],
  template: `
    <app-info-page heading="Privacy policy" updated="16 October 2026">
      <p>
        {{ siteName }} is a set of developer tools that run in your web browser. This page explains what happens to your
        data when you use the site. In short: the tools do not send your input anywhere, there are no accounts, and the
        site does not use cookies.
      </p>

      <h2>Your files and text stay on your device</h2>
      <p>
        JSON you paste or upload, images you convert, and tokens, secrets and keys you enter are processed by your own
        browser. They are not uploaded to a server, not stored by us, and not shared with anyone. When you close or reload
        the page, they are gone.
      </p>

      <h2>No accounts and no cookies</h2>
      <p>
        You do not need an account to use any tool. The site does not set cookies. It may save small preferences, such as
        the light or dark theme, in your browser's local storage; these never leave your device and you can clear them in
        your browser settings.
      </p>

      <h2>Hosting and server logs</h2>
      <p>
        The site is hosted on Cloudflare. Like any web host, Cloudflare receives the technical details your browser sends
        when it loads a page, such as your IP address, browser type and the address of the page, and may keep them in
        logs for security and to keep the service running. This does not include anything you type into or open in the
        tools. Cloudflare's own privacy policy describes how it handles this data.
      </p>

      <h2>Analytics and advertising</h2>
      <p>
        The site does not currently use analytics or show ads. If that changes, for example by adding privacy-friendly
        visit counting or advertising, this page will be updated first and will say which services are used, what they
        collect and how to opt out. Where the law requires consent, it will be asked for before anything is collected.
      </p>

      <h2>Children</h2>
      <p>The site is meant for developers and is not aimed at children.</p>

      <h2>Changes to this policy</h2>
      <p>
        When this policy changes, the date at the top changes too. The full history of the site, including this page, is
        public in the <a [href]="repoUrl" target="_blank" rel="noopener">source code repository</a>.
      </p>

      <h2>Contact</h2>
      <p>Questions about privacy can be sent through the <a routerLink="/contact">contact page</a>.</p>
    </app-info-page>
  `,
})
export class PrivacyPage {
  protected readonly siteName = SITE_NAME;
  protected readonly repoUrl = REPO_URL;
}
