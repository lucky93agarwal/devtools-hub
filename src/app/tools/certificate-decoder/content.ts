import { ToolContent } from '../../shared/tool-info/tool-info';

export const CERT_CONTENT: ToolContent = {
  aboutHeading: 'About this SSL certificate decoder',
  about:
    'Paste a certificate in PEM format, a whole chain, or a certificate signing request (CSR) to read what is inside: ' +
    'the subject and issuer, the dates it is valid between, the domain names it covers (subject alternative names), ' +
    'key type and size, key usage, the CA and OCSP addresses and its SHA-256 and SHA-1 fingerprints. It tells you ' +
    'how many days remain before it expires and whether each certificate in a chain was issued by the next one. ' +
    'DER files (.der, .cer) can be opened too.',
  steps: [
    'Paste the certificate text starting with -----BEGIN CERTIFICATE-----, or open a .pem, .crt, .cer, .der or .csr file.',
    'Check the expiry, the domain names under Subject alternative names and the issuer.',
    'For a chain, check that each certificate says it was issued by the next one.',
    'Copy the fingerprint or names you need, for example for certificate pinning.',
  ],
  faq: [
    {
      question: 'Is it safe to paste a certificate here?',
      answer:
        'Yes. Certificates are public: every browser receives them. They are decoded in your browser and not sent ' +
        'anywhere. Never paste the private key; the tool refuses keys if you do.',
    },
    {
      question: 'Why does my site show a certificate error when this one is valid?',
      answer:
        'Common causes are a missing intermediate certificate in the chain, a domain name that is not in the ' +
        'subject alternative names, or a device whose clock is wrong. Paste the full chain your server sends to check.',
    },
    {
      question: 'Does this check the signature or revocation?',
      answer:
        'No. It reads the certificate but does not verify signatures against trusted roots or ask the CA whether ' +
        'it was revoked. Use your browser or openssl verify for that.',
    },
    {
      question: 'What is a CSR?',
      answer:
        'A certificate signing request: what you send to a certificate authority to get a certificate. Decoding it ' +
        'before sending lets you check the domain names and key size.',
    },
  ],
};
