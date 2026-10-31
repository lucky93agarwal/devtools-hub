import { describeHash, hashPassword, kindOf, verifyPassword } from './password-hash';

describe('password-hash', () => {
  it('makes and checks bcrypt hashes', async () => {
    const hash = await hashPassword('s3cret!', 'bcrypt', 4);
    expect(hash).toMatch(/^\$2a\$04\$/);
    expect(kindOf(hash)).toBe('bcrypt');
    expect(await verifyPassword('s3cret!', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('checks a $2y$ hash made by Apache htpasswd, the format PHP uses', async () => {
    const hash = '$2y$05$swz3uo9FFinxD1J1J9Kq/OgUxOgVhGGgtkr7q6r0RO/Ko7kVEn1wG';
    expect(kindOf(hash)).toBe('bcrypt');
    expect(await verifyPassword('password', hash)).toBe(true);
    expect(await verifyPassword('Password', hash)).toBe(false);
  });

  it('makes and checks Argon2id hashes', async () => {
    const hash = await hashPassword('s3cret!', 'argon2id', 0, { memory: 1024, iterations: 1, parallelism: 1 });
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=1024,t=1,p=1\$/);
    expect(await verifyPassword('s3cret!', hash)).toBe(true);
    expect(await verifyPassword('S3cret!', hash)).toBe(false);
    expect(describeHash(hash)).toBe('argon2id, version 19, memory 1 MiB, 1 passes, 1 lanes');
  });

  it('describes settings and refuses other hashes', async () => {
    expect(describeHash('$2b$12$' + 'a'.repeat(53))).toBe('bcrypt, version 2b, cost 12 (4,096 rounds)');
    expect(kindOf('5f4dcc3b5aa765d61d8327deb882cf99')).toBeNull();
    await expect(verifyPassword('x', 'abc')).rejects.toThrow();
  });
});
