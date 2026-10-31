import { ToolContent } from '../../shared/tool-info/tool-info';

export const HASH_CONTENT: ToolContent = {
  aboutHeading: 'About this hash generator',
  about:
    'A hash is a short fingerprint of data: the same input always gives the same value, and any change gives a ' +
    'completely different one. Use it to check that a download is intact, to compare files, or to sign webhook ' +
    'payloads with an HMAC. This tool computes MD5, SHA-1, SHA-224, SHA-256, SHA-384, SHA-512, SHA3-256, SHA3-512 and ' +
    'CRC32 at once, for text or for files of any size, which are read in pieces. Paste an expected checksum to see ' +
    'which algorithm matches.',
  steps: [
    'Type text, or switch to File and choose a file.',
    'Add a secret key to get HMAC values instead of plain hashes, for example to check a webhook signature.',
    'Choose hex, uppercase HEX or Base64 output.',
    'Paste a checksum from a download page to check it, or copy the value you need.',
  ],
  faq: [
    {
      question: 'Are my files or keys uploaded?',
      answer: 'No. Hashing runs in your browser with WebAssembly, so files, text and secret keys never leave your device.',
    },
    {
      question: 'Which algorithm should I use?',
      answer:
        'Use SHA-256 for checksums and signatures. MD5 and SHA-1 are broken for security and should only be used to ' +
        'match older systems. CRC32 only detects accidental damage, such as in zip files.',
    },
    {
      question: 'How do I verify a webhook signature?',
      answer:
        'Paste the raw request body as text, enter the webhook secret as the HMAC key, and compare the SHA-256 value ' +
        'with the signature header. Some services send it as hex and some as Base64; choose the matching output.',
    },
    {
      question: 'Can I hash a password here?',
      answer:
        'You can, but plain hashes are not safe for storing passwords. Servers should use a slow password hash such ' +
        'as bcrypt, scrypt or Argon2.',
    },
  ],
};
