import { Component, computed, signal } from '@angular/core';
import { onSharedInput } from '../../core/shared-input';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { CopyButton } from '../../shared/copy-button/copy-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { composeToDockerRun, dockerRunToCompose } from './docker';

const RUN_SAMPLE = `docker run -d --name shop-db \\
  -p 5432:5432 \\
  -e POSTGRES_USER=shop -e POSTGRES_PASSWORD=change-me -e POSTGRES_DB=shop \\
  -v pgdata:/var/lib/postgresql/data \\
  --restart unless-stopped \\
  --health-cmd "pg_isready -U shop" --health-interval 10s \\
  postgres:16`;

const COMPOSE_SAMPLE = `services:
  web:
    image: nginx:1.27
    ports:
      - "8080:80"
    volumes:
      - ./site:/usr/share/nginx/html:ro
    restart: always
  cache:
    image: redis:7
    command: ["redis-server", "--appendonly", "yes"]
`;

const CONTENT: ToolContent = {
  aboutHeading: 'About this docker run to Compose converter',
  about:
    'Projects often start with a long docker run command from a README and later need a docker-compose.yml, or the ' +
    'other way round. Paste a docker run command to get the same container as a Compose service, with ports, volumes, ' +
    'environment variables, restart policy, health check, networks and resource limits mapped to their Compose keys. ' +
    'Options that have no Compose equivalent are listed so nothing is lost silently.',
  steps: [
    'Choose the direction: docker run to Compose, or Compose to docker run.',
    'Paste the command or the Compose file. Line breaks with \\ are fine.',
    'Check the list of options that were not converted, if any.',
    'Copy the result into docker-compose.yml or your terminal.',
  ],
  faq: [
    { question: 'Why is --rm or -d missing from the Compose file?', answer: 'Compose always runs services in the background and manages containers itself, so those options are not needed.' },
    { question: 'What about services built from a Dockerfile?', answer: 'A service with build: has no image to run, so you need docker build first. The converter adds a note for those services.' },
    { question: 'Should I use docker-compose or docker compose?', answer: 'docker compose (Compose v2, built into Docker) is current. The file format is the same, and the version: line is no longer needed.' },
  ],
};

@Component({
  selector: 'app-docker-compose-converter',
  imports: [CodeEditor, CopyButton, ToolPage],
  template: `
    <app-tool-page path="docker-compose-converter" [content]="content" [wide]="true">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex w-fit rounded-full border border-line p-0.5" role="tablist" aria-label="Direction">
          @for (tab of tabs; track tab.value) {
            <button type="button" role="tab" class="rounded-full px-4 py-2 text-sm leading-5 font-semibold transition-colors"
              [class]="direction() === tab.value ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'" [attr.aria-selected]="direction() === tab.value" (click)="setDirection(tab.value)">
              {{ tab.label }}
            </button>
          }
        </div>
        <button type="button" class="btn-small" (click)="input.set(direction() === 'run' ? runSample : composeSample)">Try a sample</button>
      </div>

      <div class="mt-4 min-h-6 text-sm" aria-live="polite">
        @if (error(); as message) {
          <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3">{{ message }}</p>
        } @else if (skipped().length) {
          <p class="rounded-xl border border-warning bg-warning/10 px-4 py-3">Not converted (no Compose equivalent here): <code class="font-mono">{{ skipped().join(', ') }}</code></p>
        }
      </div>

      <div class="mt-2 grid gap-4 lg:grid-cols-2">
        <div class="flex flex-col gap-2">
          <span class="text-sm leading-5 font-semibold">{{ direction() === 'run' ? 'docker run command' : 'docker-compose.yml' }}</span>
          <app-code-editor class="h-80 lg:h-[28rem]" ariaLabel="Input" [placeholder]="direction() === 'run' ? 'docker run -d -p 80:80 nginx' : 'services:'" [value]="input()" (valueChange)="input.set($event)" />
        </div>
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm leading-5 font-semibold">{{ direction() === 'run' ? 'docker-compose.yml' : 'docker run commands' }}</span>
            <app-copy-button [text]="output()" />
          </div>
          <app-code-editor class="h-80 lg:h-[28rem]" ariaLabel="Result" placeholder="The result appears here." [readOnly]="true" [value]="output()" />
        </div>
      </div>
    </app-tool-page>
  `,
})
export class DockerComposeConverter {
  protected readonly content = CONTENT;
  protected readonly runSample = RUN_SAMPLE;
  protected readonly composeSample = COMPOSE_SAMPLE;
  protected readonly tabs = [
    { value: 'run' as const, label: 'docker run → Compose' },
    { value: 'compose' as const, label: 'Compose → docker run' },
  ];
  protected readonly direction = signal<'run' | 'compose'>('run');
  protected readonly input = signal('');

  private readonly result = computed(() => {
    if (!this.input().trim()) return null;
    if (this.direction() === 'run') return dockerRunToCompose(this.input());
    const r = composeToDockerRun(this.input());
    return r.ok ? { ok: true as const, yaml: r.commands, skipped: [] } : r;
  });
  protected readonly output = computed(() => {
    const r = this.result();
    return r?.ok ? r.yaml : '';
  });
  protected readonly error = computed(() => {
    const r = this.result();
    return r && !r.ok ? r.error : null;
  });
  protected readonly skipped = computed(() => {
    const r = this.result();
    return r?.ok ? r.skipped : [];
  });

  constructor() {
    onSharedInput((d) => {
      this.direction.set(/^\s*services\s*:/m.test(d['input'] ?? '') ? 'compose' : 'run');
      this.input.set(d['input'] ?? '');
    });
  }

  protected setDirection(direction: 'run' | 'compose'): void {
    if (direction === this.direction()) return;
    this.direction.set(direction);
    this.input.set(this.output());
  }
}
