import { Article } from './article';

export const API_ARTICLES: Record<string, Article> = {
  'what-is-a-jwt': {
    intro:
      'A JSON Web Token (JWT, pronounced "jot") is a compact way to pass signed claims between two parties, most often to prove who a user is when they call an API. You have probably seen one: a long string of letters in three parts separated by dots. This guide explains what is inside, what the signature guarantees, and the mistakes that turn JWTs into a security problem.',
    body: [
      { h: 'The three parts' },
      { p: 'A JWT looks like `xxxxx.yyyyy.zzzzz`. Each part is Base64URL-encoded:' },
      {
        ol: [
          'Header: a small JSON object naming the signing algorithm and token type, for example `{"alg":"HS256","typ":"JWT"}`.',
          'Payload: a JSON object with the claims, the statements the token makes, such as who the user is and when the token expires.',
          'Signature: computed over the first two parts with a secret or private key, so that any change to them can be detected.',
        ],
      },
      {
        p: 'Base64URL is an encoding, not encryption. Anyone who has the token can decode the header and payload and read them. Never put passwords, card numbers or other secrets in a JWT payload.',
      },
      { h: 'Standard claims' },
      { p: 'RFC 7519 defines a few registered claim names. None are required, but most systems use them:' },
      {
        table: {
          head: ['Claim', 'Meaning'],
          rows: [
            ['iss', 'Issuer: who created the token, often the URL of the auth server'],
            ['sub', 'Subject: who the token is about, usually a user ID'],
            ['aud', 'Audience: which service the token is meant for'],
            ['exp', 'Expiration time, in seconds since 1 January 1970 (UTC)'],
            ['nbf', 'Not before: the token is not valid until this time'],
            ['iat', 'Issued at: when the token was created'],
            ['jti', 'JWT ID: a unique ID, useful for revoking a single token'],
          ],
        },
      },
      {
        p: 'Times are Unix timestamps in seconds, not milliseconds. A common bug is writing `Date.now()` (milliseconds) into `exp`, which creates a token that expires in tens of thousands of years.',
      },
      { h: 'Decoding is not verifying' },
      {
        p: 'Decoding a JWT only reads it. It tells you what the token claims, not whether the claims are true. Verification checks the signature with the right key and then checks the claims. A server must verify every token it receives; reading `sub` from an unverified token lets anyone become any user by editing the payload.',
      },
      { p: 'Proper verification does all of the following:' },
      {
        ol: [
          'Check the signature with the expected key and the expected algorithm. Do not let the token\'s own `alg` header decide.',
          'Reject the token if `exp` is in the past or `nbf` is in the future, allowing a small clock skew of a minute or so.',
          'Check `iss` and `aud`, so a token issued for another service, or by another issuer, is not accepted.',
          'Only then trust the other claims.',
        ],
      },
      { h: 'Known pitfalls' },
      {
        ul: [
          'The "none" algorithm: early libraries accepted tokens with `"alg":"none"` and no signature. Always pin the list of accepted algorithms.',
          'Algorithm confusion: if a server verifying RS256 tokens also accepts HS256, an attacker can sign a token with the public key used as an HMAC secret. Again, fix the algorithm on the server.',
          'Weak HMAC secrets: HS256 secrets can be brute-forced offline from any token. Use at least 256 random bits, not a word or a short phrase.',
          'Long lifetimes: a JWT cannot easily be revoked before it expires. Keep access tokens short-lived (minutes) and use refresh tokens to get new ones.',
          'Storing tokens in localStorage exposes them to any XSS bug. HttpOnly cookies avoid that, at the cost of needing CSRF protection.',
        ],
      },
      { h: 'Signed versus encrypted tokens' },
      {
        p: 'The tokens described here are signed, formally JWS. There is also an encrypted form, JWE, with five parts instead of three, whose payload cannot be read without the decryption key. Most login and API tokens are JWS.',
      },
      { h: 'When to use JWTs' },
      {
        p: 'JWTs fit well when a service needs to check a request without calling the auth server every time, for example between microservices or for short-lived API access tokens. For a single web application with server-side sessions, a classic session cookie is often simpler and easier to revoke.',
      },
      {
        note: 'The JWT Decoder on this site shows the header, payload and times in plain words, verifies HMAC, RSA and ECDSA signatures with your key, and can create test tokens. Tokens and keys never leave your browser.',
      },
    ],
  },

  'jwt-signing-algorithms': {
    intro:
      'The `alg` field in a JWT header decides how its signature is made and, more importantly, who can create valid tokens. HS256, RS256 and ES256 are the ones you will meet most. They are not interchangeable: the choice affects how keys are shared, how tokens are verified across services and how much damage a leaked key can do.',
    body: [
      { h: 'Two families: shared secret and key pair' },
      {
        p: 'HMAC algorithms (HS256, HS384, HS512) use one shared secret both to sign and to verify. Anyone who can verify a token can also create one. RSA (RS256, PS256) and elliptic-curve (ES256, ES384) algorithms use a key pair: the private key signs, the public key verifies. Services that only need to check tokens get the public key and can never forge one.',
      },
      { h: 'HS256: HMAC with SHA-256' },
      {
        ul: [
          'How it works: the signature is an HMAC-SHA256 of `header.payload` with the secret.',
          'Pros: very fast, tiny signatures, simple to set up.',
          'Cons: every verifier holds the secret, so every verifier can mint tokens. A leak anywhere compromises everything.',
          'Use it when the same service issues and verifies the tokens, for example a single backend.',
          'Secret strength: at least 32 random bytes. Short human-chosen secrets can be guessed offline from one captured token.',
        ],
      },
      { h: 'RS256: RSA signature with SHA-256' },
      {
        ul: [
          'How it works: RSASSA-PKCS1-v1_5 signature with SHA-256, using a 2048-bit or larger RSA key.',
          'Pros: verifiers only need the public key; the most widely supported asymmetric option. Identity providers such as Auth0, Okta, Azure AD and Google use it by default.',
          'Cons: larger signatures (256 bytes for a 2048-bit key) and slower signing than HMAC or ECDSA.',
          'PS256 is the same idea with the more modern RSA-PSS padding. Prefer it when both sides support it.',
        ],
      },
      { h: 'ES256: ECDSA on the P-256 curve' },
      {
        ul: [
          'How it works: ECDSA with the NIST P-256 curve and SHA-256.',
          'Pros: security comparable to 3072-bit RSA with a 64-byte signature and fast signing; good for tokens sent on every request.',
          'Cons: needs a good random number for each signature (handled by any decent library); slightly less universal support than RS256 in very old stacks.',
        ],
      },
      { h: 'EdDSA' },
      {
        p: 'EdDSA with Ed25519 is fast, has small keys and avoids some ECDSA pitfalls. Support in JWT libraries is growing but still not universal, so check every system that needs to verify the tokens before adopting it.',
      },
      { h: 'Comparison' },
      {
        table: {
          head: ['', 'HS256', 'RS256', 'ES256'],
          rows: [
            ['Key type', 'Shared secret', 'RSA key pair', 'EC key pair (P-256)'],
            ['Who can create tokens', 'Every holder of the secret', 'Only the private key holder', 'Only the private key holder'],
            ['Signature size', '32 bytes', '256 bytes (2048-bit key)', '64 bytes'],
            ['Speed', 'Fastest', 'Slow signing, fast verify', 'Fast'],
            ['Typical use', 'Single service', 'Identity providers, wide compatibility', 'Modern APIs, mobile, IoT'],
          ],
        },
      },
      { h: 'Sharing public keys with JWKS' },
      {
        p: 'With RSA or EC keys, the issuer usually publishes its public keys as a JSON Web Key Set at a well-known URL, for example `/.well-known/jwks.json`. Each key has a `kid` (key ID). The token header carries the `kid` of the key that signed it, so verifiers can pick the right public key and fetch new ones when keys rotate.',
      },
      { h: 'Rotating keys' },
      {
        ol: [
          'Generate a new key pair and publish its public key in the JWKS next to the old one.',
          'Wait until verifiers have refreshed their cached key set.',
          'Start signing new tokens with the new key and its `kid`.',
          'After the longest token lifetime has passed, remove the old public key.',
        ],
      },
      { h: 'Verifying safely' },
      {
        p: 'Whatever you choose, configure the verifier with the algorithm it expects instead of trusting the `alg` in the token. Accepting any algorithm the token names is the root of the "none" and algorithm-confusion attacks.',
      },
      { h: 'Which one should you use?' },
      {
        ul: [
          'One service signs and verifies its own tokens: HS256 with a strong random secret is fine.',
          'Several services verify tokens from one issuer, or third parties verify them: use an asymmetric algorithm. ES256 for new systems, RS256 when compatibility matters most.',
          'You use an identity provider: use what it issues, usually RS256, and verify against its JWKS.',
        ],
      },
      {
        note: 'The JWT tool on this site can create tokens with HS256, RS256, PS256 and ES256 for testing and verify them with a secret or a PEM public key, all inside your browser.',
      },
    ],
  },

  'cors-errors-explained': {
    intro:
      'Few error messages confuse web developers as much as "blocked by CORS policy". The request works in Postman and with curl, yet the browser refuses it. The reason is that CORS is a browser safety rule, not a server error, and it is fixed on the server that receives the request. This guide explains what CORS protects, how preflight requests work and how to fix the common cases.',
    body: [
      { h: 'The same-origin policy' },
      {
        p: 'An origin is the combination of scheme, host and port: `https://app.example.com:443`. Browsers let a page read responses only from its own origin by default. Without that rule, any website you visit could use your logged-in cookies to read your email or bank pages in the background.',
      },
      {
        p: 'Cross-Origin Resource Sharing (CORS) is the way a server says "other origins may read my responses". It is an opt-in by the server, sent in response headers. Postman, curl and server-to-server calls ignore CORS entirely because they are not browsers holding your cookies for other sites.',
      },
      { h: 'Simple requests' },
      {
        p: 'For simple requests (GET, HEAD or POST with a content type of `text/plain`, `application/x-www-form-urlencoded` or `multipart/form-data`, and no custom headers) the browser sends the request straight away with an `Origin` header. If the response includes a matching `Access-Control-Allow-Origin`, the page can read it; otherwise the browser hides the response and reports a CORS error.',
      },
      { code: 'Origin: https://app.example.com\n\nAccess-Control-Allow-Origin: https://app.example.com' },
      { h: 'Preflight requests' },
      {
        p: 'Anything else, such as a PUT or DELETE, a JSON body (`Content-Type: application/json`) or an `Authorization` header, triggers a preflight: the browser first sends an `OPTIONS` request asking for permission.',
      },
      {
        code: 'OPTIONS /orders HTTP/1.1\nOrigin: https://app.example.com\nAccess-Control-Request-Method: PUT\nAccess-Control-Request-Headers: authorization, content-type',
      },
      { p: 'The server must answer with a 2xx status and headers that allow the method and headers:' },
      {
        code: 'HTTP/1.1 204 No Content\nAccess-Control-Allow-Origin: https://app.example.com\nAccess-Control-Allow-Methods: GET, POST, PUT, DELETE\nAccess-Control-Allow-Headers: authorization, content-type\nAccess-Control-Max-Age: 600',
      },
      {
        p: 'Only if the preflight passes does the browser send the real request. Many CORS bugs are really preflight bugs: the server handles PUT but returns 404 or 401 for OPTIONS, because routing or authentication runs before the CORS middleware.',
      },
      { h: 'Credentials' },
      {
        p: 'If the request sends cookies or HTTP authentication (`credentials: "include"` in fetch), the server must also send `Access-Control-Allow-Credentials: true`, and `Access-Control-Allow-Origin` must name the exact origin. The wildcard `*` is not allowed together with credentials.',
      },
      { h: 'Reading the error message' },
      {
        table: {
          head: ['Browser message (shortened)', 'What to fix on the server'],
          rows: [
            ["No 'Access-Control-Allow-Origin' header is present", 'Add the header for this origin (on error responses too)'],
            ['Response to preflight request doesn\'t pass access control check', 'Answer OPTIONS with 2xx and the Allow headers, before auth'],
            ['Request header field authorization is not allowed', 'Add it to Access-Control-Allow-Headers'],
            ["The value of the 'Access-Control-Allow-Origin' header must not be the wildcard '*'", 'Echo the exact origin when using credentials'],
            ['Method PUT is not allowed', 'Add it to Access-Control-Allow-Methods'],
          ],
        },
      },
      { h: 'Fixing it properly' },
      {
        ul: [
          'Configure CORS in the server or framework that serves the API: Express `cors` middleware, Spring `@CrossOrigin` or `CorsConfiguration`, ASP.NET `AddCors`, Django `django-cors-headers`, or the API gateway in front of the service.',
          'Allow specific origins from a list instead of `*` when the API uses cookies or tokens.',
          'Make sure CORS headers are also present on error responses (4xx, 5xx). Otherwise every error shows up as a CORS error and hides the real problem.',
          'Expose response headers the page needs to read, such as `X-Total-Count`, with `Access-Control-Expose-Headers`.',
          'In development, a proxy in your dev server (for example Angular or Vite proxy configuration) makes API calls same-origin and avoids CORS altogether.',
        ],
      },
      { h: 'What not to do' },
      {
        ul: [
          'Do not install browser extensions that disable CORS; they only hide the problem on your machine.',
          'Do not route production traffic through a public CORS proxy. It sees every token and response that passes through it.',
          'Do not reflect any `Origin` back together with `Allow-Credentials: true`. That lets every website read your users\' data.',
        ],
      },
      { h: 'Mixed content and private networks' },
      {
        p: 'Two other browser rules look like CORS errors. A page served over HTTPS cannot call an `http://` API (mixed content); use HTTPS for the API. And recent versions of Chrome ask for permission before a public website can reach `localhost` or private network addresses.',
      },
      {
        note: 'The API Client on this site sends requests straight from your browser, so it is subject to CORS. When a request is blocked it explains the likely cause and offers the same request as a cURL command to run in a terminal.',
      },
    ],
  },

  'http-methods-and-status-codes': {
    intro:
      'Every HTTP request carries a method that says what the client wants to do, and every response carries a status code that says how it went. Using them correctly makes an API predictable: clients know what is safe to retry, caches know what they may store, and error handling becomes straightforward. This is a practical tour of the methods and codes you use every day.',
    body: [
      { h: 'Methods' },
      {
        table: {
          head: ['Method', 'Purpose', 'Safe', 'Idempotent', 'Has a body'],
          rows: [
            ['GET', 'Read a resource', 'Yes', 'Yes', 'No'],
            ['HEAD', 'Like GET, headers only', 'Yes', 'Yes', 'No'],
            ['OPTIONS', 'Ask what is allowed (CORS preflight)', 'Yes', 'Yes', 'Rarely'],
            ['POST', 'Create, or run an action', 'No', 'No', 'Yes'],
            ['PUT', 'Replace a resource completely', 'No', 'Yes', 'Yes'],
            ['PATCH', 'Change part of a resource', 'No', 'Not necessarily', 'Yes'],
            ['DELETE', 'Remove a resource', 'No', 'Yes', 'Usually not'],
          ],
        },
      },
      {
        p: 'Safe means the request does not change anything on the server, so browsers, crawlers and caches may send it freely. Idempotent means sending it once or ten times leaves the server in the same state. That is what makes PUT and DELETE safe to retry after a timeout, while a retried POST might create two orders.',
      },
      { h: 'PUT versus PATCH' },
      {
        p: 'PUT sends the whole resource; fields you leave out are expected to be cleared or reset. PATCH sends only the changes. With JSON Merge Patch (RFC 7386) you send an object with the fields to change; with JSON Patch (RFC 6902) you send a list of operations such as `{"op":"replace","path":"/name","value":"Ada"}`.',
      },
      { h: 'Making POST safe to retry' },
      {
        p: 'Payment and order APIs often accept an `Idempotency-Key` header with a random value chosen by the client. If the same key arrives twice, the server returns the first result instead of acting again. This turns an unsafe POST into something clients can retry after a network error.',
      },
      { h: 'Status code classes' },
      {
        ul: [
          '1xx informational: rare in day-to-day API work (`101 Switching Protocols` appears when a WebSocket opens).',
          '2xx success: the request worked.',
          '3xx redirection: the client should look elsewhere.',
          '4xx client error: the request was wrong; sending it again unchanged will not help.',
          '5xx server error: the server failed; a retry later may succeed.',
        ],
      },
      { h: 'Success codes' },
      {
        table: {
          head: ['Code', 'Use it when'],
          rows: [
            ['200 OK', 'A request succeeded and the response has a body'],
            ['201 Created', 'A POST created something; add a Location header with its URL'],
            ['202 Accepted', 'The work was queued and will finish later'],
            ['204 No Content', 'Success with no body, typical for DELETE or a PUT that returns nothing'],
            ['206 Partial Content', 'A Range request returned part of a file'],
          ],
        },
      },
      { h: 'Redirects' },
      {
        table: {
          head: ['Code', 'Meaning'],
          rows: [
            ['301 Moved Permanently', 'Use the new URL from now on (clients may switch POST to GET)'],
            ['302 Found', 'Temporary redirect (same caveat about POST)'],
            ['304 Not Modified', 'Your cached copy is still current (response to If-None-Match or If-Modified-Since)'],
            ['307 Temporary Redirect', 'Temporary, and the method and body must be kept'],
            ['308 Permanent Redirect', 'Permanent, and the method and body must be kept'],
          ],
        },
      },
      { h: 'Client errors' },
      {
        table: {
          head: ['Code', 'Meaning'],
          rows: [
            ['400 Bad Request', 'The request is malformed: invalid JSON, wrong types, missing fields'],
            ['401 Unauthorized', 'Not authenticated: no credentials, or they are invalid or expired'],
            ['403 Forbidden', 'Authenticated, but not allowed to do this'],
            ['404 Not Found', 'The resource does not exist (also used to hide resources from users who may not know about them)'],
            ['405 Method Not Allowed', 'The URL exists but not with this method'],
            ['409 Conflict', 'The request conflicts with the current state, such as a duplicate or a stale version'],
            ['415 Unsupported Media Type', 'The server does not accept this Content-Type'],
            ['422 Unprocessable Content', 'The request is well-formed but fails validation'],
            ['429 Too Many Requests', 'Rate limited; check Retry-After before trying again'],
          ],
        },
      },
      {
        p: 'The 401 versus 403 distinction matters for clients: on 401 they should log in again or refresh the token; on 403 trying again with the same identity will not help.',
      },
      { h: 'Server errors' },
      {
        table: {
          head: ['Code', 'Meaning'],
          rows: [
            ['500 Internal Server Error', 'An unexpected failure in the server code'],
            ['502 Bad Gateway', 'A proxy or gateway got an invalid response from the service behind it'],
            ['503 Service Unavailable', 'Overloaded or down for maintenance; may include Retry-After'],
            ['504 Gateway Timeout', 'The service behind the proxy did not answer in time'],
          ],
        },
      },
      { h: 'Error bodies' },
      {
        p: 'A status code says what kind of error happened; the body should say what exactly. RFC 9457 (Problem Details) defines a standard JSON shape with the content type `application/problem+json`:',
      },
      { code: '{\n  "type": "https://example.com/errors/out-of-stock",\n  "title": "Item out of stock",\n  "status": 409,\n  "detail": "Only 2 units of SKU-42 are left.",\n  "instance": "/orders/123"\n}' },
      { h: 'Retrying well' },
      {
        ul: [
          'Retry idempotent requests on network errors, 502, 503 and 504, with exponential backoff and some random jitter.',
          'Respect `Retry-After` on 429 and 503.',
          'Do not retry 4xx errors other than 408 and 429; the request itself needs fixing.',
          'Cap the number of retries so a failing service is not flooded.',
        ],
      },
      {
        note: 'The API Client on this site shows the status, time, size and headers of every response, which makes it easy to see exactly what an API returns for each case.',
      },
    ],
  },

  'api-authentication-methods': {
    intro:
      'Almost every API asks the caller to prove who they are. The way it does so affects how secure the integration is, how keys are rotated and how much work clients have to do. This guide compares the methods you will meet most, from simple API keys to OAuth 2.0 and request signing, and shows how each is sent.',
    body: [
      { h: 'API keys' },
      {
        p: 'An API key is a long random string that identifies the calling application. It is sent in a header, sometimes in the query string:',
      },
      { code: 'GET /v1/forecast?city=Pune\nX-API-Key: 3f9c2b7e8d4a41f0a6c1e5b2d9f8a7c6' },
      {
        ul: [
          'Good for: server-to-server calls, usage metering, public data APIs.',
          'Watch out: a key is a password. Send it in a header rather than the URL, because URLs end up in logs, browser history and analytics. Never ship a secret key inside a mobile or browser app.',
          'Operate it well: allow several keys per account so they can be rotated without downtime, and scope each key to what it needs.',
        ],
      },
      { h: 'HTTP Basic authentication' },
      {
        p: 'Basic auth sends a user name and password joined by a colon and Base64-encoded: `Authorization: Basic YWRhOnNlY3JldA==`. Base64 is not encryption, so Basic auth is only acceptable over HTTPS. It is still common for internal tools and as the way OAuth clients send their client ID and secret to the token endpoint.',
      },
      { h: 'Bearer tokens' },
      {
        p: 'A bearer token is sent as `Authorization: Bearer <token>`. Whoever bears the token gets access, so it must travel over HTTPS and be short-lived. Tokens are either opaque random strings that the API looks up, or self-contained JWTs that the API can verify on its own.',
      },
      { h: 'OAuth 2.0' },
      {
        p: 'OAuth 2.0 is a framework for getting access tokens without handing passwords to the client. The client asks an authorization server for a token, then calls the API with it as a bearer token. Which flow, or grant, to use depends on the client:',
      },
      {
        table: {
          head: ['Grant', 'Use it for'],
          rows: [
            ['Authorization Code with PKCE', 'Web, mobile and single-page apps acting for a signed-in user'],
            ['Client Credentials', 'A backend service calling an API as itself, with no user'],
            ['Device Code', 'TVs and command-line tools without a browser'],
            ['Refresh Token', 'Getting a new access token without asking the user again'],
          ],
        },
      },
      {
        p: 'The older Implicit and Password grants are discouraged by the OAuth 2.0 Security Best Current Practice. Use Authorization Code with PKCE instead. Scopes limit what a token may do, and the API must check them on every request.',
      },
      { h: 'Request signing with HMAC' },
      {
        p: 'Some APIs make the client sign each request with a shared secret: the method, path, a timestamp and a hash of the body are combined and signed with HMAC-SHA256, and the signature is sent in a header. The secret itself never travels, a captured request cannot be changed without breaking the signature, and the timestamp limits replays. Webhook senders use the same idea so the receiver can confirm that a callback is genuine.',
      },
      { h: 'AWS Signature Version 4' },
      {
        p: 'AWS SigV4 is the best-known signing scheme. The client builds a canonical request (method, path, sorted query, signed headers and a SHA-256 of the body), derives a signing key from the secret access key, date, region and service, and sends the result in an `Authorization: AWS4-HMAC-SHA256 ...` header together with `X-Amz-Date`. Because the date is part of the signature, a signed request is only valid for a few minutes.',
      },
      { h: 'Mutual TLS' },
      {
        p: 'With mutual TLS (mTLS) the client presents its own certificate during the TLS handshake, and the server checks it. It is common between services inside a company and in banking APIs. Browsers cannot easily use client certificates for scripted calls, so mTLS is mostly a server-to-server tool.',
      },
      { h: 'Choosing a method' },
      {
        table: {
          head: ['Situation', 'Good choice'],
          rows: [
            ['Your own backend calls a third-party API', 'API key or OAuth Client Credentials'],
            ['Users sign in to your app and it calls your API', 'OAuth Authorization Code with PKCE, or session cookies for a single web app'],
            ['Partners integrate server-to-server', 'OAuth Client Credentials, HMAC signing or mTLS'],
            ['Receiving webhooks', 'HMAC signature check on each callback'],
            ['Internal admin tools behind a VPN', 'Basic auth over HTTPS, or your SSO'],
          ],
        },
      },
      { h: 'Rules that apply to all of them' },
      {
        ul: [
          'Always use HTTPS.',
          'Never put secrets in URLs.',
          'Keep secrets out of source control; use environment variables or a secret manager.',
          'Make credentials short-lived where possible, and rotatable everywhere.',
          'Return 401 for missing or invalid credentials and 403 for valid credentials without permission.',
        ],
      },
      {
        note: 'The API Client on this site supports all of these schemes, including Basic, Bearer, API keys, OAuth 2.0, AWS Signature, Hawk and Digest, and shows exactly which headers are sent in its code view.',
      },
    ],
  },
};
