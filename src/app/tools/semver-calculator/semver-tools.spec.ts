import { bumps, checkRange, describeRange, sortVersions } from './semver-tools';

const VERSIONS = ['1.2.2', '1.2.3', '1.3.0', '1.9.9', '2.0.0', '2.0.0-beta.1', '2.1.0'];

describe('semver-tools', () => {
  it('explains caret and tilde ranges and finds matching versions', () => {
    const caret = checkRange('^1.2.3', VERSIONS);
    expect(caret).toEqual({
      ok: true,
      normalized: '>=1.2.3 <2.0.0-0',
      words: '1.2.3 or later and before 2.0.0',
      matches: ['1.2.3', '1.3.0', '1.9.9'],
      best: '1.9.9',
    });
    const tilde = checkRange('~1.2.3', VERSIONS);
    expect(tilde.ok && tilde.matches).toEqual(['1.2.3']);
    expect(checkRange('>=2 || <1.2.3', VERSIONS)).toMatchObject({ ok: true, matches: ['1.2.2', '2.0.0', '2.1.0'] });
    expect(checkRange('not a range!', VERSIONS)).toMatchObject({ ok: false });
    expect(describeRange('*')).toBe('any version');
  });

  it('sorts versions the semver way, pre-releases before releases', () => {
    expect(sortVersions(['1.10.0', '1.2.0', '2.0.0', '2.0.0-rc.1', 'banana'])).toEqual({
      sorted: ['1.2.0', '1.10.0', '2.0.0-rc.1', '2.0.0'],
      invalid: ['banana'],
    });
  });

  it('bumps a version every way', () => {
    expect(bumps('1.4.2')?.map((b) => b.version)).toEqual(['2.0.0', '1.5.0', '1.4.3', '2.0.0-beta.0', '1.5.0-beta.0', '1.4.3-beta.0', '1.4.3-beta.0']);
    expect(bumps('1.4.2-beta.3')?.find((b) => b.kind === 'prerelease')?.version).toBe('1.4.2-beta.4');
    expect(bumps('x')).toBeNull();
  });
});
