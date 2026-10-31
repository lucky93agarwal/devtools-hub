import { RECIPES, STEPS, runRecipe } from './steps';

describe('recipes', () => {
  it('chains Base64 decode and JSON format', async () => {
    const out = await runRecipe('eyJhIjoxLCJiIjpbMiwzXX0=', ['b64-decode', 'json-format']);
    expect(out.map((o) => o.result.ok)).toEqual([true, true]);
    expect(out[1].result).toEqual({ ok: true, text: '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}' });
  });

  it('stops at the first step that fails', async () => {
    const out = await runRecipe('not base64 !', ['b64-decode', 'json-format']);
    expect(out.length).toBe(1);
    expect(out[0].result.ok).toBe(false);
  });

  it('unwraps a quoted JSON string', async () => {
    const out = await runRecipe('"{\\"a\\":\\"x\\"}"', ['json-unescape', 'json-minify']);
    expect(out[1].result).toEqual({ ok: true, text: '{"a":"x"}' });
  });

  it('hashes with SHA-256', async () => {
    const out = await runRecipe('abc', ['sha256']);
    expect(out[0].result).toEqual({ ok: true, text: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' });
  });

  it('cleans a list of lines', async () => {
    const out = await runRecipe('  b\na\n\nb\nc ', ['trim', 'unique', 'sort']);
    expect(out.at(-1)!.result).toEqual({ ok: true, text: 'a\nb\nc' });
  });

  it('every ready-made recipe works on its sample', async () => {
    for (const r of RECIPES) {
      for (const id of r.steps) expect(STEPS.some((s) => s.id === id), id).toBe(true);
      const out = await runRecipe(r.sample, r.steps);
      expect(out.length, r.name).toBe(r.steps.length);
      expect(out.every((o) => o.result.ok), `${r.name}: ${JSON.stringify(out.map((o) => o.result))}`).toBe(true);
    }
  });
});
