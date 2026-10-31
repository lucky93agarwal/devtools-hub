import { ToolContent } from '../../shared/tool-info/tool-info';

export const SQL_SAMPLE =
  "select o.id, o.created_at, c.name as customer, sum(i.qty * i.price) as total from orders o join customers c on " +
  "c.id = o.customer_id left join order_items i on i.order_id = o.id where o.status in ('paid', 'shipped') and " +
  "o.created_at >= '2026-01-01' group by o.id, o.created_at, c.name having sum(i.qty * i.price) > 100 order by " +
  'total desc limit 20;';

export const SQL_CONTENT: ToolContent = {
  aboutHeading: 'About this SQL formatter',
  about:
    'Queries copied from logs, ORMs and query builders often arrive as one long line. This formatter puts each ' +
    'clause on its own line with consistent indentation, so joins, conditions and groupings are easy to read and ' +
    'review. It understands the syntax of MySQL, MariaDB, PostgreSQL, SQLite, SQL Server, Oracle PL/SQL, BigQuery, ' +
    'Snowflake, Redshift, Spark, Trino, DuckDB and more. You can also collapse a formatted query back to one line ' +
    'for a log message or a string in code.',
  steps: [
    'Choose your database so its keywords and syntax are recognised.',
    'Paste a query or several queries separated by semicolons, or try the sample.',
    'Pick uppercase or lowercase keywords and the indent.',
    'Copy or download the result, or switch to One line to compact it.',
  ],
  faq: [
    {
      question: 'Does formatting change what my query does?',
      answer:
        'No. Only spaces, line breaks and, if you choose, the case of keywords change. Table and column names, ' +
        'strings and numbers stay exactly as written.',
    },
    {
      question: 'Why does it say the query cannot be read?',
      answer:
        'Each database has its own syntax, such as backticks in MySQL or square brackets in SQL Server. Choose the ' +
        'matching database. Unbalanced brackets or quotes also cause this.',
    },
    {
      question: 'Is my SQL sent to a server?',
      answer: 'No. Queries are formatted in your browser, so table names and data in them stay private.',
    },
    {
      question: 'Can it format stored procedures?',
      answer:
        'It formats most procedural code in PL/SQL, T-SQL and PostgreSQL, but very long procedures with dynamic SQL ' +
        'may need some manual tidying.',
    },
  ],
};
