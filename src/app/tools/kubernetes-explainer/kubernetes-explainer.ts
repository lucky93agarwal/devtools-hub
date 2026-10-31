import { Component, computed, signal } from '@angular/core';
import { onSharedInput } from '../../core/shared-input';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { ShareButton } from '../../shared/share-button/share-button';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-info/tool-info';
import { Finding, explainManifest } from './k8s';

const SAMPLE = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: shop-api
  labels: { app: shop-api }
spec:
  replicas: 2
  selector:
    matchLabels: { app: shop-api }
  template:
    metadata:
      labels: { app: shop-api }
    spec:
      containers:
        - name: api
          image: ghcr.io/acme/shop-api:1.4.2
          ports: [{ containerPort: 8080 }]
          env:
            - name: DB_PASSWORD
              valueFrom: { secretKeyRef: { name: db, key: password } }
          resources:
            requests: { cpu: 100m, memory: 128Mi }
            limits: { memory: 256Mi }
          readinessProbe:
            httpGet: { path: /health, port: 8080 }
---
apiVersion: v1
kind: Service
metadata:
  name: shop-api
spec:
  selector: { app: shop-api }
  ports: [{ port: 80, targetPort: 8080 }]
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shop
spec:
  ingressClassName: nginx
  rules:
    - host: shop.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: shop-api, port: { number: 80 } } }
`;

const CONTENT: ToolContent = {
  aboutHeading: 'About this Kubernetes YAML explainer',
  about:
    'Kubernetes manifests are long and every field matters. Paste one or more resources (Deployments, Services, ' +
    'Ingresses, ConfigMaps, Secrets, Jobs, CronJobs, autoscalers and storage claims) to get a one-line summary of what ' +
    'each does, the meaning of its important fields, and checks for common mistakes: :latest images, missing resource ' +
    'requests and memory limits, no health probes, root containers, Services that select no pods, Secrets that are not ' +
    'Base64 and invalid CronJob schedules.',
  steps: [
    'Paste the YAML, with several resources separated by ---, or try the sample.',
    'Read the summary of each resource and the problems found.',
    'Open a resource to see what each field means.',
  ],
  faq: [
    { question: 'Does this connect to my cluster?', answer: 'No. It only reads the YAML you paste, in your browser. Nothing is sent anywhere.' },
    { question: 'Should I set CPU limits?', answer: 'Opinions differ: CPU limits can slow apps down even when the node has spare CPU. Memory limits matter more, because memory cannot be shared back. Always set requests.' },
    { question: 'Are Secrets encrypted?', answer: 'No, Secret values are only Base64-encoded. Restrict access with RBAC and enable encryption at rest in the cluster.' },
  ],
};

@Component({
  selector: 'app-kubernetes-explainer',
  imports: [CodeEditor, ShareButton, ToolPage],
  template: `
    <app-tool-page path="kubernetes-explainer" [content]="content" [wide]="true" privacy="Read in your browser. Your manifests are never sent to a server or a cluster.">
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-small" (click)="yaml.set(sample)">Try a sample</button>
        <button type="button" class="btn-small" [disabled]="!yaml()" (click)="yaml.set('')">Clear</button>
        <app-share-button path="kubernetes-explainer" [data]="yaml().trim() ? { input: yaml() } : null" />
      </div>
      <div class="mt-4 grid gap-6 lg:grid-cols-2">
        <app-code-editor class="h-96 lg:h-[36rem]" ariaLabel="Kubernetes YAML" placeholder="Paste Kubernetes YAML here." [value]="yaml()" (valueChange)="yaml.set($event)" />
        <div class="flex flex-col gap-4" aria-live="polite">
          @if (result(); as r) {
            @if (!r.ok) {
              <p class="rounded-xl border border-danger bg-danger/10 px-4 py-3 text-sm">{{ r.error }}</p>
            } @else {
              @for (f of r.findings; track f.message) {
                <p class="rounded-xl border px-4 py-2 text-sm" [class]="tone(f)">{{ f.message }}</p>
              }
              @for (res of r.resources; track $index) {
                <section class="card p-4">
                  <p class="text-xs font-semibold tracking-wide text-muted uppercase">{{ res.kind }} · {{ res.name || 'no name' }}</p>
                  <p class="mt-1 font-semibold">{{ res.summary }}</p>
                  @for (f of res.findings; track f.message) {
                    <p class="mt-2 rounded-lg border px-3 py-1.5 text-sm" [class]="tone(f)"><span class="font-semibold capitalize">{{ f.level }}:</span> {{ f.message }}</p>
                  }
                  <details class="mt-3 text-sm">
                    <summary class="cursor-pointer font-semibold">What the fields mean ({{ res.fields.length }})</summary>
                    <dl class="mt-2 flex flex-col gap-2">
                      @for (field of res.fields; track field.path) {
                        <div>
                          <dt class="font-mono text-xs"><span class="text-brand">{{ field.path }}</span>: {{ field.value }}</dt>
                          <dd class="text-muted">{{ field.meaning }}</dd>
                        </div>
                      }
                    </dl>
                  </details>
                </section>
              }
            }
          } @else {
            <p class="card p-4 text-sm text-muted">Paste Kubernetes YAML on the left to see what it does.</p>
          }
        </div>
      </div>
    </app-tool-page>
  `,
})
export class KubernetesExplainer {
  protected readonly content = CONTENT;
  protected readonly sample = SAMPLE;
  protected readonly yaml = signal('');
  protected readonly result = computed(() => (this.yaml().trim() ? explainManifest(this.yaml()) : null));

  constructor() {
    onSharedInput((d) => this.yaml.set(d['input'] ?? ''));
  }

  protected tone(f: Finding): string {
    return f.level === 'error' ? 'border-danger bg-danger/10' : f.level === 'warning' ? 'border-warning bg-warning/10' : 'border-line bg-page';
  }
}
