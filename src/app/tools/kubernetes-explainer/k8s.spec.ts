import { explainManifest } from './k8s';

const MANIFEST = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: shop-api
spec:
  replicas: 3
  selector:
    matchLabels: { app: shop-api }
  template:
    metadata:
      labels: { app: shop-api }
    spec:
      containers:
        - name: api
          image: ghcr.io/acme/shop-api:latest
          ports: [{ containerPort: 8080 }]
          resources:
            requests: { cpu: 100m, memory: 128Mi }
---
apiVersion: v1
kind: Service
metadata:
  name: shop-api
spec:
  selector: { app: shop }
  ports: [{ port: 80, targetPort: 8080 }]
---
apiVersion: v1
kind: Secret
metadata:
  name: db
data:
  password: not base64!
`;

describe('explainManifest', () => {
  it('summarises each resource and explains its fields', () => {
    const r = explainManifest(MANIFEST);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resources.map((x) => x.summary)).toEqual([
      'Keeps 3 copies of ghcr.io/acme/shop-api:latest running as “shop-api”.',
      'ClusterIP service “shop-api” sends port 80→8080 to pods with app=shop.',
      'Holds 1 values (password).',
    ]);
    expect(r.resources[0].fields.find((f) => f.path === 'spec.replicas')).toEqual({ path: 'spec.replicas', value: '3', meaning: 'How many identical pods to keep running.' });
  });

  it('finds common mistakes', () => {
    const r = explainManifest(MANIFEST);
    if (!r.ok) throw new Error();
    const deployment = r.resources[0].findings.map((f) => f.message);
    expect(deployment).toContain('api uses the :latest tag. Pin a version so every pod runs the same code.');
    expect(deployment).toContain('api has no memory limit; a leak can starve other pods on the node.');
    expect(r.resources[2].findings).toEqual([{ level: 'error', message: 'data.password is not valid Base64. Use stringData for plain text.' }]);
    expect(r.findings[0].message).toContain('selects app=shop, but no pod template');
  });

  it('reports broken YAML, bad schedules and empty input', () => {
    expect(explainManifest('a: [1, 2')).toMatchObject({ ok: false });
    const cron = explainManifest('apiVersion: batch/v1\nkind: CronJob\nmetadata: {name: x}\nspec:\n  schedule: "61 * * * *"\n  jobTemplate: {spec: {template: {spec: {containers: [{name: c, image: busybox:1.36}]}}}}');
    expect(cron.ok && cron.resources[0].findings.some((f) => f.message.startsWith('The schedule is not valid'))).toBe(true);
    expect(explainManifest('')).toMatchObject({ ok: false });
  });
});
