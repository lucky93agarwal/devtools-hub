import { detect } from './detect';

const kinds = (text: string) => detect(text).map((d) => d.kind);
const first = (text: string) => detect(text)[0]?.suggestions[0];

describe('detect', () => {
  it('recognises the common things developers paste', () => {
    expect(kinds('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc')).toEqual(['JSON Web Token (JWT)']);
    expect(first('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc')).toMatchObject({ path: 'jwt', data: { token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc' } });
    expect(kinds('{"a": 1}')).toEqual(['JSON']);
    expect(kinds('{"a": 1')).toEqual(['Broken JSON']);
    expect(kinds("curl https://x.dev -H 'A: b'")).toEqual(['cURL command']);
    expect(kinds('https://example.com/a?b=1')).toEqual(['URL']);
    expect(kinds('1730000000')).toEqual(['Unix timestamp']);
    expect(kinds('*/5 * * * *')).toEqual(['Cron expression']);
    expect(kinds('@daily')).toEqual(['Cron expression']);
    expect(kinds('0190c3a2-7b1e-7cc1-9a2f-3d4e5f607182')).toEqual(['UUID or ULID']);
    expect(kinds('#4f46e5')).toEqual(['Colour']);
    expect(kinds('10.0.0.0/16')).toEqual(['IP address or CIDR block']);
    expect(kinds('2001:db8::/32')).toEqual(['IP address or CIDR block']);
    expect(kinds('SELECT * FROM users')).toEqual(['SQL']);
    expect(kinds('<?xml version="1.0"?><a/>')).toEqual(['XML']);
    expect(kinds('<div class="x">hi</div>')).toEqual(['HTML']);
    expect(kinds('-----BEGIN CERTIFICATE-----\nMII\n-----END CERTIFICATE-----')).toEqual(['Certificate']);
  });

  it('tells .env files, YAML, encoded text and Base64 apart', () => {
    expect(kinds('# app\nPORT=8080\nexport NAME="Shop"')).toEqual(['.env file']);
    expect(kinds('service: shop\nreplicas: 3\nports:\n  - 80')).toEqual(['YAML']);
    expect(kinds('caf%C3%A9%20bar')).toEqual(['URL-encoded text']);
    expect(kinds('aGVsbG8gd29ybGQgZnJvbSBiYXNlNjQ=')).toEqual(['Base64']);
    expect(kinds('just a sentence')).toEqual(['Text']);
    expect(kinds('   ')).toEqual([]);
  });
});
