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
  /** An API response whose fields hold JSON as strings, one inside another. */
  nested: JSON.stringify({
    event: 'order.created',
    id: 'evt_1042',
    payload: JSON.stringify({
      orderId: 1042,
      customer: { name: 'Ada', city: 'Pune' },
      items: [
        { sku: 'KB-01', qty: 1, price: 2499.0 },
        { sku: 'MS-07', qty: 2, price: 799.5 },
      ],
      meta: JSON.stringify({ source: 'mobile', coupon: null }),
    }),
    tags: '["new","priority"]',
    note: 'Plain text stays a string.',
  }),
  /** One whole JSON document saved as a JSON string, as logs and queues often show it. */
  stringified: JSON.stringify(
    JSON.stringify({ name: 'DevTools24', free: true, tools: ['JSON formatter', 'JWT decoder'], limits: { maxImageMb: 20 } }),
  ),
} as const;
