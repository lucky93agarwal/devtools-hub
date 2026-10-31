import { GitignoreTemplate, buildGitignore, searchTemplates } from './gitignore';
import { TEMPLATES } from './templates';

const t = (id: string, text: string): GitignoreTemplate => ({ id, label: id, group: 'x', text });

describe('gitignore', () => {
  it('joins templates with headings and drops patterns seen before', () => {
    const out = buildGitignore([t('A', '# deps\nnode_modules/\n.env\n'), t('B', '# secrets\n.env\n\n\ndist/')], '');
    expect(out).toBe('### A ###\n# deps\nnode_modules/\n.env\n\n### B ###\n# secrets\n\ndist/\n');
  });

  it('puts custom lines first and skips a template with nothing new', () => {
    const out = buildGitignore([t('A', '# only\n.env')], '.env\ncoverage/');
    expect(out).toBe('### Project ###\n.env\ncoverage/\n');
    expect(buildGitignore([t('A', '.env'), t('B', '.env')], '', false)).toContain('### B ###\n.env');
    expect(buildGitignore([], '')).toBe('');
  });

  it('ships the common templates and finds them by name', () => {
    const node = TEMPLATES.find((x) => x.id === 'node');
    expect(node?.text).toContain('node_modules/');
    expect(TEMPLATES.find((x) => x.id === 'macos')?.text).toContain('.DS_Store');
    expect(searchTemplates(TEMPLATES, 'jet').map((x) => x.id)).toEqual(['jetbrains']);
    expect(new Set(TEMPLATES.map((x) => x.id)).size).toBe(TEMPLATES.length);
  });
});
