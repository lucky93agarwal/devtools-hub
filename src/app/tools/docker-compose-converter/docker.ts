/** `docker run` commands to Docker Compose services and back. */
import { parse as parseYaml, stringify } from 'yaml';
import { shellQuote, shellWords } from '../api-client/curl';

type Service = Record<string, unknown>;

export type ComposeResult = { ok: true; yaml: string; skipped: string[] } | { ok: false; error: string };

/** Flags that take a value, so the parser knows the next word is not the image. */
const WITH_VALUE = new Set(
  ('-p --publish -v --volume -e --env --env-file --name -w --workdir -u --user --network --net --restart -h --hostname ' +
    '--entrypoint -l --label --mount --memory -m --cpus --add-host --dns --cap-add --cap-drop --device --platform ' +
    '--health-cmd --health-interval --health-timeout --health-retries --log-driver --log-opt --ulimit --shm-size ' +
    '--tmpfs --pull --stop-signal --network-alias --expose --link --pid --ipc --gpus --runtime --security-opt').split(' '),
);

export function dockerRunToCompose(command: string): ComposeResult {
  let words: string[];
  try {
    words = shellWords(command.replace(/\\\r?\n/g, ' ').trim());
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
  if (words[0] === 'docker' && (words[1] === 'run' || (words[1] === 'container' && words[2] === 'run'))) words = words.slice(words[1] === 'run' ? 2 : 3);
  else if (words[0] === 'docker') return { ok: false, error: 'Paste a command that starts with docker run.' };
  else return { ok: false, error: 'Paste a command that starts with docker run.' };

  const s: Service = {};
  const list = (key: string, value: unknown) => ((s[key] ??= []) as unknown[]).push(value);
  const skipped: string[] = [];
  let i = 0;
  for (; i < words.length && words[i].startsWith('-'); i++) {
    let flag = words[i];
    let value: string | undefined;
    if (flag.includes('=') && flag.startsWith('--')) [flag, value] = [flag.slice(0, flag.indexOf('=')), flag.slice(flag.indexOf('=') + 1)];
    else if (WITH_VALUE.has(flag)) value = words[++i];
    else if (/^-[a-zA-Z]{2,}$/.test(flag)) {
      // Short flags written together, such as -it or -dit.
      for (const f of flag.slice(1)) if (f === 'i') s['stdin_open'] = true; else if (f === 't') s['tty'] = true; else if (f !== 'd') skipped.push(`-${f}`);
      continue;
    }
    switch (flag) {
      case '-p': case '--publish': list('ports', value); break;
      case '-v': case '--volume': list('volumes', value); break;
      case '-e': case '--env': list('environment', value); break;
      case '--env-file': list('env_file', value); break;
      case '--name': s['container_name'] = value; break;
      case '-w': case '--workdir': s['working_dir'] = value; break;
      case '-u': case '--user': s['user'] = value; break;
      case '--network': case '--net': if (value !== 'bridge') list('networks', value); break;
      case '--restart': s['restart'] = value; break;
      case '-h': case '--hostname': s['hostname'] = value; break;
      case '--entrypoint': s['entrypoint'] = value; break;
      case '-l': case '--label': list('labels', value); break;
      case '--add-host': list('extra_hosts', value); break;
      case '--dns': list('dns', value); break;
      case '--cap-add': list('cap_add', value); break;
      case '--cap-drop': list('cap_drop', value); break;
      case '--device': list('devices', value); break;
      case '--platform': s['platform'] = value; break;
      case '-m': case '--memory': s['mem_limit'] = value; break;
      case '--cpus': s['cpus'] = Number(value); break;
      case '--shm-size': s['shm_size'] = value; break;
      case '--expose': list('expose', value); break;
      case '--tmpfs': list('tmpfs', value); break;
      case '--privileged': s['privileged'] = true; break;
      case '--init': s['init'] = true; break;
      case '--read-only': s['read_only'] = true; break;
      case '-i': case '--interactive': s['stdin_open'] = true; break;
      case '-t': case '--tty': s['tty'] = true; break;
      case '-d': case '--detach': case '--rm': break;
      case '--health-cmd': ((s['healthcheck'] ??= {}) as Service)['test'] = ['CMD-SHELL', value]; break;
      case '--health-interval': ((s['healthcheck'] ??= {}) as Service)['interval'] = value; break;
      case '--health-timeout': ((s['healthcheck'] ??= {}) as Service)['timeout'] = value; break;
      case '--health-retries': ((s['healthcheck'] ??= {}) as Service)['retries'] = Number(value); break;
      case '--log-driver': ((s['logging'] ??= {}) as Service)['driver'] = value; break;
      default: skipped.push(value === undefined ? flag : `${flag} ${value}`);
    }
  }
  const image = words[i];
  if (!image) return { ok: false, error: 'The command has no image name after the options.' };
  s['image'] = image;
  if (words.length > i + 1) s['command'] = words.slice(i + 1);
  // image first, the way people write Compose files.
  const ordered: Service = { image, ...Object.fromEntries(Object.entries(s).filter(([k]) => k !== 'image')) };
  const name = String(s['container_name'] ?? image.split('/').pop()!.split(':')[0]).replace(/[^\w.-]/g, '-');
  const networks = s['networks'] as string[] | undefined;
  const doc: Record<string, unknown> = { services: { [name]: ordered } };
  if (networks?.length) doc['networks'] = Object.fromEntries(networks.map((n) => [n, { external: true }]));
  return { ok: true, yaml: stringify(doc, { lineWidth: 0 }), skipped };
}

export type RunResult = { ok: true; commands: string } | { ok: false; error: string };

/** Each Compose service as a docker run command. */
export function composeToDockerRun(yaml: string): RunResult {
  let doc: { services?: Record<string, Service> };
  try {
    doc = parseYaml(yaml) ?? {};
  } catch (error) {
    return { ok: false, error: `This is not valid YAML: ${(error as Error).message.split('\n')[0]}` };
  }
  if (!doc.services || typeof doc.services !== 'object') return { ok: false, error: 'No services: section was found.' };
  const q = (v: unknown) => (/^[\w./:=@,+-]+$/.test(String(v)) ? String(v) : shellQuote(String(v)));
  const commands: string[] = [];
  for (const [name, s] of Object.entries(doc.services)) {
    if (!s['image']) {
      commands.push(`# ${name}: has no image (it uses build:), so build it first with docker build.`);
      continue;
    }
    const parts = ['docker run -d', `--name ${q(s['container_name'] ?? name)}`];
    const each = (key: string, flag: string) => {
      const value = s[key];
      const items = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.entries(value).map(([k, v]) => `${k}=${v ?? ''}`) : [];
      for (const item of items) parts.push(`${flag} ${q(typeof item === 'object' ? JSON.stringify(item) : item)}`);
    };
    each('ports', '-p');
    each('volumes', '-v');
    each('environment', '-e');
    each('env_file', '--env-file');
    each('labels', '-l');
    each('extra_hosts', '--add-host');
    for (const [key, flag] of [['restart', '--restart'], ['working_dir', '-w'], ['user', '-u'], ['hostname', '-h'], ['mem_limit', '-m'], ['cpus', '--cpus'], ['platform', '--platform']]) {
      if (s[key] !== undefined) parts.push(`${flag} ${q(s[key])}`);
    }
    if (Array.isArray(s['networks'])) for (const n of s['networks']) parts.push(`--network ${q(n)}`);
    if (s['privileged']) parts.push('--privileged');
    if (s['entrypoint']) parts.push(`--entrypoint ${q(Array.isArray(s['entrypoint']) ? s['entrypoint'][0] : s['entrypoint'])}`);
    parts.push(q(s['image']));
    if (s['command']) parts.push(Array.isArray(s['command']) ? s['command'].map(q).join(' ') : String(s['command']));
    commands.push(parts.join(' \\\n  '));
  }
  return { ok: true, commands: commands.join('\n\n') + '\n' };
}
