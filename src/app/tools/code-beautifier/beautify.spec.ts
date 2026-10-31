import { beautify, detectLanguage, minify, minifyHtml } from './beautify';

describe('beautify', () => {
  it('beautifies JavaScript, CSS and HTML with the chosen indent', async () => {
    expect(await beautify('function a(b){if(b){return 1}return 2}', 'js', 2)).toEqual({
      ok: true,
      output: 'function a(b) {\n  if (b) {\n    return 1\n  }\n  return 2\n}\n',
    });
    expect(await beautify('a{color:red;margin:0}', 'css', 4)).toEqual({ ok: true, output: 'a {\n    color: red;\n    margin: 0\n}\n' });
    const html = await beautify('<ul><li>One</li><li>Two</li></ul>', 'html', 0);
    expect(html.ok && html.output).toBe('<ul>\n\t<li>One</li>\n\t<li>Two</li>\n</ul>\n');
  });

  it('minifies JavaScript and CSS, and reports where JavaScript is broken', async () => {
    const js = await minify('function add(first, second) {\n  // sum\n  return first + second;\n}\nconsole.log(add(1, 2));', 'js');
    expect(js.ok && js.output).toMatch(/^function add\((\w),(\w)\)\{return \1\+\2\}console\.log\(add\(1,2\)\);$/);
    expect(await minify('a {\n  color: #ff0000;\n  margin: 0px;\n}', 'css')).toEqual({ ok: true, output: 'a{color:red;margin:0}' });
    expect(await minify('let x = ;', 'js')).toMatchObject({ ok: false, line: 1 });
  });

  it('minifies HTML without gluing words or touching pre and script', () => {
    const html = '<!-- note -->\n<div>\n  <p>Hello <b>big</b>\n  world</p>\n  <pre>  a\n   b</pre>\n  <script>if (a  <  b) {}</script>\n</div>\n';
    expect(minifyHtml(html)).toBe('<div><p>Hello <b>big</b> world</p><pre>  a\n   b</pre><script>if (a  <  b) {}</script></div>');
    expect(minifyHtml('<!--[if IE]>x<![endif]--><span>a</span> <span>b</span>')).toBe('<!--[if IE]>x<![endif]--><span>a</span> <span>b</span>');
  });

  it('guesses the language', () => {
    expect(detectLanguage('<!DOCTYPE html><html></html>')).toBe('html');
    expect(detectLanguage('.btn, a:hover { color: red }')).toBe('css');
    expect(detectLanguage('const a = () => 1;')).toBe('js');
    expect(detectLanguage('  ')).toBeNull();
  });
});
