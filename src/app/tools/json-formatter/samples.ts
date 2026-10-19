/** Sample inputs so visitors can try the tool without their own JSON. */
export const JSON_SAMPLES = {
  valid: JSON.stringify({
    name: 'DevTools24',
    version: 1,
    free: true,
    tools: ['JSON formatter', 'JSON compare', 'Image converter', 'JWT decoder'],
    limits: { imagesPerBatch: 15, maxImageMb: 20 },
    owner: null,
  }),
  broken: `{
  "name": "DevTools24",
  "version": 1
  "tools": ["JSON formatter", "JSON compare",],
  "free": true
}`,
} as const;
