import { detectL10n, parseL10n, writeL10n } from './l10n';

const ANDROID = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Shop</string>
    <string name="greeting">Hello, %1$s! You\\'re "in".</string>
    <string name="multi">Line one\\nLine two</string>
    <plurals name="items"><item quantity="one">%d item</item><item quantity="other">%d items</item></plurals>
</resources>`;

describe('l10n', () => {
  it('reads Android strings, plurals and escapes', () => {
    const r = parseL10n(ANDROID, 'android');
    expect(r.ok && r.entries).toEqual([
      { key: 'app_name', value: 'Shop' },
      { key: 'greeting', value: 'Hello, %1$s! You\'re "in".' },
      { key: 'multi', value: 'Line one\nLine two' },
      { key: 'items_one', value: '%d item' },
      { key: 'items_other', value: '%d items' },
    ]);
  });

  it('writes iOS strings with %@ placeholders and reads them back', () => {
    const r = parseL10n(ANDROID, 'android');
    if (!r.ok) throw new Error();
    const ios = writeL10n(r.entries.slice(0, 2), 'ios');
    expect(ios).toBe('"app_name" = "Shop";\n"greeting" = "Hello, %1$@! You\'re \\"in\\".";\n');
    const back = parseL10n(ios, 'ios');
    expect(back.ok && back.entries[1].value).toBe('Hello, %1$s! You\'re "in".');
  });

  it('writes valid Android XML from JSON, nested keys becoming names', () => {
    const r = parseL10n('{"home": {"title": "Welcome", "cta": "Don\'t wait & buy"}}', 'json');
    if (!r.ok) throw new Error();
    expect(writeL10n(r.entries, 'android')).toBe(
      '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="home_title">Welcome</string>\n    <string name="home_cta">Don\\\'t wait &amp; buy</string>\n</resources>\n',
    );
    expect(writeL10n(r.entries, 'json', true)).toBe('{\n  "home": {\n    "title": "Welcome",\n    "cta": "Don\'t wait & buy"\n  }\n}\n');
  });

  it('reads and writes CSV and guesses formats', () => {
    const r = parseL10n('key,value\nok,"Yes, ""sure"""\nno,No\n', 'csv');
    expect(r.ok && r.entries).toEqual([{ key: 'ok', value: 'Yes, "sure"' }, { key: 'no', value: 'No' }]);
    if (r.ok) expect(writeL10n(r.entries, 'csv')).toBe('key,value\nok,"Yes, ""sure"""\nno,No\n');
    expect(detectL10n(ANDROID)).toBe('android');
    expect(detectL10n('"a" = "b";')).toBe('ios');
    expect(detectL10n('{"a":"b"}')).toBe('json');
    expect(parseL10n('<resources><string', 'android').ok).toBe(false);
  });
});
