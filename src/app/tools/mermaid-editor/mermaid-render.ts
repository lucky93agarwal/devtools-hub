/** Mermaid diagrams to SVG, with the library loaded only on this page. */

let lib: Promise<typeof import('mermaid')['default']> | undefined;
let counter = 0;

export type RenderResult = { ok: true; svg: string } | { ok: false; error: string };

export async function renderDiagram(code: string, dark: boolean): Promise<RenderResult> {
  const mermaid = await (lib ??= import('mermaid').then((m) => m.default));
  // "strict" keeps diagrams from running scripts or loading remote content.
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, flowchart: { htmlLabels: false }, theme: dark ? 'dark' : 'default', fontFamily: 'Inter Variable, system-ui, sans-serif' });
  try {
    await mermaid.parse(code);
    const { svg } = await mermaid.render(`mermaid-${++counter}`, code);
    return { ok: true, svg };
  } catch (error) {
    // Mermaid leaves an error element behind in the page when rendering fails.
    document.getElementById(`dmermaid-${counter}`)?.remove();
    return { ok: false, error: String((error as Error).message ?? error).split('\n').slice(0, 4).join('\n') };
  }
}

export const MERMAID_SAMPLES: { label: string; code: string }[] = [
  {
    label: 'Flowchart',
    code: `flowchart LR
    A[User opens app] --> B{Logged in?}
    B -- Yes --> C[Home screen]
    B -- No --> D[Login screen]
    D --> E[POST /auth/login]
    E -->|200| C
    E -->|401| D`,
  },
  {
    label: 'Sequence',
    code: `sequenceDiagram
    participant App
    participant API
    participant DB
    App->>API: POST /orders
    API->>DB: INSERT order
    DB-->>API: id = 42
    API-->>App: 201 Created
    Note over App,API: JWT in Authorization header`,
  },
  {
    label: 'Class',
    code: `classDiagram
    class Order {
      +String id
      +List~Item~ items
      +total() Double
    }
    class Item {
      +String sku
      +Int qty
    }
    Order "1" --> "*" Item`,
  },
  {
    label: 'ER (database)',
    code: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ ORDER_ITEM : contains
    PRODUCT ||--o{ ORDER_ITEM : "is in"
    CUSTOMER { int id PK
      string email }
    ORDER { int id PK
      int customer_id FK }`,
  },
  {
    label: 'State',
    code: `stateDiagram-v2
    [*] --> Pending
    Pending --> Paid: payment ok
    Pending --> Cancelled: timeout
    Paid --> Shipped
    Shipped --> [*]`,
  },
  {
    label: 'Gantt',
    code: `gantt
    title Release 2.4
    dateFormat YYYY-MM-DD
    section Build
    API work      :a1, 2026-11-02, 5d
    App screens   :after a1, 7d
    section Ship
    Testing       :2026-11-14, 4d
    Store review  :2026-11-18, 3d`,
  },
];
