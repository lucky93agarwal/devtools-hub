import { CA_CERT, CSR, EC_CERT } from './samples';
import { Certificate, CertificateRequest, chainLinks, decodeInput, fingerprint, nameText, validityStatus } from './x509';

const one = (pem: string) => {
  const result = decodeInput(pem);
  if (!result.ok) throw new Error(result.error);
  return result.items[0];
};

describe('x509', () => {
  it('decodes a server certificate with SANs and key usage', async () => {
    const cert = one(EC_CERT) as Certificate;
    expect(cert.kind).toBe('certificate');
    expect(cert.version).toBe(3);
    expect(cert.serial).toBe('1A:2B:3C');
    expect(nameText(cert.subject)).toBe('C=IN, ST=Maharashtra, L=Pune, O=DevTools24 Test, CN=test.devtools24.in');
    expect(cert.signatureAlgorithm).toBe('ECDSA with SHA-256');
    expect(cert.publicKey).toEqual({ algorithm: 'Elliptic curve', size: 'P-256' });
    expect(cert.notBefore.toISOString()).toBe('2026-10-31T13:26:33.000Z');
    expect(cert.notAfter.toISOString()).toBe('2027-12-02T13:26:33.000Z');
    const ext = Object.fromEntries(cert.extensions.map((e) => [e.name, e]));
    expect(ext['Subject alternative names'].values).toEqual(['DNS: test.devtools24.in', 'DNS: *.test.devtools24.in', 'IP: 10.0.0.1']);
    expect(ext['Key usage']).toEqual({ name: 'Key usage', critical: true, values: ['Digital signature'] });
    expect(ext['Extended key usage'].values).toEqual(['TLS server', 'TLS client']);
    expect(ext['Subject key identifier'].values).toEqual(['3A:5D:EE:5A:62:B8:FF:79:A9:7C:4E:C9:E1:7F:64:53:68:EA:10:B1']);
    expect(await fingerprint(cert.der, 'SHA-256')).toBe('52:A6:99:D4:D6:20:6D:10:77:1E:AD:76:8B:C0:B3:CA:70:1F:2C:66:99:62:E6:B8:5F:40:FB:9F:A2:98:6E:91');
  });

  it('decodes an RSA CA certificate and a chain of two', async () => {
    const result = decodeInput(`${EC_CERT}\n${CA_CERT}`);
    expect(result.ok && result.items.length).toBe(2);
    expect(result.ok && chainLinks(result.items)).toEqual(['Self-signed: a root certificate, or made for testing.', 'Self-signed: a root certificate, or made for testing.']);
    const ca = one(CA_CERT) as Certificate;
    expect(ca.publicKey).toEqual({ algorithm: 'RSA', size: '2048 bits' });
    expect(ca.signatureAlgorithm).toBe('SHA-256 with RSA');
    expect(ca.extensions.find((e) => e.name === 'Basic constraints')?.values).toEqual(['Certificate authority: yes', 'Path length: 0']);
    expect(ca.extensions.find((e) => e.name === 'Key usage')?.values).toEqual(['Certificate signing', 'CRL signing']);
    expect(await fingerprint(ca.der, 'SHA-1')).toBe('B6:A5:25:8F:74:ED:D4:5D:69:E8:76:A4:79:A6:79:30:90:5C:6D:45');
  });

  it('decodes a certificate request and its requested names', () => {
    const csr = one(CSR) as CertificateRequest;
    expect(csr.kind).toBe('request');
    expect(nameText(csr.subject)).toBe('CN=api.example.com, O=Example');
    expect(csr.extensions.find((e) => e.name === 'Subject alternative names')?.values).toEqual(['DNS: api.example.com', 'DNS: www.example.com']);
  });

  it('reads plain Base64 too, and refuses private keys and junk', () => {
    const body = EC_CERT.replace(/-----[A-Z ]+-----/g, '');
    expect(one(body).kind).toBe('certificate');
    expect(decodeInput('-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----')).toMatchObject({ ok: false, error: expect.stringContaining('private key') });
    expect(decodeInput('hello there')).toMatchObject({ ok: false });
    expect(decodeInput('-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----')).toMatchObject({ ok: false });
  });

  it('says how long a certificate is valid', () => {
    const cert = one(EC_CERT) as Certificate;
    expect(validityStatus(cert, Date.UTC(2027, 0, 1))).toEqual({ state: 'valid', text: 'Valid, expires in 335 days' });
    expect(validityStatus(cert, Date.UTC(2028, 0, 1)).state).toBe('expired');
    expect(validityStatus(cert, Date.UTC(2026, 0, 1)).state).toBe('future');
  });
});
