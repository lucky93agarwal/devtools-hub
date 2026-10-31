import { TOOLS, TOOL_CATEGORIES, ToolInfo } from '../../core/tools';

/** Extra words people search for that are not in a tool's name or description. */
const KEYWORDS: Record<string, string> = {
  'json-formatter': 'beautify pretty print lint',
  'json-compare': 'diff',
  jwt: 'token bearer auth decode',
  'api-client': 'postman http request rest graphql websocket',
  base64: 'encode decode atob btoa data uri',
  'url-encoder': 'percent encode decode query string',
  'hash-generator': 'md5 sha sha256 checksum hmac',
  'uuid-generator': 'guid ulid nanoid id',
  'timestamp-converter': 'epoch unix time date',
  'cron-expression': 'crontab schedule',
  'regex-tester': 'regexp regular expression pattern',
  'json-query': 'jq jsonpath filter',
  'certificate-decoder': 'ssl tls x509 pem csr https',
  'color-converter': 'colour hex rgb hsl contrast wcag',
  'cidr-calculator': 'subnet ip network mask',
  'chmod-calculator': 'permission unix linux file',
  'gitignore-generator': 'git ignore',
  'env-converter': 'dotenv environment variables kubernetes secret',
  'code-beautifier': 'html css javascript minify prettify',
  'sql-formatter': 'query beautify',
  'curl-to-code': 'python requests fetch axios',
  'mock-data-generator': 'fake test data faker',
  'case-converter': 'camelcase snake case kebab sort lines word count',
  'text-diff': 'compare difference',
  'image-converter': 'png jpg webp avif heic',
  'background-remover': 'transparent cut out',
};

/** Live tools matching every word of the query, best matches (name hits) first. */
export function searchTools(query: string): ToolInfo[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const live = TOOLS.filter((t) => t.live);
  if (!words.length) return live;
  const scored = live
    .map((tool) => {
      const name = `${tool.name} ${tool.shortName ?? ''}`.toLowerCase();
      const rest = `${tool.description} ${KEYWORDS[tool.path] ?? ''} ${tool.path} ${TOOL_CATEGORIES.find((c) => c.id === tool.category)?.label ?? ''}`.toLowerCase();
      if (!words.every((w) => name.includes(w) || rest.includes(w))) return null;
      const score = words.reduce((sum, w) => sum + (name.startsWith(w) ? 4 : name.includes(w) ? 2 : 1), 0);
      return { tool, score };
    })
    .filter((x): x is { tool: ToolInfo; score: number } => x !== null);
  return scored.sort((a, b) => b.score - a.score).map((x) => x.tool);
}
