/** Authorization types, as offered by Postman, and what each one needs. */

export const JWT_ALGORITHMS = ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512'] as const;
export type JwtAlgorithm = (typeof JWT_ALGORITHMS)[number];
/** ASAP tokens are always signed with a private key. */
export const ASAP_ALGORITHMS = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512'] as const;

export type Auth =
  /** Use the folder's or collection's auth. */
  | { type: 'inherit' }
  | { type: 'none' }
  | { type: 'basic'; username: string; password: string }
  | { type: 'bearer'; token: string }
  | {
      type: 'jwt';
      algorithm: JwtAlgorithm;
      /** Shared secret for HS algorithms. */
      secret: string;
      secretBase64: boolean;
      /** PEM private key (PKCS #8) for RS, PS and ES algorithms. */
      privateKey: string;
      payload: string;
      /** Extra JWT header fields, as JSON. */
      header: string;
      prefix: string;
      addTo: 'header' | 'query';
      queryKey: string;
    }
  | {
      type: 'digest';
      username: string;
      password: string;
      realm: string;
      nonce: string;
      algorithm: 'MD5' | 'MD5-sess' | 'SHA-256' | 'SHA-256-sess';
      qop: '' | 'auth' | 'auth-int';
      nonceCount: string;
      clientNonce: string;
      opaque: string;
    }
  | {
      type: 'oauth1';
      signatureMethod: 'HMAC-SHA1' | 'HMAC-SHA256' | 'HMAC-SHA512' | 'PLAINTEXT';
      consumerKey: string;
      consumerSecret: string;
      token: string;
      tokenSecret: string;
      realm: string;
      addTo: 'header' | 'query';
    }
  | {
      type: 'oauth2';
      accessToken: string;
      headerPrefix: string;
      addTo: 'header' | 'query';
      /** For getting a new token from the token URL. */
      grantType: 'client_credentials' | 'password';
      tokenUrl: string;
      clientId: string;
      clientSecret: string;
      scope: string;
      username: string;
      password: string;
      clientAuth: 'header' | 'body';
    }
  | {
      type: 'hawk';
      authId: string;
      authKey: string;
      algorithm: 'sha256' | 'sha1';
      user: string;
      ext: string;
      app: string;
      dlg: string;
      includePayloadHash: boolean;
    }
  | { type: 'aws'; accessKey: string; secretKey: string; sessionToken: string; region: string; service: string }
  | { type: 'ntlm'; username: string; password: string; domain: string; workstation: string }
  | { type: 'api-key'; key: string; value: string; addTo: 'header' | 'query' }
  | {
      type: 'edgegrid';
      accessToken: string;
      clientToken: string;
      clientSecret: string;
      /** Comma-separated header names included in the signature. */
      headersToSign: string;
    }
  | {
      type: 'asap';
      algorithm: (typeof ASAP_ALGORITHMS)[number];
      issuer: string;
      subject: string;
      audience: string;
      keyId: string;
      privateKey: string;
      /** Extra claims, as JSON. */
      claims: string;
      /** Lifetime in seconds. */
      expiresIn: number;
    };

export type AuthType = Auth['type'];

/** The list in the Type menu, in Postman's order. */
export const AUTH_TYPES: { type: AuthType; label: string }[] = [
  { type: 'inherit', label: 'Inherit auth from parent' },
  { type: 'none', label: 'No Auth' },
  { type: 'basic', label: 'Basic Auth' },
  { type: 'bearer', label: 'Bearer Token' },
  { type: 'jwt', label: 'JWT Bearer' },
  { type: 'digest', label: 'Digest Auth' },
  { type: 'oauth1', label: 'OAuth 1.0' },
  { type: 'oauth2', label: 'OAuth 2.0' },
  { type: 'hawk', label: 'Hawk Authentication' },
  { type: 'aws', label: 'AWS Signature' },
  { type: 'ntlm', label: 'NTLM Authentication' },
  { type: 'api-key', label: 'API Key' },
  { type: 'edgegrid', label: 'Akamai EdgeGrid' },
  { type: 'asap', label: 'ASAP (Atlassian)' },
];

export const authLabel = (type: AuthType) => AUTH_TYPES.find((t) => t.type === type)?.label ?? type;

/** Starting values for a newly chosen type. */
export function defaultAuth(type: AuthType): Auth {
  switch (type) {
    case 'inherit':
    case 'none':
      return { type };
    case 'basic':
      return { type, username: '', password: '' };
    case 'bearer':
      return { type, token: '' };
    case 'jwt':
      return {
        type,
        algorithm: 'HS256',
        secret: '',
        secretBase64: false,
        privateKey: '',
        payload: '{\n  "sub": "user-1"\n}',
        header: '{}',
        prefix: 'Bearer',
        addTo: 'header',
        queryKey: 'token',
      };
    case 'digest':
      return { type, username: '', password: '', realm: '', nonce: '', algorithm: 'MD5', qop: 'auth', nonceCount: '00000001', clientNonce: '', opaque: '' };
    case 'oauth1':
      return { type, signatureMethod: 'HMAC-SHA1', consumerKey: '', consumerSecret: '', token: '', tokenSecret: '', realm: '', addTo: 'header' };
    case 'oauth2':
      return {
        type,
        accessToken: '',
        headerPrefix: 'Bearer',
        addTo: 'header',
        grantType: 'client_credentials',
        tokenUrl: '',
        clientId: '',
        clientSecret: '',
        scope: '',
        username: '',
        password: '',
        clientAuth: 'header',
      };
    case 'hawk':
      return { type, authId: '', authKey: '', algorithm: 'sha256', user: '', ext: '', app: '', dlg: '', includePayloadHash: false };
    case 'aws':
      return { type, accessKey: '', secretKey: '', sessionToken: '', region: 'us-east-1', service: 'execute-api' };
    case 'ntlm':
      return { type, username: '', password: '', domain: '', workstation: '' };
    case 'api-key':
      return { type, key: 'X-API-Key', value: '', addTo: 'header' };
    case 'edgegrid':
      return { type, accessToken: '', clientToken: '', clientSecret: '', headersToSign: '' };
    case 'asap':
      return { type, algorithm: 'RS256', issuer: '', subject: '', audience: '', keyId: '', privateKey: '', claims: '{}', expiresIn: 3600 };
  }
}

/** Types whose signature is worked out when sending (time, nonce or body dependent). */
export const SIGNED_TYPES: AuthType[] = ['jwt', 'digest', 'oauth1', 'hawk', 'aws', 'edgegrid', 'asap'];

/** Every text field of an auth with `fill` applied, for {{variables}}. */
export function mapAuthText(auth: Auth, fill: (text: string) => string): Auth {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(auth)) out[key] = typeof value === 'string' && key !== 'type' ? fill(value) : value;
  return out as Auth;
}

/** All text in an auth, for spotting {{variables}} without a value. */
export const authText = (auth: Auth) =>
  Object.entries(auth)
    .filter(([key, value]) => key !== 'type' && typeof value === 'string')
    .map(([, value]) => value as string)
    .join(' ');
