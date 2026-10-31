/** JetBrains' Kotlin Playground ships without types; only the default export is used. */
declare module 'kotlin-playground' {
  const playground: (target: Element, options?: { onChange?: (code: string) => void }) => Promise<unknown>;
  export default playground;
}
