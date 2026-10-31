import { searchTools } from './tool-search';

describe('searchTools', () => {
  it('finds tools by name, short name and common words', () => {
    expect(searchTools('base64')[0].path).toBe('base64');
    expect(searchTools('epoch')[0].path).toBe('timestamp-converter');
    expect(searchTools('sha256')[0].path).toBe('hash-generator');
    expect(searchTools('postman')[0].path).toBe('api-client');
    expect(searchTools('jq')[0].path).toBe('json-query');
    expect(searchTools('json').length).toBeGreaterThan(4);
    expect(searchTools('zzzz')).toEqual([]);
    expect(searchTools('').length).toBeGreaterThan(30);
  });
});
