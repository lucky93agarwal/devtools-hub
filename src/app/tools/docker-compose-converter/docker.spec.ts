import { composeToDockerRun, dockerRunToCompose } from './docker';

describe('docker', () => {
  it('turns a docker run command into a Compose service', () => {
    const r = dockerRunToCompose(`docker run -d --name shop-db -p 5432:5432 \\
  -e POSTGRES_PASSWORD=secret -e "POSTGRES_DB=shop" -v pgdata:/var/lib/postgresql/data \\
  --restart unless-stopped --network backend postgres:16 postgres -c max_connections=200`);
    expect(r).toEqual({
      ok: true,
      skipped: [],
      yaml:
        'services:\n  shop-db:\n    image: postgres:16\n    container_name: shop-db\n    ports:\n      - 5432:5432\n    environment:\n' +
        '      - POSTGRES_PASSWORD=secret\n      - POSTGRES_DB=shop\n    volumes:\n      - pgdata:/var/lib/postgresql/data\n' +
        '    restart: unless-stopped\n    networks:\n      - backend\n    command:\n      - postgres\n      - -c\n      - max_connections=200\n' +
        'networks:\n  backend:\n    external: true\n',
    });
  });

  it('handles combined short flags, = values and lists unknown flags', () => {
    const r = dockerRunToCompose('docker run -it --rm --memory=512m --gpus all node:22 bash');
    expect(r.ok && r.yaml).toContain('stdin_open: true');
    expect(r.ok && r.yaml).toContain('mem_limit: 512m');
    expect(r.ok && r.skipped).toEqual(['--gpus all']);
    expect(dockerRunToCompose('docker ps')).toMatchObject({ ok: false });
    expect(dockerRunToCompose('docker run -p 80:80')).toMatchObject({ ok: false });
  });

  it('turns Compose services back into docker run commands', () => {
    const r = composeToDockerRun(`services:
  web:
    image: nginx:1.27
    ports: ["8080:80"]
    environment:
      MODE: prod
      GREETING: hello world
    restart: always
  api:
    build: .
`);
    expect(r).toEqual({
      ok: true,
      commands:
        "docker run -d \\\n  --name web \\\n  -p 8080:80 \\\n  -e MODE=prod \\\n  -e 'GREETING=hello world' \\\n  --restart always \\\n  nginx:1.27\n\n" +
        '# api: has no image (it uses build:), so build it first with docker build.\n',
    });
    expect(composeToDockerRun('version: 3')).toMatchObject({ ok: false });
  });
});
