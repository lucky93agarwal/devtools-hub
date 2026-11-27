-- Notes can be plain text (links and ```code``` are found when shown) or formatted text: a small,
-- strictly allowed set of HTML tags for bold, italic, underline, text colour and highlight.
ALTER TABLE notes ADD COLUMN format TEXT NOT NULL DEFAULT 'text';
