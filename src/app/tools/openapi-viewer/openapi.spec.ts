import { parseSpec } from './openapi';

const SPEC = `openapi: 3.0.3
info: { title: Shop API, version: 1.2.0 }
servers: [{ url: https://api.shop.test/v1 }]
paths:
  /orders/{orderId}:
    parameters:
      - { name: orderId, in: path, required: true, schema: { type: string } }
    get:
      operationId: getOrder
      tags: [Orders]
      summary: Get one order
      responses: { '200': { description: The order }, '404': { description: Not found } }
  /orders:
    post:
      operationId: createOrder
      tags: [Orders]
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/NewOrder' }
      responses: { '201': { description: Created } }
  /users/{id}:
    get:
      operationId: getOrder
      responses: {}
components:
  schemas:
    NewOrder:
      type: object
      properties:
        sku: { type: string, example: BK-1 }
        qty: { type: integer, minimum: 1 }
        customer: { $ref: '#/components/schemas/Missing' }
`;

describe('parseSpec', () => {
  it('lists operations with parameters, responses and a sample cURL', () => {
    const r = parseSpec(SPEC);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.spec).toMatchObject({ version: 'OpenAPI 3.0.3', title: 'Shop API', apiVersion: '1.2.0', servers: ['https://api.shop.test/v1'], schemas: ['NewOrder'] });
    const get = r.spec.operations[0];
    expect(get).toMatchObject({ method: 'GET', path: '/orders/{orderId}', tag: 'Orders', params: [{ name: 'orderId', in: 'path', required: true, type: 'string', description: '' }] });
    expect(get.responses.map((x) => x.code)).toEqual(['200', '404']);
    const post = r.spec.operations[1];
    expect(post.curl).toContain(`curl -X POST 'https://api.shop.test/v1/orders'`);
    expect(post.curl).toContain('"sku": "BK-1"');
    expect(post.curl).toContain('"qty": 1');
  });

  it('finds broken refs, duplicate ids, undeclared path parameters and missing responses', () => {
    const r = parseSpec(SPEC);
    if (!r.ok) throw new Error();
    const messages = r.spec.issues.map((i) => i.message);
    expect(messages).toContain('#/components/schemas/Missing (used at #/components/schemas/NewOrder/properties/customer) does not exist.');
    expect(messages).toContain('GET /users/{id}: the path parameter {id} is not declared.');
    expect(messages).toContain('GET /users/{id} has no responses.');
    expect(messages).toContain('operationId “getOrder” is used 2 times; it must be unique.');
  });

  it('reads Swagger 2.0 and refuses other documents', () => {
    const r = parseSpec('swagger: "2.0"\ninfo: {title: Old, version: "1"}\nhost: api.old.test\nbasePath: /v2\nschemes: [https]\npaths:\n  /ping:\n    get:\n      responses: {"200": {description: ok}}\n');
    expect(r.ok && r.spec.servers).toEqual(['https://api.old.test/v2']);
    expect(r.ok && r.spec.version).toBe('Swagger 2.0');
    expect(parseSpec('name: not an api')).toMatchObject({ ok: false });
    expect(parseSpec('a: [')).toMatchObject({ ok: false });
  });
});
