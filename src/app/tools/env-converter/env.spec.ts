import { convertEnv, envKey, envValue, objectToEnv, parseEnv } from './env';

const ENV = `# App settings
export APP_NAME=Shop API
PORT=8080 # web port
DATABASE_URL="postgres://user:p#ss@db:5432/shop"
GREETING="Hello\\nWorld"
LITERAL='keep \\n as is'
PRIVATE_KEY="-----BEGIN KEY-----
abc
-----END KEY-----"
EMPTY=
PORT=9090
`;

describe('env', () => {
  it('reads values the way dotenv does', () => {
    const { entries, issues } = parseEnv(ENV);
    expect(Object.fromEntries(entries.map((e) => [e.key, e.value]))).toEqual({
      APP_NAME: 'Shop API',
      DATABASE_URL: 'postgres://user:p#ss@db:5432/shop',
      GREETING: 'Hello\nWorld',
      LITERAL: 'keep \\n as is',
      PRIVATE_KEY: '-----BEGIN KEY-----\nabc\n-----END KEY-----',
      EMPTY: '',
      PORT: '9090',
    });
    expect(issues).toEqual([
      { line: 2, severity: 'warning', message: 'APP_NAME has spaces but no quotes. Some tools will cut it at the first space.' },
      { line: 11, severity: 'warning', message: 'PORT was already set on line 3. The last value wins.' },
    ]);
  });

  it('reports lines it cannot read', () => {
    expect(parseEnv('JUST_A_NAME\n1BAD=x\nOPEN="abc').issues.map((i) => [i.line, i.severity])).toEqual([
      [1, 'error'],
      [2, 'error'],
      [3, 'error'],
    ]);
  });

  it('converts to JSON, YAML, shell and Kubernetes', () => {
    const { entries } = parseEnv('NAME=shop\nDEBUG=true\nMSG="it\'s: here"');
    expect(convertEnv(entries, 'json')).toBe('{\n  "NAME": "shop",\n  "DEBUG": "true",\n  "MSG": "it\'s: here"\n}\n');
    expect(convertEnv(entries, 'yaml')).toBe('NAME: shop\nDEBUG: "true"\nMSG: "it\'s: here"\n');
    expect(convertEnv(entries, 'shell')).toBe("export NAME='shop'\nexport DEBUG='true'\nexport MSG='it'\\''s: here'\n");
    expect(convertEnv(entries, 'secret', 'shop')).toContain('  NAME: c2hvcA==');
    expect(convertEnv(entries, 'configmap')).toContain('data:\n  NAME: "shop"\n  DEBUG: "true"');
  });

  it('turns JSON or YAML objects back into .env lines', () => {
    const data = { appName: 'Shop API', db: { host: 'db', port: 5432 }, tags: ['a', 'b'], note: null };
    expect(objectToEnv(data, true)).toBe('APP_NAME="Shop API"\nDB_HOST=db\nDB_PORT=5432\nTAGS="[\\"a\\",\\"b\\"]"\nNOTE=\n');
    expect(objectToEnv({ a: 1 }, false)).toBe('a=1\n');
    expect(() => objectToEnv([1], true)).toThrow();
    expect(envValue('line\nbreak')).toBe('"line\\nbreak"');
    expect(envKey('apiBaseURL')).toBe('API_BASE_URL');
  });
});
