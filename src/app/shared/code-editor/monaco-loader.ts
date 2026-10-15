import type * as Monaco from 'monaco-editor/editor/editor.api';

export type MonacoApi = typeof Monaco;

let loading: Promise<MonacoApi> | undefined;

/**
 * Loads the Monaco editor once, in the browser only, and only on pages that use it.
 * Only the editor core and the features we need are imported, to keep the download small.
 */
export function loadMonaco(): Promise<MonacoApi> {
  loading ??= (async () => {
    (self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
      getWorker: () => new Worker(new URL('./editor.worker', import.meta.url), { type: 'module' }),
    };
    loadStylesheet('monaco/editor.main.css');

    const monaco = await import('monaco-editor/editor/editor.api');
    await Promise.all([
      import('monaco-editor/features/bracketMatching/register'),
      import('monaco-editor/features/clipboard/register'),
      import('monaco-editor/features/contextmenu/register'),
      import('monaco-editor/features/cursorUndo/register'),
      import('monaco-editor/features/diffEditor/register'),
      import('monaco-editor/features/find/register'),
      import('monaco-editor/features/folding/register'),
      import('monaco-editor/features/hover/register'),
      import('monaco-editor/features/linesOperations/register'),
      import('monaco-editor/features/multicursor/register'),
      import('monaco-editor/features/placeholderText/register'),
      import('monaco-editor/features/wordHighlighter/register'),
    ]);

    registerJson(monaco);
    defineThemes(monaco);
    return monaco;
  })();
  return loading;
}

function loadStylesheet(href: string): void {
  if (document.querySelector(`link[data-monaco]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset['monaco'] = '';
  document.head.appendChild(link);
}

/**
 * Small JSON highlighter. Monaco's own JSON support needs an extra worker and
 * validates too; we only need colours, because the tool has its own checker.
 */
function registerJson(monaco: MonacoApi): void {
  monaco.languages.register({ id: 'json' });
  monaco.languages.setLanguageConfiguration('json', {
    brackets: [
      ['{', '}'],
      ['[', ']'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '"', close: '"', notIn: ['string'] },
    ],
  });
  monaco.languages.setMonarchTokensProvider('json', {
    tokenizer: {
      root: [
        [/"(?:[^"\\]|\\.)*"(?=\s*:)/, 'key'],
        [/"(?:[^"\\]|\\.)*"?/, 'string'],
        [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
        [/\b(?:true|false|null)\b/, 'keyword'],
        [/[{}[\]]/, '@brackets'],
        [/[,:]/, 'delimiter'],
      ],
    },
  });
}

/** Editor themes that follow the site's design tokens. */
function defineThemes(monaco: MonacoApi): void {
  monaco.editor.defineTheme('dth-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'key', foreground: '4338CA' },
      { token: 'string', foreground: '047857' },
      { token: 'number', foreground: 'B45309' },
      { token: 'keyword', foreground: '7C3AED' },
      { token: 'delimiter', foreground: '4B5563' },
    ],
    colors: {
      'editor.background': '#F5F7F9',
      'editorGutter.background': '#F5F7F9',
      'editorLineNumber.foreground': '#6B7280',
      'editorLineNumber.activeForeground': '#1F2937',
      'editor.lineHighlightBackground': '#EEF0F4',
    },
  });
  monaco.editor.defineTheme('dth-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'key', foreground: 'A5B4FC' },
      { token: 'string', foreground: '6EE7B7' },
      { token: 'number', foreground: 'FCD34D' },
      { token: 'keyword', foreground: 'C4B5FD' },
      { token: 'delimiter', foreground: '9CA3AF' },
    ],
    colors: {
      'editor.background': '#111A2E',
      'editorGutter.background': '#111A2E',
      'editorLineNumber.foreground': '#6B7280',
      'editorLineNumber.activeForeground': '#E5E7EB',
      'editor.lineHighlightBackground': '#16213A',
    },
  });
}
