/**
 * Kubernetes manifests explained: a one-line summary per resource, what each important field means, and checks
 * for common mistakes (no resource limits or probes, :latest images, selectors that match nothing, bad Secrets).
 */
import { parseAllDocuments } from 'yaml';
import { parseCron } from '../cron-expression/cron';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

export interface Finding {
  level: 'error' | 'warning' | 'tip';
  message: string;
}

export interface FieldNote {
  path: string;
  value: string;
  meaning: string;
}

export interface Resource {
  kind: string;
  name: string;
  summary: string;
  fields: FieldNote[];
  findings: Finding[];
}

export type ExplainResult = { ok: true; resources: Resource[]; findings: Finding[] } | { ok: false; error: string };

/** What common fields mean; [] stands for any list index. */
const FIELD_DOCS: [RegExp, string][] = [
  [/^apiVersion$/, 'The API group and version this resource belongs to.'],
  [/^kind$/, 'The type of resource.'],
  [/^metadata\.name$/, 'Unique name within the namespace.'],
  [/^metadata\.namespace$/, 'The namespace it lives in; without it, the namespace of kubectl is used.'],
  [/^metadata\.labels\./, 'A label: key-value tags used by selectors to find resources.'],
  [/^metadata\.annotations\./, 'An annotation: extra information read by tools, not used for selecting.'],
  [/^spec\.replicas$/, 'How many identical pods to keep running.'],
  [/^spec\.selector\.matchLabels\./, 'Which pods this resource manages: pods with these labels.'],
  [/^spec\.selector\./, 'Which pods receive traffic or are managed: pods with these labels.'],
  [/^spec\.strategy\.type$/, 'How pods are replaced on update: RollingUpdate (a few at a time) or Recreate (all at once).'],
  [/^spec\.template\.metadata\.labels\./, 'Labels given to every pod; must match the selector.'],
  [/containers\[\]\.name$/, 'The container’s name inside the pod.'],
  [/containers\[\]\.image$/, 'The container image to run. Pin a version tag or digest.'],
  [/containers\[\]\.imagePullPolicy$/, 'When to download the image: Always, IfNotPresent or Never.'],
  [/containers\[\]\.command\[\]$/, 'Replaces the image’s ENTRYPOINT.'],
  [/containers\[\]\.args\[\]$/, 'Replaces the image’s CMD (arguments).'],
  [/containers\[\]\.ports\[\]\.containerPort$/, 'The port the app listens on inside the container (for documentation and named ports).'],
  [/containers\[\]\.env\[\]\.name$/, 'An environment variable for the container.'],
  [/env\[\]\.valueFrom\.secretKeyRef\./, 'The value is read from a Secret, so it is not written in this file.'],
  [/env\[\]\.valueFrom\.configMapKeyRef\./, 'The value is read from a ConfigMap.'],
  [/envFrom\[\]\./, 'Every key of a ConfigMap or Secret becomes an environment variable.'],
  [/resources\.requests\.cpu$/, 'CPU the scheduler reserves for the container (1000m = one core).'],
  [/resources\.requests\.memory$/, 'Memory the scheduler reserves (Mi = mebibytes, Gi = gibibytes).'],
  [/resources\.limits\.cpu$/, 'Most CPU the container may use; above it, it is slowed down.'],
  [/resources\.limits\.memory$/, 'Most memory the container may use; above it, it is killed (OOMKilled).'],
  [/livenessProbe\./, 'Liveness probe: if it keeps failing, Kubernetes restarts the container.'],
  [/readinessProbe\./, 'Readiness probe: the pod only gets traffic while this succeeds.'],
  [/startupProbe\./, 'Startup probe: gives slow apps time to start before liveness checks begin.'],
  [/initialDelaySeconds$/, 'Seconds to wait after the container starts before the first check.'],
  [/periodSeconds$/, 'Seconds between checks.'],
  [/securityContext\.runAsNonRoot$/, 'Refuse to start the container as the root user.'],
  [/securityContext\.readOnlyRootFilesystem$/, 'Make the container’s file system read-only.'],
  [/securityContext\.privileged$/, 'Give the container nearly full access to the node. Avoid.'],
  [/volumeMounts\[\]\.mountPath$/, 'Where a volume appears inside the container.'],
  [/volumes\[\]\.persistentVolumeClaim\./, 'Uses storage from a PersistentVolumeClaim, which survives pod restarts.'],
  [/^spec\.type$/, 'Service type: ClusterIP (inside the cluster), NodePort, LoadBalancer (public IP) or ExternalName.'],
  [/^spec\.ports\[\]\.port$/, 'The port the Service listens on.'],
  [/^spec\.ports\[\]\.targetPort$/, 'The port on the pods that traffic is sent to.'],
  [/^spec\.ports\[\]\.nodePort$/, 'The port opened on every node (30000–32767) for NodePort and LoadBalancer.'],
  [/^spec\.ingressClassName$/, 'Which ingress controller handles this Ingress, such as nginx.'],
  [/^spec\.rules\[\]\.host$/, 'The domain name this rule answers for.'],
  [/^spec\.rules\[\]\.http\.paths\[\]\.path$/, 'The URL path that is routed.'],
  [/backend\.service\.name$/, 'The Service that receives the traffic.'],
  [/^spec\.tls\[\]\./, 'HTTPS settings: hosts and the Secret holding the certificate.'],
  [/^spec\.schedule$/, 'When the job runs, as a cron expression (in the controller’s time zone, usually UTC).'],
  [/^spec\.timeZone$/, 'Time zone for the schedule.'],
  [/^spec\.concurrencyPolicy$/, 'What to do when the previous run is still going: Allow, Forbid or Replace.'],
  [/backoffLimit$/, 'How many times a failed job is retried.'],
  [/^spec\.minReplicas$/, 'Fewest pods the autoscaler keeps.'],
  [/^spec\.maxReplicas$/, 'Most pods the autoscaler may start.'],
  [/^spec\.accessModes\[\]$/, 'How the volume can be mounted: ReadWriteOnce (one node), ReadOnlyMany or ReadWriteMany.'],
  [/^spec\.resources\.requests\.storage$/, 'How much storage is requested.'],
  [/^spec\.storageClassName$/, 'Which kind of storage to use; decides the disk type and provider.'],
  [/^data\./, 'A value stored in this ConfigMap or Secret (Secret values are Base64, not encrypted).'],
  [/^stringData\./, 'A Secret value written as plain text; Kubernetes stores it Base64-encoded.'],
  [/^type$/, 'The kind of Secret, such as Opaque or kubernetes.io/tls.'],
];

function flatten(value: unknown, path = '', out: [string, string][] = []): [string, string][] {
  if (Array.isArray(value)) value.forEach((v) => flatten(v, `${path}[]`, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) flatten(v, path ? `${path}.${k}` : k, out);
  else out.push([path, str(value)]);
  return out;
}

const podSpec = (doc: Obj): Obj => {
  const spec = obj(doc['spec']);
  if (doc['kind'] === 'Pod') return spec;
  if (doc['kind'] === 'CronJob') return obj(obj(obj(obj(spec['jobTemplate'])['spec'])['template'])['spec']);
  return obj(obj(spec['template'])['spec']);
};

function checkContainers(doc: Obj, findings: Finding[]): void {
  const spec = podSpec(doc);
  if (spec['hostNetwork'] === true) findings.push({ level: 'warning', message: 'hostNetwork: true shares the node’s network with the pod. Avoid unless you need it.' });
  for (const c of arr(spec['containers']).map(obj)) {
    const name = str(c['name']) || 'container';
    const image = str(c['image']);
    if (!image) findings.push({ level: 'error', message: `${name} has no image.` });
    else if (!/[:@]/.test(image.split('/').pop()!) || image.endsWith(':latest')) {
      findings.push({ level: 'warning', message: `${name} uses ${image.includes(':') ? 'the :latest tag' : 'no tag (so :latest)'}. Pin a version so every pod runs the same code.` });
    }
    const res = obj(c['resources']);
    if (!res['requests']) findings.push({ level: 'warning', message: `${name} has no resource requests, so the scheduler cannot place it well.` });
    if (!obj(res['limits'])['memory']) findings.push({ level: 'warning', message: `${name} has no memory limit; a leak can starve other pods on the node.` });
    if (doc['kind'] !== 'Job' && doc['kind'] !== 'CronJob') {
      if (!c['readinessProbe']) findings.push({ level: 'tip', message: `${name} has no readinessProbe, so it gets traffic before it is ready.` });
      if (!c['livenessProbe']) findings.push({ level: 'tip', message: `${name} has no livenessProbe, so a hung app is not restarted.` });
    }
    const sc = { ...obj(spec['securityContext']), ...obj(c['securityContext']) };
    if (sc['privileged'] === true) findings.push({ level: 'error', message: `${name} runs privileged: it can control the whole node.` });
    else if (sc['runAsNonRoot'] !== true) findings.push({ level: 'tip', message: `${name} may run as root. Set securityContext.runAsNonRoot: true if the image allows it.` });
  }
}

function summarize(doc: Obj): string {
  const kind = str(doc['kind']);
  const spec = obj(doc['spec']);
  const name = str(obj(doc['metadata'])['name']);
  const images = arr(podSpec(doc)['containers']).map((c) => str(obj(c)['image'])).filter(Boolean);
  switch (kind) {
    case 'Deployment':
    case 'StatefulSet':
      return `Keeps ${spec['replicas'] ?? 1} ${Number(spec['replicas'] ?? 1) === 1 ? 'copy' : 'copies'} of ${images.join(', ') || 'a pod'} running as “${name}”${kind === 'StatefulSet' ? ', each with a stable name and storage' : ''}.`;
    case 'DaemonSet':
      return `Runs ${images.join(', ') || 'a pod'} on every node.`;
    case 'Service': {
      const ports = arr(spec['ports']).map((p) => `${str(obj(p)['port'])}→${str(obj(p)['targetPort'] ?? obj(p)['port'])}`);
      const selector = Object.entries(obj(spec['selector'])).map(([k, v]) => `${k}=${v}`).join(', ');
      return `${str(spec['type']) || 'ClusterIP'} service “${name}” sends port ${ports.join(', ') || '?'} to pods with ${selector || 'no selector'}.`;
    }
    case 'Ingress': {
      const routes = arr(spec['rules']).flatMap((r) =>
        arr(obj(obj(r)['http'])['paths']).map((p) => {
          const svc = obj(obj(obj(p)['backend'])['service']);
          return `${str(obj(r)['host']) || '*'}${str(obj(p)['path']) || '/'} → ${str(svc['name'])}:${str(obj(svc['port'])['number'] ?? obj(svc['port'])['name'])}`;
        }),
      );
      return `Routes ${routes.join('; ') || 'nothing yet'}${spec['tls'] ? ' over HTTPS' : ''}.`;
    }
    case 'ConfigMap':
    case 'Secret':
      return `Holds ${Object.keys({ ...obj(doc['data']), ...obj(doc['stringData']) }).length} values (${Object.keys({ ...obj(doc['data']), ...obj(doc['stringData']) }).join(', ')}).`;
    case 'CronJob':
      return `Runs ${images.join(', ') || 'a job'} on the schedule “${str(spec['schedule'])}”.`;
    case 'Job':
      return `Runs ${images.join(', ') || 'a pod'} once until it succeeds.`;
    case 'HorizontalPodAutoscaler':
      return `Scales ${str(obj(spec['scaleTargetRef'])['name'])} between ${spec['minReplicas'] ?? 1} and ${spec['maxReplicas']} pods.`;
    case 'PersistentVolumeClaim':
      return `Requests ${str(obj(obj(spec['resources'])['requests'])['storage'])} of ${str(spec['storageClassName']) || 'default'} storage.`;
    case 'Pod':
      return `A single pod running ${images.join(', ')}. Pods are usually made by a Deployment instead.`;
    default:
      return `${kind} “${name}”.`;
  }
}

export function explainManifest(text: string): ExplainResult {
  const docs = parseAllDocuments(text);
  const resources: Resource[] = [];
  const findings: Finding[] = [];
  for (const d of Array.isArray(docs) ? docs : [docs]) {
    if (d.errors.length) return { ok: false, error: `This is not valid YAML: ${d.errors[0].message.split('\n')[0]}` };
    const doc = obj(d.toJSON());
    if (!Object.keys(doc).length) continue;
    const kind = str(doc['kind']);
    const name = str(obj(doc['metadata'])['name']);
    const local: Finding[] = [];
    if (!doc['apiVersion']) local.push({ level: 'error', message: 'apiVersion is missing.' });
    if (!kind) local.push({ level: 'error', message: 'kind is missing.' });
    if (!name) local.push({ level: 'error', message: 'metadata.name is missing.' });
    if (['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob', 'Pod'].includes(kind)) checkContainers(doc, local);
    if (['Deployment', 'StatefulSet'].includes(kind) && Number(obj(doc['spec'])['replicas'] ?? 1) < 2) {
      local.push({ level: 'tip', message: 'One replica means downtime during updates and node failures.' });
    }
    if (kind === 'Secret') {
      for (const [k, v] of Object.entries(obj(doc['data']))) {
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(str(v)) || str(v).length % 4 !== 0) local.push({ level: 'error', message: `data.${k} is not valid Base64. Use stringData for plain text.` });
      }
    }
    if (kind === 'Ingress' && !obj(doc['spec'])['tls']) local.push({ level: 'warning', message: 'No tls section, so the site is served over plain HTTP.' });
    if (kind === 'CronJob') {
      const cron = parseCron(str(obj(doc['spec'])['schedule']));
      if (!cron.ok) local.push({ level: 'error', message: `The schedule is not valid: ${cron.error || 'it is empty'}` });
    }
    const fields = flatten(doc)
      .map(([path, value]) => {
        const generic = path.replace(/\[\]/g, '[]');
        const meaning = FIELD_DOCS.find(([pattern]) => pattern.test(generic))?.[1];
        return meaning ? { path, value, meaning } : null;
      })
      .filter((f): f is FieldNote => f !== null);
    resources.push({ kind: kind || 'Unknown', name, summary: summarize(doc), fields, findings: local });
  }
  // Services whose selector matches no pod template in the same file.
  const all = (Array.isArray(docs) ? docs : [docs]).map((d) => obj(d.toJSON()));
  const podLabels = all
    .filter((d) => ['Deployment', 'StatefulSet', 'DaemonSet', 'Pod'].includes(str(d['kind'])))
    .map((d) => (d['kind'] === 'Pod' ? obj(obj(d['metadata'])['labels']) : obj(obj(obj(obj(d['spec'])['template'])['metadata'])['labels'])));
  for (const svc of all.filter((d) => d['kind'] === 'Service')) {
    const selector = obj(obj(svc['spec'])['selector']);
    const wanted = Object.entries(selector);
    if (wanted.length && podLabels.length && !podLabels.some((labels) => wanted.every(([k, v]) => labels[k] === v))) {
      const name = str(obj(svc['metadata'])['name']);
      findings.push({ level: 'warning', message: `Service “${name}” selects ${wanted.map(([k, v]) => `${k}=${v}`).join(', ')}, but no pod template in this file has those labels.` });
    }
  }
  if (!resources.length) return { ok: false, error: 'No Kubernetes resources were found.' };
  return { ok: true, resources, findings };
}
