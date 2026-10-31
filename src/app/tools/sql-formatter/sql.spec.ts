import { compactSql, formatSql } from './sql';

describe('sql', () => {
  it('formats a query with the chosen keyword case and indent', async () => {
    const result = await formatSql('select id, name from users where active = 1 order by name', {
      dialect: 'postgresql',
      keywordCase: 'upper',
      indent: 4,
    });
    expect(result).toEqual({ ok: true, output: 'SELECT\n    id,\n    name\nFROM\n    users\nWHERE\n    active = 1\nORDER BY\n    name' });
  });

  it('reports where a query cannot be read', async () => {
    const result = await formatSql('select * from t where (a = 1', { dialect: 'sql', keywordCase: 'preserve', indent: 2 });
    expect(result.ok).toBe(false);
  });

  it('collapses a query to one line but keeps strings intact', () => {
    expect(compactSql("SELECT a,\n  b -- note\nFROM t\nWHERE c = 'x  -- y'\n/* end */;")).toBe("SELECT a, b FROM t WHERE c = 'x  -- y';");
    expect(compactSql('select count( * ) , 1')).toBe('select count(*), 1');
  });
});
