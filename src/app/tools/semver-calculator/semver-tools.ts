/** Semantic versioning with the npm semver package: ranges in plain words, matching, sorting and bumping. */
import semver from 'semver';

export type RangeResult = { ok: true; normalized: string; words: string; matches: string[]; best: string | null } | { ok: false; error: string };

/** "^1.2.3" means ">=1.2.3 <2.0.0-0": say it in words. */
export function describeRange(normalized: string): string {
  if (normalized === '*' || normalized === '') return 'any version';
  return normalized
    .split('||')
    .map((set) =>
      set
        .trim()
        .split(/\s+/)
        .map((c) => {
          const m = /^(>=|<=|>|<|=)?(.+)$/.exec(c)!;
          const v = m[2].replace(/-0$/, '');
          return { '>=': `${v} or later`, '>': `later than ${v}`, '<=': `up to and including ${v}`, '<': `before ${v}`, '=': `exactly ${v}` }[m[1] ?? '='];
        })
        .join(' and '),
    )
    .join(', or ');
}

export function checkRange(range: string, versions: string[]): RangeResult {
  const normalized = semver.validRange(range.trim(), { loose: true });
  if (normalized === null) return { ok: false, error: `“${range}” is not a valid version range.` };
  const valid = versions.map((v) => v.trim()).filter((v) => semver.valid(v, { loose: true }));
  const matches = valid.filter((v) => semver.satisfies(v, normalized, { loose: true, includePrerelease: false }));
  return { ok: true, normalized, words: describeRange(normalized), matches, best: semver.maxSatisfying(valid, normalized, { loose: true }) };
}

export function sortVersions(versions: string[]): { sorted: string[]; invalid: string[] } {
  const clean = versions.map((v) => v.trim()).filter(Boolean);
  return {
    sorted: clean.filter((v) => semver.valid(v, { loose: true })).sort((a, b) => semver.compare(a, b, { loose: true })),
    invalid: clean.filter((v) => !semver.valid(v, { loose: true })),
  };
}

export type Bump = 'major' | 'minor' | 'patch' | 'premajor' | 'preminor' | 'prepatch' | 'prerelease';

export function bumps(version: string, preid = 'beta'): { kind: Bump; version: string }[] | null {
  if (!semver.valid(version.trim(), { loose: true })) return null;
  return (['major', 'minor', 'patch', 'premajor', 'preminor', 'prepatch', 'prerelease'] as Bump[]).map((kind) => ({
    kind,
    version: semver.inc(version.trim(), kind, { loose: true }, preid)!,
  }));
}
