/** Joins .gitignore templates into one file, dropping patterns an earlier template already has. */

export interface GitignoreTemplate {
  id: string;
  label: string;
  group: string;
  text: string;
}

export function buildGitignore(templates: readonly GitignoreTemplate[], custom: string, dedupe = true): string {
  const seen = new Set<string>();
  const sections: string[] = [];
  const add = (title: string, text: string) => {
    const lines = text.split('\n').filter((line) => {
      const pattern = line.trim();
      // Re-include rules (!pattern) depend on their order, so they are always kept.
      if (!dedupe || !pattern || pattern.startsWith('#') || pattern.startsWith('!')) return true;
      if (seen.has(pattern)) return false;
      seen.add(pattern);
      return true;
    });
    // A section left with only comments and blank lines has nothing new to add.
    if (lines.some((line) => line.trim() && !line.trim().startsWith('#'))) {
      sections.push(`### ${title} ###\n${tidy(lines).join('\n')}`);
    }
  };
  if (custom.trim()) add('Project', custom.trim());
  for (const template of templates) add(template.label, template.text);
  return sections.length ? sections.join('\n\n') + '\n' : '';
}

/** Collapses runs of blank lines left behind by removed patterns. */
function tidy(lines: string[]): string[] {
  return lines.filter((line, i) => line.trim() || (i > 0 && lines[i - 1].trim())).join('\n').trim().split('\n');
}

export function searchTemplates(templates: readonly GitignoreTemplate[], query: string): GitignoreTemplate[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return templates.filter((t) => words.every((w) => t.label.toLowerCase().includes(w) || t.id.includes(w)));
}
