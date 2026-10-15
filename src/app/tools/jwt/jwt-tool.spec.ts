import { TestBed } from '@angular/core/testing';
import { JwtTool } from './jwt-tool';
import { base64UrlEncode } from './jwt-tools';

const token = (payload: object, header: object = { alg: 'HS256', typ: 'JWT' }) =>
  `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}.c2ln`;

describe('JwtTool', () => {
  async function setup() {
    const fixture = TestBed.createComponent(JwtTool);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const text = () => el.textContent!.replace(/\s+/g, ' ');
    const paste = async (value: string) => {
      const box = el.querySelector<HTMLTextAreaElement>('#jwt-input')!;
      box.value = value;
      box.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    const click = async (label: string) => {
      [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(label))!.click();
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    };
    return { fixture, el, text, paste, click };
  }

  const now = () => Math.floor(Date.now() / 1000);

  it('shows nothing decoded at first', async () => {
    const { el } = await setup();
    expect(el.querySelector('#payload-heading')).toBeNull();
  });

  it('shows the header, payload, dates and claims of a token', async () => {
    const { el, text, paste } = await setup();
    await paste(token({ sub: 'user-7', iss: 'https://auth.example.com', iat: now() - 60, exp: now() + 3600 }));
    expect(text()).toContain('Not expired');
    expect(text()).toContain('The signature is not checked here.');
    expect(el.querySelectorAll('pre')[0].textContent).toContain('"alg": "HS256"');
    expect(el.querySelectorAll('pre')[1].textContent).toContain('"sub": "user-7"');
    expect(text()).toContain('Issued at (iat)');
    expect(text()).toContain('1 minute ago');
    expect(text()).toContain('Expires (exp)');
    expect(text()).toContain('in 1 hour');
    expect(text()).toContain('Issuer: who created the token.');
  });

  it('marks an expired token', async () => {
    const { text, paste } = await setup();
    await paste(token({ exp: now() - 120 }));
    expect(text()).toContain('Expired');
    expect(text()).toContain('2 minutes ago');
  });

  it('warns about unsigned tokens', async () => {
    const { text, paste } = await setup();
    await paste(token({ sub: 'x' }, { alg: 'none' }));
    expect(text()).toContain('Unsigned token.');
    expect(text()).toContain('No expiry');
  });

  it('explains an invalid token', async () => {
    const { el, text, paste } = await setup();
    await paste('not-a-token');
    expect(text()).toContain('A JWT has three parts separated by dots');
    expect(el.querySelector('#jwt-input')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('decodes a token pasted with a Bearer prefix', async () => {
    const { text, paste } = await setup();
    await paste(`Bearer ${token({ sub: 'abc' })}`);
    expect(text()).toContain('"sub": "abc"');
  });

  it('loads a sample token that is not expired', async () => {
    const { fixture, text, click } = await setup();
    await click('Use a sample token');
    // Signing with Web Crypto is async and can take longer on slow machines such as CI.
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(text()).toContain('Sample User');
    });
    expect(text()).toContain('Not expired');
  });
});
