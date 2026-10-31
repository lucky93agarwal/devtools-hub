import { loadJq } from 'jq-wasm';
import { SAMPLE_JSON, EXAMPLES, runJq, runJsonPath, setJqLoader } from './query';

const data = JSON.parse(SAMPLE_JSON);

describe('query', () => {
  beforeAll(() => setJqLoader(() => loadJq()));

  it('runs JSONPath, including filters', async () => {
    expect(await runJsonPath(data, '$.store.book[?(@.price < 10)].title')).toEqual({
      ok: true,
      output: JSON.stringify(['Sayings of the Century', 'Moby Dick'], null, 2),
      count: 2,
    });
    expect(await runJsonPath(data, '$..nothing')).toMatchObject({ ok: true, count: 0 });
  });

  it('runs jq with compact and raw output', async () => {
    expect(await runJq(SAMPLE_JSON, '.store.book[].author', { compact: false, raw: true })).toMatchObject({
      ok: true,
      output: 'Nigel Rees\nEvelyn Waugh\nHerman Melville\nJ. R. R. Tolkien',
    });
    expect(await runJq(SAMPLE_JSON, '.store.bicycle', { compact: true, raw: false })).toMatchObject({
      ok: true,
      output: '{"color":"red","price":19.95}',
    });
  });

  it('shows jq errors without the noise', async () => {
    const result = await runJq(SAMPLE_JSON, '.store |||', { compact: false, raw: false });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/^syntax error/) });
    expect(await runJq(SAMPLE_JSON, '.store.book | keys | .x', { compact: false, raw: false })).toMatchObject({ ok: false });
  });

  it('has examples that all work on the sample', async () => {
    for (const e of EXAMPLES.jsonpath) expect((await runJsonPath(data, e.query)).ok, e.query).toBe(true);
    for (const e of EXAMPLES.jq) expect((await runJq(SAMPLE_JSON, e.query, { compact: true, raw: false })).ok, e.query).toBe(true);
  });
});
