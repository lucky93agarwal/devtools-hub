import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { REPO_URL, SITE_NAME } from '../../core/app-config';
import { TOOLS } from '../../core/tools';
import { InfoPage } from './info-page';

@Component({
  selector: 'app-about-page',
  imports: [InfoPage, RouterLink],
  template: `
    <app-info-page heading="About {{ siteName }}">
      <p>
        {{ siteName }} is a collection of small, focused tools for developers, testers and anyone who works with data:
        formatting and comparing JSON, converting images, and reading and checking JSON Web Tokens.
      </p>

      <h2>Why it exists</h2>
      <p>
        Many online tools ask you to upload your files or paste your data into a form that goes to someone else's server.
        That is a poor fit for API responses, config files, private photos or security tokens. Every tool here runs inside
        your browser instead, so your data never leaves your device. You do not need an account, and the site does not use
        cookies.
      </p>

      <h2>The tools</h2>
      <ul>
        @for (tool of liveTools; track tool.path) {
          <li>
            <a [routerLink]="'/' + tool.path">{{ tool.name }}</a>: {{ tool.description }}
          </li>
        }
      </ul>
      <p>
        More tools are on the way for mobile developers, such as turning JSON into Kotlin, Dart or Swift models and
        generating app icons.
      </p>

      <h2>Who builds it</h2>
      <p>
        {{ siteName }} is built and run by an independent developer. The source code is public on
        <a [href]="repoUrl" target="_blank" rel="noopener">GitHub</a>, so you can see exactly what the tools do with your
        data.
      </p>

      <h2>Feedback</h2>
      <p>
        Found a bug or missing a tool? Say so on the <a routerLink="/contact">contact page</a>. Requests from people who
        use the tools decide what gets built next.
      </p>
    </app-info-page>
  `,
})
export class AboutPage {
  protected readonly siteName = SITE_NAME;
  protected readonly repoUrl = REPO_URL;
  /** Tools that are built; "coming soon" ones are described in the text instead. */
  protected readonly liveTools = TOOLS.filter((tool) => tool.live);
}
