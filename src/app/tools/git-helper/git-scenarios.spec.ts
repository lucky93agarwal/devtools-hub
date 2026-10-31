import { SCENARIOS, fill, searchScenarios } from './git-scenarios';

describe('git-scenarios', () => {
  it('has unique ids and a command for every scenario', () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    for (const s of SCENARIOS) expect(s.commands.length, s.id).toBeGreaterThan(0);
  });

  it('fills placeholders and keeps unknown ones', () => {
    expect(fill('git push -u {remote} {branch}', { remote: 'origin', branch: 'feature/x' })).toBe('git push -u origin feature/x');
    expect(fill('git switch {branch}', {})).toBe('git switch {branch}');
    expect(fill('git stash apply stash@{1}', { branch: 'x' })).toBe('git stash apply stash@{1}');
  });

  it('finds scenarios by everyday words', () => {
    expect(searchScenarios('wrong branch')[0].id).toBe('wrong-branch');
    expect(searchScenarios('uncommit').map((s) => s.id)).toContain('undo-last-keep');
    expect(searchScenarios('password').map((s) => s.id)).toEqual(['secret']);
  });
});
