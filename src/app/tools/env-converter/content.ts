import { ToolContent } from '../../shared/tool-info/tool-info';

export const ENV_SAMPLE = `# Shop API
APP_NAME="Shop API"
PORT=8080
DATABASE_URL=postgres://shop:secret@db:5432/shop
REDIS_URL=redis://cache:6379 # cache
FEATURE_FLAGS='search,checkout'
WELCOME_MESSAGE="Hello!\\nThanks for shopping."
PORT=9090
`;

export const OBJECT_SAMPLE = `{
  "appName": "Shop API",
  "port": 8080,
  "database": { "host": "db", "port": 5432, "user": "shop" },
  "features": ["search", "checkout"],
  "debug": false
}
`;

export const ENV_CONTENT: ToolContent = {
  aboutHeading: 'About this .env converter',
  about:
    'Environment variables move between many formats: a .env file for local development, a JSON or YAML config, ' +
    'docker-compose.yml, Kubernetes ConfigMaps and Secrets, and shell scripts. Paste a .env file to convert it, ' +
    'with quotes, escapes, multi-line values, export prefixes and inline comments read the way the dotenv library ' +
    'reads them. Duplicate names and lines that cannot be read are listed with their line numbers. You can also ' +
    'turn a JSON or YAML object into .env lines, with nested keys flattened into names such as DATABASE_HOST.',
  steps: [
    'Choose the direction: from a .env file, or from JSON or YAML.',
    'Paste the file or try the sample.',
    'Pick the output: JSON, YAML, shell export lines, Docker Compose, or a Kubernetes ConfigMap or Secret.',
    'Fix any lines listed as problems, then copy or download the result.',
  ],
  faq: [
    {
      question: 'Is it safe to paste real secrets?',
      answer:
        'The conversion runs in your browser and nothing is sent or stored. Still, prefer test values when you can, ' +
        'and never commit real .env files to Git.',
    },
    {
      question: 'Are values in a Kubernetes Secret encrypted?',
      answer:
        'No. Secret values are only Base64 encoded, which anyone can decode. Protect them with RBAC and encryption at ' +
        'rest, or use a tool such as Sealed Secrets or an external secrets manager.',
    },
    {
      question: 'When do I need quotes in a .env file?',
      answer:
        'When the value has spaces, a #, or quotes, or spans several lines. Double quotes understand \\n escapes; ' +
        'single quotes keep everything exactly as written.',
    },
    {
      question: 'Are ${VARIABLE} references expanded?',
      answer:
        'No. They are kept as written, because expansion differs between tools such as dotenv-expand, Docker Compose ' +
        'and shells.',
    },
  ],
};
