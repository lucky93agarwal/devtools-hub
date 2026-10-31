import { routeFile } from './file-router';

const file = (name: string, body: string | Uint8Array, type = '') => new File([body as BlobPart], name, { type });

describe('routeFile', () => {
  it('opens files by their extension', async () => {
    expect(await routeFile(file('order.json', '{"a":1}'))).toEqual({ path: 'json-formatter', data: { input: '{"a":1}' } });
    expect(await routeFile(file('values/strings.xml', '<resources/>'))).toMatchObject({ path: 'localization-converter' });
    expect(await routeFile(file('.env.local', 'PORT=1'))).toMatchObject({ path: 'env-converter' });
    expect(await routeFile(file('README.md', '# Hi'))).toMatchObject({ path: 'markdown-editor' });
    expect(await routeFile(file('site.crt', '-----BEGIN CERTIFICATE-----'))).toMatchObject({ path: 'certificate-decoder' });
  });

  it('sends images and binary files to the tools that take files', async () => {
    expect(await routeFile(file('photo.png', new Uint8Array([0x89, 0x50]), 'image/png'))).toEqual({ path: 'image-converter', files: true });
    expect(await routeFile(file('app.zip', new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0xfe])))).toEqual({ path: 'hash-generator', files: true });
    expect(await routeFile(file('cert.der', new Uint8Array([0x30, 0x82, 0xff, 0xfe])))).toEqual({ path: 'certificate-decoder', data: { input: 'MIL//g==' } });
  });

  it('looks at the text when the name says nothing', async () => {
    expect(await routeFile(file('token.txt', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc'))).toMatchObject({ path: 'jwt' });
    expect(await routeFile(file('notes.txt', 'just words'))).toMatchObject({ path: 'case-converter' });
  });
});
