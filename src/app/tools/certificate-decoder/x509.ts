/** A small DER (ASN.1) reader and X.509 certificate and CSR decoder. Only reads; never verifies signatures. */

export interface Node {
  /** Tag class: 0 universal, 1 application, 2 context-specific, 3 private. */
  cls: number;
  tag: number;
  constructed: boolean;
  /** The value bytes, without tag and length. */
  value: Uint8Array;
  /** The whole element, with tag and length. */
  raw: Uint8Array;
  children: Node[];
}

export function parseDer(bytes: Uint8Array, start = 0, end = bytes.length): Node[] {
  const nodes: Node[] = [];
  let i = start;
  while (i < end) {
    const begin = i;
    const first = bytes[i++];
    let tag = first & 0x1f;
    if (tag === 0x1f) {
      tag = 0;
      while (bytes[i] & 0x80) tag = (tag << 7) | (bytes[i++] & 0x7f);
      tag = (tag << 7) | bytes[i++];
    }
    let length = bytes[i++];
    if (length & 0x80) {
      const count = length & 0x7f;
      if (count === 0 || count > 4) throw new Error('This is not valid DER: unsupported length.');
      length = 0;
      for (let k = 0; k < count; k++) length = length * 256 + bytes[i++];
    }
    if (i + length > end) throw new Error('This is not valid DER: the data is cut short.');
    const constructed = (first & 0x20) !== 0;
    const value = bytes.subarray(i, i + length);
    nodes.push({
      cls: first >> 6,
      tag,
      constructed,
      value,
      raw: bytes.subarray(begin, i + length),
      children: constructed ? parseDer(bytes, i, i + length) : [],
    });
    i += length;
  }
  return nodes;
}

export function oid(value: Uint8Array): string {
  const parts = [Math.floor(value[0] / 40), value[0] % 40];
  let n = 0;
  for (let i = 1; i < value.length; i++) {
    n = n * 128 + (value[i] & 0x7f);
    if (!(value[i] & 0x80)) {
      parts.push(n);
      n = 0;
    }
  }
  return parts.join('.');
}

export const hexOf = (bytes: Uint8Array, separator = ':') => [...bytes].map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(separator);

const text = (node: Node) => {
  // BMPString (30) is UTF-16; the rest are ASCII or UTF-8.
  if (node.tag === 30) return String.fromCharCode(...Array.from({ length: node.value.length / 2 }, (_, i) => (node.value[i * 2] << 8) | node.value[i * 2 + 1]));
  return new TextDecoder().decode(node.value);
};

function time(node: Node): Date {
  const s = text(node);
  const m = node.tag === 23 ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/.exec(s) : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\.\d+)?Z$/.exec(s);
  if (!m) throw new Error(`Unreadable date: ${s}`);
  let year = Number(m[1]);
  if (node.tag === 23) year += year < 50 ? 2000 : 1900;
  return new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)));
}

const NAMES: Record<string, string> = {
  '2.5.4.3': 'CN',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.8': 'ST',
  '2.5.4.9': 'street',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
  '2.5.4.5': 'serialNumber',
  '2.5.4.15': 'businessCategory',
  '1.2.840.113549.1.9.1': 'emailAddress',
  '0.9.2342.19200300.100.1.25': 'DC',
  '1.3.6.1.4.1.311.60.2.1.3': 'jurisdictionC',
};

export interface NamePart {
  key: string;
  value: string;
}

function name(node: Node): NamePart[] {
  return node.children.flatMap((set) => set.children.map((pair) => ({ key: NAMES[oid(pair.children[0].value)] ?? oid(pair.children[0].value), value: text(pair.children[1]) })));
}

export const nameText = (parts: NamePart[]) => parts.map((p) => `${p.key}=${p.value}`).join(', ');

const ALGORITHMS: Record<string, string> = {
  '1.2.840.113549.1.1.1': 'RSA',
  '1.2.840.113549.1.1.5': 'SHA-1 with RSA',
  '1.2.840.113549.1.1.11': 'SHA-256 with RSA',
  '1.2.840.113549.1.1.12': 'SHA-384 with RSA',
  '1.2.840.113549.1.1.13': 'SHA-512 with RSA',
  '1.2.840.113549.1.1.10': 'RSA-PSS',
  '1.2.840.10045.2.1': 'Elliptic curve',
  '1.2.840.10045.4.3.2': 'ECDSA with SHA-256',
  '1.2.840.10045.4.3.3': 'ECDSA with SHA-384',
  '1.2.840.10045.4.3.4': 'ECDSA with SHA-512',
  '1.3.101.112': 'Ed25519',
  '1.3.101.113': 'Ed448',
};
const CURVES: Record<string, string> = {
  '1.2.840.10045.3.1.7': 'P-256',
  '1.3.132.0.34': 'P-384',
  '1.3.132.0.35': 'P-521',
  '1.3.132.0.10': 'secp256k1',
};
const KEY_USAGE = ['Digital signature', 'Non-repudiation', 'Key encipherment', 'Data encipherment', 'Key agreement', 'Certificate signing', 'CRL signing', 'Encipher only', 'Decipher only'];
const EXT_KEY_USAGE: Record<string, string> = {
  '1.3.6.1.5.5.7.3.1': 'TLS server',
  '1.3.6.1.5.5.7.3.2': 'TLS client',
  '1.3.6.1.5.5.7.3.3': 'Code signing',
  '1.3.6.1.5.5.7.3.4': 'Email protection',
  '1.3.6.1.5.5.7.3.8': 'Time stamping',
  '1.3.6.1.5.5.7.3.9': 'OCSP signing',
  '2.5.29.37.0': 'Any',
};

const POLICIES: Record<string, string> = {
  '2.23.140.1.2.1': 'Domain validated (DV)',
  '2.23.140.1.2.2': 'Organisation validated (OV)',
  '2.23.140.1.2.3': 'Individual validated (IV)',
  '2.23.140.1.1': 'Extended validation (EV)',
  '2.5.29.32.0': 'Any policy',
};

export interface PublicKey {
  algorithm: string;
  /** "2048 bits" for RSA, the curve for EC. */
  size: string;
}

function publicKey(spki: Node): PublicKey {
  const [alg, bits] = spki.children;
  const algOid = oid(alg.children[0].value);
  const algorithm = ALGORITHMS[algOid] ?? algOid;
  if (algorithm === 'RSA') {
    const [modulus] = parseDer(bits.value.subarray(1))[0].children;
    const m = modulus.value[0] === 0 ? modulus.value.subarray(1) : modulus.value;
    return { algorithm, size: `${m.length * 8} bits` };
  }
  if (algorithm === 'Elliptic curve') {
    const curve = alg.children[1] ? oid(alg.children[1].value) : '';
    return { algorithm, size: CURVES[curve] ?? curve };
  }
  return { algorithm, size: algorithm === 'Ed25519' ? '256 bits' : '' };
}

export interface Extension {
  name: string;
  critical: boolean;
  values: string[];
}

function generalNames(node: Node): string[] {
  return node.children.map((n) => {
    if (n.tag === 2) return `DNS: ${text(n)}`;
    if (n.tag === 1) return `Email: ${text(n)}`;
    if (n.tag === 6) return `URI: ${text(n)}`;
    if (n.tag === 7) {
      if (n.value.length === 4) return `IP: ${[...n.value].join('.')}`;
      return `IP: ${Array.from({ length: 8 }, (_, i) => ((n.value[i * 2] << 8) | n.value[i * 2 + 1]).toString(16)).join(':')}`;
    }
    if (n.tag === 4) return `Directory: ${nameText(name(n.children[0]))}`;
    return `Other name`;
  });
}

function extension(node: Node): Extension {
  const id = oid(node.children[0].value);
  const critical = node.children.length === 3 && node.children[1].value[0] !== 0;
  const body = parseDer(node.children.at(-1)!.value)[0];
  switch (id) {
    case '2.5.29.17':
      return { name: 'Subject alternative names', critical, values: generalNames(body) };
    case '2.5.29.15': {
      const unused = body.value[0];
      const bits = [...body.value.subarray(1)].map((b) => b.toString(2).padStart(8, '0')).join('').slice(0, (body.value.length - 1) * 8 - unused);
      return { name: 'Key usage', critical, values: [...bits].flatMap((b, i) => (b === '1' && KEY_USAGE[i] ? [KEY_USAGE[i]] : [])) };
    }
    case '2.5.29.37':
      return { name: 'Extended key usage', critical, values: body.children.map((c) => EXT_KEY_USAGE[oid(c.value)] ?? oid(c.value)) };
    case '2.5.29.19': {
      const isCa = body.children[0]?.tag === 1 && body.children[0].value[0] !== 0;
      const path = body.children.find((c) => c.tag === 2);
      return { name: 'Basic constraints', critical, values: [isCa ? 'Certificate authority: yes' : 'Certificate authority: no', ...(path ? [`Path length: ${path.value[0]}`] : [])] };
    }
    case '2.5.29.14':
      return { name: 'Subject key identifier', critical, values: [hexOf(body.value)] };
    case '2.5.29.35':
      return { name: 'Authority key identifier', critical, values: body.children.filter((c) => c.tag === 0).map((c) => hexOf(c.value)) };
    case '1.3.6.1.5.5.7.1.1':
      return {
        name: 'Authority information access',
        critical,
        values: body.children.map((d) => `${oid(d.children[0].value) === '1.3.6.1.5.5.7.48.1' ? 'OCSP' : 'CA issuers'}: ${generalNames({ ...d, children: [d.children[1]] })[0].replace(/^URI: /, '')}`),
      };
    case '2.5.29.31':
      return { name: 'CRL distribution points', critical, values: body.children.flatMap((p) => p.children[0]?.children[0] ? generalNames(p.children[0].children[0]).map((v) => v.replace(/^URI: /, '')) : []) };
    case '2.5.29.32':
      return { name: 'Certificate policies', critical, values: body.children.map((p) => POLICIES[oid(p.children[0].value)] ?? oid(p.children[0].value)) };
    case '1.3.6.1.4.1.11129.2.4.2':
      return { name: 'Certificate Transparency timestamps', critical, values: ['Present'] };
    default:
      return { name: id, critical, values: [hexOf(body.raw).slice(0, 96) + (body.raw.length > 32 ? '…' : '')] };
  }
}

export interface Certificate {
  kind: 'certificate';
  version: number;
  serial: string;
  signatureAlgorithm: string;
  issuer: NamePart[];
  subject: NamePart[];
  notBefore: Date;
  notAfter: Date;
  publicKey: PublicKey;
  extensions: Extension[];
  der: Uint8Array;
}

export interface CertificateRequest {
  kind: 'request';
  subject: NamePart[];
  publicKey: PublicKey;
  signatureAlgorithm: string;
  extensions: Extension[];
  der: Uint8Array;
}

export type Decoded = Certificate | CertificateRequest;

export function decodeCertificate(der: Uint8Array): Certificate {
  const [cert] = parseDer(der);
  const [tbs, sigAlg] = cert.children;
  const fields = tbs.children;
  let i = 0;
  const version = fields[0].cls === 2 && fields[0].tag === 0 ? parseDer(fields[i++].value)[0].value[0] + 1 : 1;
  const serial = fields[i++];
  i++; // signature algorithm, repeated inside the signed part
  const issuer = fields[i++];
  const validity = fields[i++];
  const subject = fields[i++];
  const spki = fields[i++];
  const extensionsNode = fields.slice(i).find((f) => f.cls === 2 && f.tag === 3);
  const serialBytes = serial.value[0] === 0 && serial.value.length > 1 ? serial.value.subarray(1) : serial.value;
  return {
    kind: 'certificate',
    version,
    serial: hexOf(serialBytes),
    signatureAlgorithm: ALGORITHMS[oid(sigAlg.children[0].value)] ?? oid(sigAlg.children[0].value),
    issuer: name(issuer),
    subject: name(subject),
    notBefore: time(validity.children[0]),
    notAfter: time(validity.children[1]),
    publicKey: publicKey(spki),
    extensions: extensionsNode ? extensionsNode.children[0].children.map(extension) : [],
    der,
  };
}

export function decodeRequest(der: Uint8Array): CertificateRequest {
  const [csr] = parseDer(der);
  const [info, sigAlg] = csr.children;
  const [, subject, spki, attributes] = info.children;
  // Requested extensions sit in the extensionRequest attribute (PKCS #9).
  const extensionRequest = attributes?.children.find((a) => oid(a.children[0].value) === '1.2.840.113549.1.9.14');
  return {
    kind: 'request',
    subject: name(subject),
    publicKey: publicKey(spki),
    signatureAlgorithm: ALGORITHMS[oid(sigAlg.children[0].value)] ?? oid(sigAlg.children[0].value),
    extensions: extensionRequest ? extensionRequest.children[1].children[0].children.map(extension) : [],
    der,
  };
}

export type DecodeResult = { ok: true; items: Decoded[] } | { ok: false; error: string };

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.replace(/\s+/g, ''));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Reads PEM text with one or more certificates or requests, plain Base64, or DER bytes. */
export function decodeInput(input: string | Uint8Array): DecodeResult {
  try {
    if (input instanceof Uint8Array) return { ok: true, items: [guess(input)] };
    const pems = [...input.matchAll(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g)];
    if (pems.length) {
      const items: Decoded[] = [];
      for (const [, label, body] of pems) {
        if (/PRIVATE KEY/.test(label)) {
          return { ok: false, error: 'This is a private key. Never paste private keys into websites; this tool only needs the certificate.' };
        }
        const der = base64ToBytes(body);
        if (/REQUEST/.test(label)) items.push(decodeRequest(der));
        else if (label === 'CERTIFICATE' || label === 'TRUSTED CERTIFICATE' || label === 'X509 CERTIFICATE') items.push(decodeCertificate(der));
      }
      return items.length ? { ok: true, items } : { ok: false, error: 'No certificate or certificate request was found in this PEM.' };
    }
    const trimmed = input.trim();
    if (!trimmed) return { ok: false, error: '' };
    if (!/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) return { ok: false, error: 'Paste a certificate starting with -----BEGIN CERTIFICATE-----, or upload a .crt, .cer, .pem or .der file.' };
    return { ok: true, items: [guess(base64ToBytes(trimmed))] };
  } catch (error) {
    return { ok: false, error: `This could not be read as a certificate. ${(error as Error).message}` };
  }
}

/** A certificate's first element has the signed part with a validity; a request has a version 0 integer first. */
function guess(der: Uint8Array): Decoded {
  const [root] = parseDer(der);
  const first = root.children[0]?.children[0];
  return first?.tag === 2 && first.value.length === 1 && first.value[0] === 0 && root.children[0].children.length <= 4
    ? decodeRequest(der)
    : decodeCertificate(der);
}

export async function fingerprint(der: Uint8Array, algorithm: 'SHA-1' | 'SHA-256'): Promise<string> {
  return hexOf(new Uint8Array(await crypto.subtle.digest(algorithm, der as BufferSource)));
}

/** "Valid for 397 more days", "Expired 3 days ago" or "Not valid until …". */
export function validityStatus(cert: Certificate, now: number): { state: 'valid' | 'expired' | 'future'; text: string } {
  const day = 86400000;
  if (now < cert.notBefore.getTime()) return { state: 'future', text: `Not valid yet: starts in ${Math.ceil((cert.notBefore.getTime() - now) / day)} days` };
  if (now > cert.notAfter.getTime()) return { state: 'expired', text: `Expired ${Math.floor((now - cert.notAfter.getTime()) / day)} days ago` };
  return { state: 'valid', text: `Valid, expires in ${Math.floor((cert.notAfter.getTime() - now) / day)} days` };
}

/**
 * How each certificate relates to the next one in a pasted chain: issued by it (key identifiers or names match),
 * self-signed, or not linked. Certificate requests are skipped.
 */
export function chainLinks(items: Decoded[]): string[] {
  const keyId = (c: Certificate, name: string) => c.extensions.find((e) => e.name === name)?.values[0];
  return items.map((item, i) => {
    if (item.kind !== 'certificate') return '';
    if (nameText(item.subject) === nameText(item.issuer)) return 'Self-signed: a root certificate, or made for testing.';
    const next = items[i + 1];
    if (!next || next.kind !== 'certificate') return `Issued by ${nameText(item.issuer)}.`;
    const linked =
      (keyId(item, 'Authority key identifier') && keyId(item, 'Authority key identifier') === keyId(next, 'Subject key identifier')) ||
      nameText(item.issuer) === nameText(next.subject);
    return linked ? 'Issued by the next certificate in the chain.' : 'Not issued by the next certificate: the chain order may be wrong.';
  });
}
