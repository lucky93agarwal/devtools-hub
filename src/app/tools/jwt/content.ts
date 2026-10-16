/** Explanation and FAQ text shown below the JWT tool, mainly for search engines. */
import { ToolContent } from '../../shared/tool-info/tool-info';

export const JWT_CONTENT: ToolContent = {
  aboutHeading: 'About this JWT tool',
  about:
    'A JSON Web Token (JWT) carries claims, such as who a user is and when access ends, in three parts: header, ' +
    'payload and signature. Paste a token to read its header and payload, see its dates in your own time zone and ' +
    'check whether it has expired. Then check the signature with a secret or public key, or create test tokens of ' +
    'your own. Tokens and keys never leave your browser.',
  steps: [
    'Paste a token into Encoded token; a Bearer prefix and line breaks are fine.',
    'Read the header, payload and dates; the badge shows whether the token has expired.',
    'Enter the secret (HS256) or public key (RS256, PS256, ES256) to check the signature.',
    'Use Create a token to sign test tokens with a secret or a key pair made in your browser.',
  ],
  faq: [
    {
      question: 'Is my token sent to a server?',
      answer:
        'No. Decoding, signature checks and token creation all run in your browser with its built-in Web Crypto. ' +
        'Even so, avoid pasting tokens or secrets that give access to live production systems.',
    },
    {
      question: 'Does decoding a token mean it is valid?',
      answer:
        'No. Anyone can write a token that decodes. Only a successful signature check with the right secret or ' +
        'public key shows that the token is genuine and has not been changed.',
    },
    {
      question: 'Which algorithms can be checked?',
      answer:
        'HS256, HS384 and HS512 with a secret; RS256, RS384, RS512, PS256, PS384 and PS512 with an RSA public key; and ' +
        'ES256, ES384 and ES512 with an EC public key. Keys can be pasted as PEM or JWK, including a JWK set.',
    },
    {
      question: 'Why does the tool warn about my secret?',
      answer:
        'HS256 needs at least 32 bytes of random data. Short or well-known secrets can be guessed offline from any ' +
        'single token, which lets an attacker create tokens your server would accept.',
    },
    {
      question: 'What do iat, nbf and exp mean?',
      answer:
        'They are times in seconds since 1 January 1970: iat is when the token was issued, nbf is when it starts to be ' +
        'valid, and exp is when it expires. The tool shows them as dates in your time zone.',
    },
  ],
};
