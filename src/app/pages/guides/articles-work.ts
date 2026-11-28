import { Article } from './article';

/** Guides for the PDF, JasperReports, workspace and scheduling tools. */
export const WORK_ARTICLES: Record<string, Article> = {
  'compress-pdf-under-1mb': {
    intro:
      'Job portals, government forms and many company HR systems still accept only small files, often 1 MB or 2 MB. A scanned certificate or a report full of screenshots easily weighs 5 to 20 MB. This guide explains why some PDFs are big, which compression method fits which file, and how to reach a target size without making the text unreadable.',
    body: [
      {
        h: 'Why is my PDF so big?',
      },
      {
        p: 'A PDF is a container. Text, fonts, vector drawings and images are stored inside it as separate objects. Text and vector graphics are tiny: a 50-page text-only contract is usually under 500 KB. Almost all the weight comes from images, and scans are nothing but images: every page is a photograph of paper.',
      },
      {
        p: "Two numbers decide an image's size: its resolution (how many pixels) and how strongly it is compressed. A phone scan saved at 300 DPI in colour can be 2 to 4 MB per page. The same page at 100 DPI in JPEG quality 60 is often 100 to 200 KB and is still comfortable to read on screen.",
      },
      {
        h: 'Method 1: lossless clean-up (keeps text selectable)',
      },
      {
        p: 'Some PDFs are larger than they need to be because of how they were written: duplicated objects, uncompressed streams or old cross-reference tables. Rewriting the file with object streams packs these together without changing what you see. Text stays selectable and searchable.',
      },
      {
        p: 'Expect 0 to 20% savings. It is the right first try for text-heavy documents such as resumes exported from Word, invoices and reports.',
      },
      {
        ol: [
          'Open the Compress PDF tool and drop your file.',
          'Keep the level on "Light (keeps text)".',
          'Compare the before and after size; if it is already below your limit, you are done.',
        ],
      },
      {
        h: 'Method 2: redraw pages as JPEG (for scans and image-heavy files)',
      },
      {
        p: 'When a PDF is made of scans or photos, the only way to make it much smaller is to reduce the image data. The strong mode draws each page at the resolution you choose and stores it as a JPEG. This usually cuts scanned documents by 70 to 90%.',
      },
      {
        p: 'The trade-off: the text becomes part of the picture, so it can no longer be selected or searched. For certificates, ID proofs and signed letters that is usually fine; for contracts you need to search later, keep the original as well.',
      },
      {
        ul: [
          '72 DPI, quality 50: smallest; fine for previews, borderline for small print.',
          '100 DPI, quality 60: the best default for upload forms; normal text stays sharp on screen.',
          '150 DPI, quality 75: when the document has small print, tables or signatures that must stay clear.',
        ],
      },
      {
        h: 'Reaching an exact limit such as 1 MB',
      },
      {
        ol: [
          'Start with strong mode at 100 DPI and 60% quality.',
          'If the result is still too big, try 72 DPI before lowering quality below 50; very low JPEG quality creates blocky artefacts around letters.',
          'If only a few pages matter, use Split PDF to keep just those pages, then compress.',
          'For a 20-page scan with a 1 MB limit, aim for about 50 KB per page: 72 to 100 DPI in greyscale-looking documents usually gets there.',
        ],
      },
      {
        h: 'Privacy: does the file leave your computer?',
      },
      {
        p: 'Many online compressors upload your PDF to a server. That is a real risk for Aadhaar cards, bank statements and salary slips. The DevTools24 compressor runs entirely in your browser using pdf-lib and pdf.js: the file is read, redrawn and saved on your own device and is never uploaded.',
      },
      {
        h: 'Quick checklist',
      },
      {
        ul: [
          'Text-only PDF: Light mode; if still big, check for embedded images or fonts.',
          'Scanned PDF: Strong mode, 100 DPI, quality 60.',
          'Must stay searchable: Light mode, or remove unnecessary pages instead.',
          'Always open the result and zoom to 100% before you upload it.',
        ],
      },
    ],
  },
  'test-file-upload-size-limits': {
    intro:
      'Almost every app has an upload limit, and almost every upload limit has an off-by-one bug somewhere. The UI says 5 MB, the backend rejects at 5,000,000 bytes, Nginx rejects at 1 MB and the error message is a blank 413 page. This guide shows how to test limits precisely with files of an exact size.',
    body: [
      {
        h: 'MB or MiB? Decide what your limit really is',
      },
      {
        p: 'One megabyte (MB) is 1,000,000 bytes. One mebibyte (MiB) is 1,048,576 bytes. Operating systems, browsers and frameworks disagree about which one "MB" means: Windows Explorer shows MiB but calls them MB, macOS Finder uses real MB, Spring\'s DataSize.ofMegabytes() uses MiB, and many JavaScript validators simply compare against 5 * 1024 * 1024.',
      },
      {
        p: 'Before testing, write down the limit in bytes for every layer. Then you know exactly which file should pass and which should fail.',
      },
      {
        code: 'Limit "5 MB" can mean:\n  5,000,000 bytes  (decimal, MB)\n  5,242,880 bytes  (binary, MiB)\nDifference: 242,880 bytes (about 237 KB)',
      },
      {
        h: 'The boundary tests you need',
      },
      {
        ul: [
          'Exactly at the limit (for example 5,242,880 bytes): should usually pass.',
          'One byte over the limit: must fail with a clear message.',
          'Just under the limit with a slow connection: the request must not time out.',
          'An empty file (0 bytes) and a 1-page file: both should give sensible results.',
          'A file far over the limit (for example 50 MB): the server should reject it early, without reading the whole body.',
        ],
      },
      {
        h: 'Making files of an exact size',
      },
      {
        p: 'Renaming a random file to .pdf is not a fair test: many servers check the real file type, and some preview components try to open it. The Dummy PDF Generator makes a valid PDF with real pages of text and tables, then pads it with random data in an unused object until it hits the size you choose to the byte. PDF viewers ignore the padding, so the file opens normally.',
      },
      {
        ol: [
          'Open the Dummy PDF Generator.',
          'Choose the number of pages (more pages also test page-count limits).',
          'Pick a preset such as 5 MiB (5,242,880 bytes), or enter a custom size.',
          'Generate one file at the limit and one just above it, and keep them in your test fixtures.',
        ],
      },
      {
        h: 'Every layer has its own limit',
      },
      {
        ul: [
          'Browser / UI: a size check in JavaScript before upload. Good for user feedback, never for security.',
          'Reverse proxy: Nginx client_max_body_size (default 1 MB!), Cloudflare (100 MB on free plans), AWS ALB.',
          'Application server: Spring multipart.max-file-size and max-request-size, Express body-parser limit, PHP upload_max_filesize and post_max_size.',
          'Storage: S3 presigned URL policy conditions, database column sizes for BLOBs.',
        ],
      },
      {
        p: 'A common bug: the UI allows 10 MB, the app allows 10 MB, but Nginx still has the 1 MB default, so users see a raw "413 Request Entity Too Large" page. Test through the real proxy, not only against localhost.',
      },
      {
        h: 'Do not forget the page count and the file type',
      },
      {
        p: 'Size is not the only limit. Many systems also cap the number of pages (an e-signature service may accept 100 pages at most) or check that the file really is a PDF by reading its first bytes, %PDF-, instead of trusting the .pdf extension. Generate a 1-page and a 500-page file of the same size to see whether the page count matters, and try a text file renamed to .pdf to check that the type check works.',
      },
      {
        h: 'What a good error looks like',
      },
      {
        p: 'The user should learn three things: the file is too big, what the limit is, and what to do (compress it or split it). "Upload failed" or an HTTP status code alone is not enough. Link to a compressor or explain how to reduce the size.',
      },
    ],
  },
  'jasperreports-page-x-of-y-and-blank-pages': {
    intro:
      'Three questions come up again and again when building JasperReports templates: how do I print "Page 1 of 5", why is my total empty or wrong, and why does the report print blank pages? All three come from the way JasperReports fills bands. Once you understand evaluation time and band height, they are easy to fix.',
    body: [
      {
        h: 'How JasperReports fills a page',
      },
      {
        p: 'A report is a stack of bands: title (first page only), page header and column header (every page), detail (once per record), column footer and page footer (every page), and summary (once, at the end). The engine fills the page top to bottom. When the next detail band does not fit above the footers, it closes the page and starts a new one.',
      },
      {
        p: 'Every text field is evaluated at a moment called its evaluation time. By default that moment is "Now": the value is computed when the band is placed. That is why a total placed in the title is empty: no record has been read yet.',
      },
      {
        h: 'Page X of Y',
      },
      {
        p: 'When the page footer of page 1 is filled, the engine does not yet know how many pages there will be. The standard trick uses two text fields: the first prints "Page 1 of" now, the second is evaluated at the end of the report, when $V{PAGE_NUMBER} holds the last page number.',
      },
      {
        code: '<textField>\n  <reportElement x="355" y="0" width="150" height="20"/>\n  <textElement textAlignment="Right"/>\n  <textFieldExpression><![CDATA["Page " + $V{PAGE_NUMBER} + " of"]]></textFieldExpression>\n</textField>\n<textField evaluationTime="Report">\n  <reportElement x="505" y="0" width="50" height="20"/>\n  <textFieldExpression><![CDATA[" " + $V{PAGE_NUMBER}]]></textFieldExpression>\n</textField>',
      },
      {
        p: 'Do not put both parts in one expression: a single field can have only one evaluation time, so you would get either "Page 1 of 1" on every page or the total everywhere.',
      },
      {
        h: 'Totals that are empty or wrong',
      },
      {
        ul: [
          'Declare a variable with calculation="Sum" and variableExpression $F{amount}. Show it in the summary band, or anywhere with evaluationTime="Report".',
          'Use java.math.BigDecimal for money. Double adds rounding errors (0.1 + 0.2 = 0.30000000000000004).',
          'For a total per group (per customer, per month), set resetType="Group" and resetGroup on the variable.',
          'If the total shows "null", the field class and the data do not match, or the variable class is narrower than the values.',
        ],
      },
      {
        h: 'Why does my report print blank pages?',
      },
      {
        p: 'Blank or extra pages almost always mean that something is taller or wider than the space available. JasperReports then pushes content to the next page, sometimes leaving an empty page behind.',
      },
      {
        ul: [
          'A band is taller than the page height minus the top and bottom margins.',
          'An element extends below its band (y + height greater than the band height).',
          'An element is wider than the column width (x + width greater than columnWidth), common after changing margins or orientation.',
          'The summary band does not fit on the last page: set isSummaryNewPage="false" and make it smaller, or accept a new page.',
          'Page header + column header + footers + one detail row together exceed the page.',
          'A subreport with isRunToBottom="true" or a frame that stretches.',
        ],
      },
      {
        p: 'The JRXML Debugger checks all of these and shows the line number and a suggested fix for each. The previewer then shows the result with sample data.',
      },
      {
        h: 'A quick debugging routine',
      },
      {
        ol: [
          'Paste the .jrxml into the debugger and fix every error, starting with XML and missing declarations.',
          'Check that pageWidth - leftMargin - rightMargin equals columnWidth.',
          'Preview with 1 record, then with enough records to fill three pages.',
          'Confirm the column header repeats on page 2, the footer shows the right page count and the total appears once at the end.',
        ],
      },
    ],
  },
  'jasperreports-json-data-source': {
    intro:
      'More and more reports are built from REST APIs instead of SQL. JasperReports reads JSON well, but the mapping between JSON keys and report fields trips up almost everyone the first time. This guide walks through a typical invoice payload.',
    body: [
      {
        h: 'The example payload',
      },
      {
        code: '{\n  "invoiceNo": "INV-2026-0042",\n  "customer": { "name": "Asha Rao", "city": "Lucknow" },\n  "items": [\n    { "product": "Website design", "qty": 1, "unitPrice": 25000.00 },\n    { "product": "Hosting", "qty": 12, "unitPrice": 500.00 }\n  ]\n}',
      },
      {
        h: 'Fields and fieldDescription',
      },
      {
        p: 'With a JsonDataSource, each <field> reads a value through its fieldDescription, a path into the current JSON record. The field name is what you use in expressions ($F{customerCity}); the description is where the value comes from (customer.city). If you leave the description out, the field name itself is used as the path.',
      },
      {
        code: '<field name="customerCity" class="java.lang.String">\n  <fieldDescription><![CDATA[customer.city]]></fieldDescription>\n</field>',
      },
      {
        p: 'The Field Mapper creates these declarations from a sample payload, with Java classes chosen from the values (BigDecimal for prices, Date for ISO dates).',
      },
      {
        h: 'Choosing the records: the select expression',
      },
      {
        p: 'A JsonDataSource walks over the records selected by an expression. For the payload above, the detail band should repeat once per item, so the select expression is "items". The top-level invoiceNo and customer are not records; pass them as parameters, or read them in a parent report.',
      },
      {
        code: 'JsonDataSource ds = new JsonDataSource(inputStream, "items");\nMap<String, Object> params = new HashMap<>();\nparams.put("invoiceNo", payload.getInvoiceNo());\nJasperFillManager.fillReport(jasperReport, params, ds);',
      },
      {
        h: 'Lists inside a record: subDataSource',
      },
      {
        p: 'When each record contains its own list (an order with line items, an employee with skills), use a table component or a subreport with a data source made from that list:',
      },
      {
        code: '<dataSourceExpression><![CDATA[((net.sf.jasperreports.engine.data.JsonDataSource) $P{REPORT_DATA_SOURCE}).subDataSource("items")]]></dataSourceExpression>',
      },
      {
        p: 'The Snippet Builder generates the complete table or subreport XML, with a repeating header row.',
      },
      {
        h: 'Dates and numbers',
      },
      {
        ul: [
          'JSON has no date type. Declare the field as java.util.Date and set the property net.sf.jasperreports.json.date.pattern to yyyy-MM-dd, or keep it as a String and format it in an expression.',
          'Set net.sf.jasperreports.json.number.pattern when numbers arrive as strings with separators.',
          'Use pattern="#,##0.00" on the text field for display instead of formatting in the expression.',
        ],
      },
      {
        h: 'Header values: parameters or a parent report',
      },
      {
        p: 'An invoice needs values that appear once (invoice number, customer name) and values that repeat (line items). There are two clean ways to combine them. The first is the one shown above: the items are the data source and the single values are passed as parameters, which you print with $P{invoiceNo}. It is simple and works well when your Java or Spring code already has the payload as an object.',
      },
      {
        p: 'The second keeps the whole JSON in one data source whose select expression returns the single top-level object. The main report prints the header fields from that record, and a table or subreport walks over items with subDataSource. This is the better choice when the template must work with any payload without code changes, for example when business users design reports in Jaspersoft Studio.',
      },
      {
        h: 'Typical errors and what they mean',
      },
      {
        ul: [
          'All fields are empty: the select expression points at the wrong level, so each record does not contain the keys you expect.',
          'Only the first item is printed: the list is read as a single field instead of being used as the data source.',
          'ClassCastException on a number field: the JSON value is a string ("25000.00") while the field class is BigDecimal, or the other way round.',
          'Dates print as long numbers or fail to parse: set the date pattern property, or keep the field as a String.',
          'Field names with dots or spaces: wrap them in the path, or rename the key in your API, since they confuse the expression syntax.',
        ],
      },
      {
        h: 'Checking the mapping without a server',
      },
      {
        ol: [
          'Generate declarations with the Field Mapper and paste them into the template.',
          'Open the previewer, paste the template and the JSON array of records, and check every column.',
          'Fields that show empty usually have a path that does not match the JSON keys (they are case-sensitive).',
        ],
      },
    ],
  },
  'professional-email-from-hinglish-notes': {
    intro:
      'Many developers in India think in a mix of Hindi and English and type notes like "sir kal deployment ho gaya kya, testing start karni hai". Turning that into a clear message for a manager or client takes time, especially when the tone needs to be just right. This guide gives a simple structure and examples you can reuse.',
    body: [
      {
        h: 'A structure that works for almost every message',
      },
      {
        p: 'Keep one topic per message. Two unrelated requests in one email usually means one of them gets ignored.',
      },
      {
        ol: [
          'Context in one line: what this is about (ticket, release, meeting).',
          'The point: what happened or what you need.',
          'The ask: one clear request, with a time if it matters.',
          'Close: thanks, or what you will do next.',
        ],
      },
      {
        h: 'Email or chat?',
      },
      {
        ul: [
          'Email: decisions, approvals, leave, anything that needs a record. Use a specific subject ("UAT sign-off for release 2.4", not "Update").',
          'Slack, Teams or WhatsApp: quick questions, status, coordination. Skip formal greetings and sign-offs, keep it to a few lines.',
        ],
      },
      {
        h: 'Example: from note to message',
      },
      {
        code: "Note:\n  sir kal ka deployment ho gaya kya? testing start karni hai,\n  backend MR merge kar dena pls aur staging pe deploy kar dena\n\nChat message:\n  Hi Sir, could you please confirm whether yesterday's deployment\n  is done? QA is ready to start testing. Also, please merge the\n  backend MR and deploy it to staging when you get a moment.\n  Thanks!",
      },
      {
        h: 'Tone: formal, crisp or polite',
      },
      {
        ul: [
          'Formal: client emails, escalations, HR. Full sentences, no slang.',
          'Crisp and direct: busy managers, incident channels. Short sentences, the ask first.',
          'Polite: requests to seniors or other teams. "Could you please…", "when you get a moment", and a thank-you.',
        ],
      },
      {
        p: 'Avoid "do the needful", "revert back" and "kindly do it ASAP": they read as rushed or unclear to many international colleagues. Say exactly what you need and by when.',
      },
      {
        h: 'Replying to your manager',
      },
      {
        p: 'When a message asks for something, a good reply does one of three things: confirms with a time ("Yes, I will share it by 5 PM"), asks the one question that blocks you, or explains a constraint and offers an alternative. Saying nothing for hours is the worst option.',
      },
      {
        h: 'Phrases that help, and their replacements',
      },
      {
        ul: [
          'Instead of "Please do the needful": "Could you please approve the request by Friday?"',
          'Instead of "I am having a doubt": "I have a question about the login flow."',
          'Instead of "Revert back to me": "Please reply when you have a moment."',
          'Instead of "PFA": "Please find the report attached." (or simply "I have attached the report.")',
          'Instead of "Kindly update the status ASAP": "Could you share the status by 3 PM today? The client call is at 4."',
          'Instead of "Same to you" in reply to a long message: thank the person for the specific thing they did.',
        ],
      },
      {
        p: 'Read the message once more before sending: check names, dates and attachments, and make sure the ask is in the first two lines, because many people read only the preview on their phone.',
      },
      {
        p: 'Giving a reason with a deadline ("the client call is at 4") makes the request feel fair rather than demanding, and people are far more likely to act on it in time.',
      },
      {
        h: 'Doing it faster',
      },
      {
        p: "The Message Assistant turns rough or Hinglish notes into a polished email or chat message in the tone you choose, suggests three replies to a message you received, and has ready templates for stand-ups, EOD reports, leave, WFH, merge request and deployment requests, bug reports, delays and clarifications. Save your manager's name and your signature once, and every message fills them in.",
      },
    ],
  },
  'merge-request-review-and-deploy-message': {
    intro:
      'In many teams a feature is not "done" until someone else reviews the merge requests, merges them and deploys to a test environment. A vague "please check my MR" message often waits for hours. A clear request, with every link, the repository and the target environment, gets handled much faster.',
    body: [
      {
        h: 'What reviewers need in one message',
      },
      {
        ul: [
          'The ticket ID and title, or the bug name when there is no ticket.',
          'Every merge request link, grouped by backend and UI.',
          'The repository name before each link, so nobody has to open it to know what it is.',
          'Where it should be deployed (QA, UAT, staging) and when.',
          'What happens next: who tests, and that you are waiting for confirmation.',
        ],
      },
      {
        h: 'Template for several tickets',
      },
      {
        code: 'Hi Ravi,\n\nThe following merge requests are ready:\n\n1. JIRA-210: Refund status\n   Backend:\n   - [payments-api] - https://git.example.com/payments-api/-/merge_requests/481\n   UI:\n   - [web-app] - https://git.example.com/web-app/-/merge_requests/1290\n\n2. Bug: Date filter crash\n   Backend:\n   - [reports-service] - https://git.example.com/reports/-/merge_requests/77\n\nCould you please review and merge them, and deploy to UAT on 28 Nov 2026?\nPlease let me know once the deployment is done so that testing can begin.\n\nThank you!',
      },
      {
        h: 'Small habits that save a day',
      },
      {
        ul: [
          'Link merge requests that must go together (database migration first, then the API, then the UI) and say so.',
          'Mention breaking changes or new environment variables explicitly.',
          'If CI is red for an unrelated reason, say so up front.',
          'After deployment, reply in the same thread when testing starts, so the history stays in one place.',
        ],
      },
      {
        h: 'One ticket, one repository: the short version',
      },
      {
        p: 'Not every request needs a numbered list. When there is a single change in a single repository, a two-line chat message is best. Put the link on its own line so it can be clicked easily on a phone, and keep the ask in the first sentence.',
      },
      {
        code: 'Hi Ravi, JIRA-214 (export button) is ready for review:\n[web-app] - https://git.example.com/web-app/-/merge_requests/1302\nCould you please merge it and deploy to QA today? Thanks!',
      },
      {
        h: 'Following up without sounding pushy',
      },
      {
        p: 'If there is no answer after a few hours, reply in the same thread rather than starting a new message, so the reviewer sees all the context in one place. Mention the reason the timing matters, and offer help instead of repeating the request.',
      },
      {
        ul: [
          'Good: "Hi Ravi, gentle reminder on the MRs above. QA would like to start testing tomorrow morning. Happy to walk you through the changes if that helps."',
          'Avoid: "Any update??" or tagging the whole team without a reason.',
          'If a reviewer asked for changes, reply with what you changed and the new commit, so they do not have to re-read everything.',
          'When a deadline is at risk, tell your lead early and say which merge request is blocking, instead of waiting for the end of the day.',
        ],
      },
      {
        h: 'Bug fixes without a ticket',
      },
      {
        p: 'Hotfixes found during testing often have no ticket. Give the bug a short, descriptive name ("Date filter crash on empty range"), say where it was seen and how it was verified. Reviewers trust a fix more when they know how to reproduce the original problem, and the name becomes a useful search term in the merge request history later.',
      },
      {
        h: 'Generate it in seconds',
      },
      {
        p: 'The "MR review, merge and deploy request" template in the Message Assistant lets you add several tickets or bugs, several backend and UI merge requests for each, with a repository dropdown that remembers your repositories, plus the environment and date. It writes the message above for you, as an email or a chat message.',
      },
    ],
  },
  'printable-invoice-html-css': {
    intro:
      'Generating invoices, receipts and reports as HTML is convenient: your team already knows HTML and CSS, and templating is easy. Printing them well is another matter. Pages break in the middle of a row, margins differ between browsers and the header disappears on page two. These CSS rules fix most of it.',
    body: [
      {
        h: 'Set the page size and margins',
      },
      {
        code: '@page {\n  size: A4;          /* or Letter, or 210mm 297mm */\n  margin: 15mm 12mm;\n}\nbody { margin: 0; }',
      },
      {
        p: 'Use millimetres or points for print, not pixels. Browsers map 96 CSS pixels to one inch, so an A4 page is about 794 × 1123 px.',
      },
      {
        h: 'Control page breaks',
      },
      {
        code: '.invoice-section { break-inside: avoid; }   /* keep a block together */\n.new-page { break-before: page; }           /* start on a new page */\ntr { break-inside: avoid; }                  /* never split a table row */\nh2 { break-after: avoid; }                   /* keep headings with their text */',
      },
      {
        p: 'Older engines need the page-break-before / page-break-inside versions as well.',
      },
      {
        h: 'Repeat table headers on every page',
      },
      {
        p: 'Put the header row in <thead> and the totals in <tfoot>. Browsers repeat <thead> at the top of each printed page automatically. Without <thead>, the column names appear only on page one.',
      },
      {
        h: 'Fonts, colours and backgrounds',
      },
      {
        ul: [
          'Browsers skip background colours when printing unless you add print-color-adjust: exact (and -webkit-print-color-adjust: exact).',
          'Use web fonts that support your currency symbols; ₹ is missing from some older fonts.',
          'Keep body text at 10 to 12 pt; light grey text below 9 pt often disappears on office printers.',
        ],
      },
      {
        h: 'From HTML to PDF',
      },
      {
        p: 'For selectable, sharp text use the browser\'s print dialog and "Save as PDF". In code, headless Chrome (Puppeteer or Playwright page.pdf()) gives the same result on a server. For a quick check while designing, the HTML to PDF tool previews your snippet on a real A4 or Letter page with your margins and saves it as PDF.',
      },
      {
        h: 'Hide what does not belong on paper',
      },
      {
        p: 'Screen pages carry navigation, buttons and cookie banners that make no sense in print. Hide them with a print media query rather than maintaining a separate template, and expand links so the printed copy still shows where they go.',
      },
      {
        code: '@media print {\n  nav, .no-print, button { display: none !important; }\n  a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 9pt; }\n  body { color: #000; background: #fff; }\n}',
      },
      {
        h: 'Layout tips for invoice tables',
      },
      {
        ul: [
          'Give number columns text-align: right and font-variant-numeric: tabular-nums, so digits line up across rows.',
          'Set table-layout: fixed and explicit column widths; otherwise one long product description can squeeze the amount column.',
          'Format money in code (Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" })) so lakhs and crores use the Indian grouping, 1,25,000.00.',
          'Keep the totals block together with break-inside: avoid, so the grand total never ends up alone on an extra page.',
          'Add a small page number in the footer when your PDF tool supports it; it helps when somebody prints and staples the pages.',
        ],
      },
      {
        h: 'Why does the PDF look different from the screen?',
      },
      {
        p: 'Print engines use the print media type, ignore position: fixed in surprising ways and apply the margins from @page on top of any body margin. If a design looks right in the browser but is cut off in the PDF, check the width first: 210 mm minus both margins is the space you really have, about 186 mm with 12 mm margins.',
      },
      {
        h: 'Checklist before you ship',
      },
      {
        ul: [
          'Print a one-page and a three-page invoice.',
          'Check that no row is split and headers repeat.',
          'Check totals, tax lines and currency formatting on the last page.',
          'Test in Chrome and Safari; their print engines differ slightly.',
        ],
      },
    ],
  },
  'cron-expressions-explained': {
    intro:
      'Cron is the classic way to schedule jobs: database backups at night, reports every Monday, cache warm-ups every five minutes. The syntax is short but easy to get wrong, and a wrong schedule usually fails silently. Here is how to read any cron expression.',
    body: [
      {
        h: 'The five fields',
      },
      {
        code: '┌──────── minute (0-59)\n│ ┌────── hour (0-23)\n│ │ ┌──── day of month (1-31)\n│ │ │ ┌── month (1-12)\n│ │ │ │ ┌ day of week (0-6, Sunday = 0)\n│ │ │ │ │\n* * * * *',
      },
      {
        h: 'Special characters',
      },
      {
        ul: [
          '* means every value: * in the hour field means every hour.',
          'A list: 1,15 in the day-of-month field means the 1st and the 15th.',
          'A range: 1-5 in the day-of-week field means Monday to Friday.',
          'A step: */15 in the minute field means every 15 minutes; 9-17/2 means every two hours from 9 to 17.',
        ],
      },
      {
        h: 'Examples you will actually use',
      },
      {
        code: '*/5 * * * *      every 5 minutes\n0 * * * *        at the start of every hour\n30 2 * * *       every day at 02:30\n0 9 * * 1-5      9:00 on weekdays\n0 0 1 * *        midnight on the 1st of every month\n0 18 * * 5       Friday at 18:00\n0 0 * * 0        midnight every Sunday',
      },
      {
        h: 'The day-of-month and day-of-week trap',
      },
      {
        p: 'When both day fields are restricted, standard cron runs the job when either matches, not both. "0 0 13 * 5" runs on every 13th and on every Friday, not only on Friday the 13th. If you need both conditions, check the date inside the job.',
      },
      {
        h: 'Time zones',
      },
      {
        p: 'Cron runs in the server\'s time zone, which on cloud servers is usually UTC. 9:00 IST is 3:30 UTC, so "0 9 * * *" on a UTC server runs at 2:30 PM in India. Kubernetes CronJobs support a timeZone field; GitHub Actions schedules are always UTC.',
      },
      {
        h: 'Quartz and Spring use six or seven fields',
      },
      {
        p: 'Java schedulers add a seconds field at the start, and Quartz an optional year at the end. They also use ? for "no specific value" in one of the day fields. "0 0 9 ? * MON-FRI" in Quartz is "0 9 * * 1-5" in standard cron.',
      },
      {
        p: 'The Cron Expression tool explains any expression in plain words and lists the next run times, so you can check a schedule before you deploy it.',
      },
      {
        h: 'Making scheduled jobs safe to run',
      },
      {
        p: 'A correct schedule is only half of the work. Jobs fail, servers restart and deployments run two copies of the same scheduler. A few habits prevent most problems:',
      },
      {
        ul: [
          'Make jobs idempotent: running a job twice must not send two emails or charge a customer twice. Record what was processed.',
          'Prevent overlap: if a job can take longer than its interval, take a lock (for example flock on Linux or ShedLock in Spring) so a new run waits or skips.',
          'Log the start, the end and the number of items processed, and alert when a job has not finished for longer than expected.',
          'Avoid the busiest minute: many teams schedule everything at 0 0 * * *. Spreading jobs to minutes such as 17 or 43 reduces load spikes.',
          'Remember daylight saving time in regions that use it: a job at 02:30 may run twice or not at all on the changeover night.',
        ],
      },
      {
        h: 'Testing a schedule before it goes live',
      },
      {
        ol: [
          'Write the expression and read the plain-English explanation in the Cron Expression tool.',
          'Check the next five run times, especially around month ends and weekends.',
          'Confirm the time zone of the server or platform that will run it.',
          'For a new job, run it once by hand with the same arguments before you rely on the schedule.',
        ],
      },
    ],
  },
};
