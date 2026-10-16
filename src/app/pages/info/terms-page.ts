import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SITE_NAME } from '../../core/app-config';
import { InfoPage } from './info-page';

@Component({
  selector: 'app-terms-page',
  imports: [InfoPage, RouterLink],
  template: `
    <app-info-page heading="Terms of use" updated="16 October 2026">
      <p>
        By using {{ siteName }} you agree to these terms. They are short because the site is simple: free tools that run
        in your browser.
      </p>

      <h2>Using the tools</h2>
      <ul>
        <li>The tools are free for personal and commercial use.</li>
        <li>You are responsible for the data you put into them and for how you use the results.</li>
        <li>
          Do not use the site to break the law, to attack other systems, or to overload or interfere with the site itself.
        </li>
      </ul>

      <h2>Tokens, secrets and keys</h2>
      <p>
        The JWT tool works entirely in your browser, but you should still not paste secrets, keys or tokens that give
        access to live production systems into any website, including this one. Tokens and keys created with the tool are
        for testing only and must not be used to protect real systems.
      </p>

      <h2>No warranty</h2>
      <p>
        The tools are provided "as is", without any warranty. They are tested with care, but they may contain mistakes,
        and results such as converted images, formatted JSON or signature checks may be wrong. Check important results
        yourself before relying on them.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the extent the law allows, {{ siteName }} is not liable for any loss or damage that comes from using, or not
        being able to use, the site or its results.
      </p>

      <h2>Your content</h2>
      <p>
        Everything you process with the tools stays yours. Because it never leaves your browser, the site never sees it
        and claims no rights to it.
      </p>

      <h2>Changes</h2>
      <p>
        These terms may change as the site grows, for example when new tools or a paid plan are added. The date at the top
        shows the latest version. Continuing to use the site after a change means you accept the new terms.
      </p>

      <h2>Contact</h2>
      <p>Questions about these terms can be sent through the <a routerLink="/contact">contact page</a>.</p>
    </app-info-page>
  `,
})
export class TermsPage {
  protected readonly siteName = SITE_NAME;
}
