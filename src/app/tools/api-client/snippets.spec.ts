import { PreparedRequest } from './build';
import { SNIPPET_LANGUAGES, snippet } from './snippets';

const base: PreparedRequest = {
  method: 'POST',
  url: 'https://api.example.com/users?page=2',
  headers: [
    ['Authorization', 'Bearer abc'],
    ['Content-Type', 'application/json'],
  ],
  body: '{"name":"Ada"}',
  bodyText: '{"name":"Ada"}',
  formFields: [],
  dropped: [],
  unresolved: [],
};
const form: PreparedRequest = { ...base, headers: [['Authorization', 'Bearer abc']], body: null, bodyText: null, formFields: [['name', 'Ada']], formFiles: [['photo', 'cat.png']] };
const file: PreparedRequest = { ...base, headers: [['Content-Type', 'image/png']], body: null, bodyText: null, bodyFile: 'cat.png' };

describe('code snippets', () => {
  it('offers every Postman language', () => {
    expect(SNIPPET_LANGUAGES).toHaveLength(35);
    expect(SNIPPET_LANGUAGES.map((l) => l.label)).toContain('Swift - URLSession');
  });

  for (const language of SNIPPET_LANGUAGES) {
    it(`writes ${language.label} with the URL, headers and every kind of body`, () => {
      const code = snippet(language.id, base);
      expect(code).toContain(language.id === 'http' ? '/users?page=2' : 'api.example.com');
      expect(code).toContain('Bearer abc');
      expect(code).toMatch(/Ada/);
      expect(snippet(language.id, form)).toContain('Ada');
      expect(snippet(language.id, file).length).toBeGreaterThan(20);
    });
  }

  it('writes idiomatic code', () => {
    expect(snippet('python-requests', base)).toContain('response = requests.request("POST", url, headers=headers, data=payload)');
    expect(snippet('python-requests', form)).toContain('files = [("photo", ("cat.png", open("cat.png", "rb")))]');
    expect(snippet('http', base)).toMatch(/^POST \/users\?page=2 HTTP\/1\.1\nHost: api\.example\.com\nAuthorization: Bearer abc/);
    expect(snippet('go', base)).toContain('req, err := http.NewRequest("POST", "https://api.example.com/users?page=2", payload)');
    expect(snippet('postman-cli', base)).toMatch(/^postman request POST 'https:\/\/api\.example\.com/);
    expect(snippet('php-curl', { ...base, bodyText: "it's" })).toContain("CURLOPT_POSTFIELDS => 'it\\'s',");
    expect(snippet('powershell', { ...base, bodyText: "it's" })).toContain("$body = 'it''s'");
    // Multipart bodies set their own Content-Type.
    expect(snippet('node-axios', { ...form, headers: [['Content-Type', 'multipart/form-data']] })).not.toContain('"Content-Type"');
  });

  it('explains a URL it cannot read', () => {
    expect(snippet('http', { ...base, url: '{{base}}/x' })).toContain('Enter a full URL');
  });
});
