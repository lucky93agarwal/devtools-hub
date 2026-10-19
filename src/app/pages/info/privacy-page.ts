import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { REPO_URL, SITE_NAME } from '../../core/app-config';
import { analyticsEnabled } from '../../core/analytics';
import { ADS_CONFIG, adsEnabled } from '../../core/ads';
import { InfoPage } from './info-page';

@Component({
  selector: 'app-privacy-page',
  imports: [InfoPage, RouterLink],
  template: `
    <app-info-page heading="Privacy policy" updated="19 October 2026">
      <p>
        {{ siteName }} is a set of developer tools that run in your web browser. This page explains what happens to your
        data when you use the site. In short: the tools do not send your input anywhere, there are no accounts,
        @if (adsOn) {
          and the only cookies are those Google uses to show ads, as described below.
        } @else {
          and the site does not use cookies.
        }
      </p>

      <h2>Your files and text stay on your device</h2>
      <p>
        JSON you paste or upload, images you convert, and tokens, secrets and keys you enter are processed by your own
        browser. They are not uploaded to a server, not stored by us, and not shared with anyone. When you close or reload
        the page, they are gone.
      </p>

      <h2>No accounts{{ adsOn ? '' : ' and no cookies' }}</h2>
      <p>
        You do not need an account to use any tool. The site itself does not set cookies{{
          adsOn ? '; the advertising cookies described below come from Google' : ''
        }}. It may save small preferences, such as the light or dark theme, in your browser's local storage, and the API
        Client keeps the requests, collections, environments and history you create there too. These never leave your
        device and you can clear them in your browser settings.
      </p>

      <h2>Requests you send with the API Client</h2>
      <p>
        When you send a request with the API Client, or open a WebSocket or Socket.IO connection with it, your browser
        sends it directly to the address you entered. It does
        not pass through this site. That service receives the request, including any tokens or data in it, under its own
        privacy policy. When you hover or open a link in a response to preview or download it, your browser loads that
        file straight from the server it points to.
      </p>

      <h2>Hosting and server logs</h2>
      <p>
        The site is hosted on Cloudflare. Like any web host, Cloudflare receives the technical details your browser sends
        when it loads a page, such as your IP address, browser type and the address of the page, and may keep them in
        logs for security and to keep the service running. This does not include anything you type into or open in the
        tools. Cloudflare's own privacy policy describes how it handles this data.
      </p>

      <h2>Visit counting</h2>
      @if (analyticsOn) {
        <p>
          To learn which tools are useful, the site counts visits with Umami Cloud, a privacy-focused analytics service.
          It does not use cookies and does not build a profile of you. It receives the page address, the referring site,
          your browser, operating system, screen size and country (worked out from your IP address, which Umami does not
          store).
        </p>
        <p>
          The tools also send short notes about what was done, such as "image converted to WebP, 3 images" or "JWT
          signature checked: valid", with a rough input size like "under 10 KB". These notes never include your JSON,
          images, tokens, secrets, keys or file names.
        </p>
        <p>
          If your browser's Do Not Track setting is on, nothing is counted. Content blockers that block analytics also
          stop it, and every tool keeps working.
        </p>
      } @else {
        <p>
          The site does not currently count visits. If privacy-friendly visit counting is added, this page will be updated
          first and will say what is collected and how to opt out.
        </p>
      }

      <h2>Advertising</h2>
      @if (adsOn) {
        <p>
          The site is free because it shows ads from Google AdSense, below each tool. Google and its partners use cookies
          and similar technology to show ads, to limit how often you see the same ad, to measure how ads perform and,
          where you allow it, to choose ads based on your earlier visits to this and other websites.
        </p>
        <p>
          Ads never receive anything you type, paste or open in the tools. They are loaded after the page is ready, in
          their own space, and blocking them does not stop any tool from working.
        </p>
        <p>
          If you are in the European Economic Area, the United Kingdom or Switzerland, a consent message from Google
          asks for your choice before any advertising cookies are used, and you can change it later from the link it
          shows. Anyone can turn off personalised ads in
          <a href="https://adssettings.google.com" target="_blank" rel="noopener">Google's ad settings</a> or at
          <a href="https://www.aboutads.info" target="_blank" rel="noopener">aboutads.info</a>. Google explains how it
          uses this data in
          <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener"
            >How Google uses information from sites that use its services</a
          >.
        </p>
      } @else {
        <p>
          The site does not currently show ads. If ads are added, this page will be updated first and will say which
          services are used and what they collect. Where the law requires consent, it will be asked for before anything
          is collected.
        </p>
      }

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
  protected readonly analyticsOn = analyticsEnabled();
  protected readonly adsOn = adsEnabled(inject(ADS_CONFIG));
}
