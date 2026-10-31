import { parseCells, renderMarkdown, toMarkdownTable } from './markdown';

describe('markdown', () => {
  it('renders GitHub-flavoured Markdown and removes scripts', async () => {
    const html = await renderMarkdown('# Title\n\n- [x] done\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n<img src=x onerror="alert(1)"><script>alert(2)</script>');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<table>');
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<script');
  });

  it('turns spreadsheet and CSV data into a table', () => {
    expect(parseCells('Name\tAge\nAda\t36')).toEqual([['Name', 'Age'], ['Ada', '36']]);
    expect(parseCells('name,note\nAda,"Hi, ""you"""')).toEqual([['name', 'note'], ['Ada', 'Hi, "you"']]);
    expect(toMarkdownTable([['Name', 'Age'], ['Ada', '36'], ['Bo|b']], 'left')).toBe(
      '| Name  | Age |\n| :---- | :-- |\n| Ada   | 36  |\n| Bo\\|b |     |\n',
    );
    expect(toMarkdownTable([['a', 'b']], 'center')).toBe('| a   | b   |\n| :-: | :-: |\n');
  });
});
