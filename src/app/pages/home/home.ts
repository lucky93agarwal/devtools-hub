import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TOOLS } from '../../core/tools';
import { GUIDES } from '../../core/guides';
import { ICONS, Icon } from '../../shared/icon/icon';
import { ToolCard } from '../../shared/tool-card/tool-card';

@Component({
  selector: 'app-home',
  imports: [RouterLink, Icon, ToolCard],
  template: `
    <section class="container-page pt-12 pb-10 text-center sm:pt-20">
      <h1 class="mx-auto max-w-3xl text-[28px] leading-9 sm:text-[40px] sm:leading-12">
        Developer tools that stay on your device
      </h1>
      <p class="mx-auto mt-4 max-w-2xl text-xl leading-7 font-semibold text-muted">
        Format JSON, turn it into code, convert data and images, and make app icons. Free, fast and private.
      </p>

      <div class="mt-8 flex justify-center">
        <a routerLink="/json-formatter" class="btn-primary">
          Open JSON formatter
          <app-icon [path]="icons.arrowRight" [size]="20" />
        </a>
      </div>

      <ul class="mt-6 flex flex-wrap justify-center gap-2" aria-label="Highlights">
        @for (chip of chips; track chip) {
          <li class="chip">
            <app-icon [path]="icons.check" [size]="16" />
            {{ chip }}
          </li>
        }
      </ul>
    </section>

    <section class="container-page" aria-labelledby="tools-heading">
      <h2 id="tools-heading" class="sr-only">All tools</h2>
      <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        @for (tool of tools; track tool.path) {
          <li><app-tool-card [tool]="tool" /></li>
        }
      </ul>
    </section>

    <section class="container-page mt-16" aria-labelledby="why-heading">
      <h2 id="why-heading" class="text-2xl leading-8 sm:text-[28px] sm:leading-9">Why these tools run in your browser</h2>
      <div class="mt-4 grid gap-6 text-muted md:grid-cols-3">
        <p>
          Most online formatters and converters upload what you paste to a server. That is a poor fit for API responses,
          configuration files, access tokens and private photos. Every tool here does its work with JavaScript and
          WebAssembly on your own device, so your data is never sent anywhere.
        </p>
        <p>
          Because nothing travels over the network, the tools are fast even with large files and keep working on a slow
          connection. There is no account to create and nothing to install: open a page and start working.
        </p>
        <p>
          The tools are built for everyday developer work: checking a JSON payload, decoding a JWT from a failing request,
          comparing two API responses, generating typed models for a new endpoint, or preparing images and app icons for a
          release.
        </p>
      </div>
    </section>

    <section class="container-page mt-16" aria-labelledby="guides-heading">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="guides-heading" class="text-2xl leading-8 sm:text-[28px] sm:leading-9">Guides</h2>
        <a routerLink="/guides" class="text-brand underline underline-offset-2">All guides</a>
      </div>
      <ul class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        @for (guide of guides; track guide.slug) {
          <li>
            <a [routerLink]="'/guides/' + guide.slug" class="flex h-full flex-col gap-2 rounded-xl border border-line p-4 hover:border-brand">
              <span class="font-heading font-semibold">{{ guide.title }}</span>
              <span class="text-sm text-muted">{{ guide.description }}</span>
            </a>
          </li>
        }
      </ul>
    </section>
  `,
})
export class Home {
  protected readonly tools = TOOLS.filter((tool) => tool.onHome);
  protected readonly icons = ICONS;
  protected readonly chips = ['No login', 'No uploads', 'Free'];
  protected readonly guides = GUIDES.slice(0, 6);
}
