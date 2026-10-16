import { Component } from '@angular/core';
import { REPO_URL } from '../../core/app-config';
import { InfoPage } from './info-page';

@Component({
  selector: 'app-contact-page',
  imports: [InfoPage],
  template: `
    <app-info-page heading="Contact">
      <p>
        The best way to reach us is through GitHub issues. You can read existing reports there, add to them, or start a new
        one. A free GitHub account is needed to write.
      </p>

      <div class="mt-6 grid gap-4 sm:grid-cols-2">
        <a class="card block p-5 !no-underline hover:border-brand" [href]="newIssueUrl" target="_blank" rel="noopener">
          <span class="block font-heading text-lg font-semibold text-ink">Report a bug or request a tool</span>
          <span class="mt-1 block text-sm leading-5 text-muted">Opens a new issue on GitHub.</span>
        </a>
        <a class="card block p-5 !no-underline hover:border-brand" [href]="issuesUrl" target="_blank" rel="noopener">
          <span class="block font-heading text-lg font-semibold text-ink">See open reports</span>
          <span class="mt-1 block text-sm leading-5 text-muted">Check whether someone already asked.</span>
        </a>
      </div>

      <h2>When you report a problem</h2>
      <ul>
        <li>Say which tool you used and what you expected to happen.</li>
        <li>Name your browser and device, for example Chrome on Android.</li>
        <li>
          Do not include private data, real tokens, secrets or keys. Issues on GitHub are public. If a sample is needed,
          make a small one that shows the same problem.
        </li>
      </ul>
    </app-info-page>
  `,
})
export class ContactPage {
  protected readonly issuesUrl = `${REPO_URL}/issues`;
  protected readonly newIssueUrl = `${REPO_URL}/issues/new`;
}
