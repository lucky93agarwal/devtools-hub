// A real bundle made with esbuild --minify --sourcemap from a small cart.ts, used by the tests and the page's sample.
export const SAMPLE_TRACE = `TypeError: Cannot read properties of undefined (reading 'reduce')
    at r (https://shop.example.com/main-ABC123.js:1:30)
    at u (https://shop.example.com/main-ABC123.js:1:90)
    at https://shop.example.com/main-ABC123.js:1:103`;

export const SAMPLE_MAP = "{\n  \"version\": 3,\n  \"sources\": [\"cart.ts\"],\n  \"sourcesContent\": [\"interface Item { price: number; qty: number }\\n\\nexport function total(items: Item[]): number {\\n  return items.reduce((sum, item) => sum + item.price * item.qty, 0);\\n}\\n\\nexport function checkout(cart: { items?: Item[] }): string {\\n  const amount = total(cart.items!);\\n  return `Pay ${amount}`;\\n}\\n\\ncheckout({});\\n\"],\n  \"mappings\": \"MAEO,SAASA,EAAMC,EAAuB,CAC3C,OAAOA,EAAM,OAAO,CAACC,EAAKC,IAASD,EAAMC,EAAK,MAAQA,EAAK,IAAK,CAAC,CACnE,CAEO,SAASC,EAASC,EAAkC,CAEzD,MAAO,OADQL,EAAMK,EAAK,KAAM,CACZ,EACtB,CAEAD,EAAS,CAAC,CAAC\",\n  \"names\": [\"total\", \"items\", \"sum\", \"item\", \"checkout\", \"cart\"]\n}";
