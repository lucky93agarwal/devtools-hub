/** The building blocks of a guide's text. `code` spans in text are written with backticks. */
export type Block =
  | { h: string }
  | { p: string }
  | { ul: string[] }
  | { ol: string[] }
  | { code: string }
  | { table: { head: string[]; rows: string[][] } }
  | { note: string };

export interface Article {
  /** The opening paragraph, shown larger under the title. */
  intro: string;
  body: Block[];
}
