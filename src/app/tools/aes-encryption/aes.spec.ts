import { decrypt, encrypt } from './aes';

describe('aes', () => {
  it('encrypts and decrypts with AES-256-GCM and refuses a wrong password', async () => {
    const cipher = await encrypt('Secret ✓ नमस्ते', 'pa55', 'gcm');
    expect(await decrypt(cipher, 'pa55', 'gcm')).toEqual({ ok: true, text: 'Secret ✓ नमस्ते' });
    expect(await decrypt(cipher, 'wrong', 'gcm')).toMatchObject({ ok: false });
    expect(await encrypt('same', 'pa55', 'gcm')).not.toBe(await encrypt('same', 'pa55', 'gcm'));
  });

  it('decrypts text made by the openssl command and makes text openssl can read', async () => {
    // printf 'Hello from OpenSSL ✓' | openssl enc -aes-256-cbc -pbkdf2 -iter 10000 -md sha256 -salt -base64 -A -pass pass:s3cret
    const fromOpenssl = 'U2FsdGVkX1/N9HyJ/j2dgPZZyRtsonetfdG1x7ZuakLC8Of+oZuFE+geNdCTQ2km';
    expect(await decrypt(fromOpenssl, 's3cret', 'openssl')).toEqual({ ok: true, text: 'Hello from OpenSSL ✓' });
    const mine = await encrypt('round trip', 's3cret', 'openssl');
    expect(mine.startsWith('U2FsdGVkX1')).toBe(true);
    expect(await decrypt(mine, 's3cret', 'openssl')).toEqual({ ok: true, text: 'round trip' });
    expect(await decrypt(mine, 'nope', 'openssl')).toMatchObject({ ok: false });
    expect(await decrypt('not base64 !!', 'x', 'gcm')).toMatchObject({ ok: false });
  });
});
