import { CASE_STYLES, DEFAULT_LINE_OPTIONS, applyLineTools, stats, words } from './text-case';

const convert = (id: string, text: string) => CASE_STYLES.find((s) => s.id === id)!.convert(text);

describe('text-case', () => {
  it('splits identifiers and phrases into words', () => {
    expect(words('parseHTTPResponse_v2')).toEqual(['parse', 'HTTP', 'Response', 'v2']);
    expect(words('user-id from API')).toEqual(['user', 'id', 'from', 'API']);
    expect(words('XMLHttpRequest')).toEqual(['XML', 'Http', 'Request']);
    expect(words('  ')).toEqual([]);
  });

  it('converts to every identifier style, line by line', () => {
    expect(convert('camel', 'user id\nOrder_total')).toBe('userId\norderTotal');
    expect(convert('pascal', 'user-profile page')).toBe('UserProfilePage');
    expect(convert('snake', 'userProfileURL')).toBe('user_profile_url');
    expect(convert('constant', 'max retry count')).toBe('MAX_RETRY_COUNT');
    expect(convert('kebab', 'MyComponentName')).toBe('my-component-name');
    expect(convert('train', 'content type')).toBe('Content-Type');
    expect(convert('dot', 'app name')).toBe('app.name');
    expect(convert('path', 'Api Users')).toBe('api/users');
  });

  it('changes letter case of prose', () => {
    expect(convert('title', 'the QUICK brown-fox')).toBe('The Quick Brown-Fox');
    expect(convert('sentence', 'HELLO there. how ARE you?\nfine')).toBe('Hello there. How are you?\nFine');
    expect(convert('upper', 'straße')).toBe('STRASSE');
  });

  it('sorts, dedupes and trims lines', () => {
    const o = DEFAULT_LINE_OPTIONS;
    expect(applyLineTools('b\na\n\nb\n  c ', { ...o, unique: true, removeEmpty: true, trim: true, sort: 'az' })).toBe('a\nb\nc');
    expect(applyLineTools('file10\nfile2\nfile1', { ...o, sort: 'natural' })).toBe('file1\nfile2\nfile10');
    expect(applyLineTools('Apple\napple\nBanana', { ...o, unique: true, ignoreCase: true })).toBe('Apple\nBanana');
    expect(applyLineTools('ccc\na\nbb', { ...o, sort: 'length', reverse: true })).toBe('ccc\nbb\na');
  });

  it('counts characters as people see them', () => {
    expect(stats('héllo 👋🏽\nworld')).toEqual({ characters: 13, withoutSpaces: 11, words: 3, lines: 2, bytes: 21 });
    expect(stats('')).toEqual({ characters: 0, withoutSpaces: 0, words: 0, lines: 0, bytes: 0 });
  });
});
