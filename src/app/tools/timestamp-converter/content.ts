import { ToolContent } from '../../shared/tool-info/tool-info';

export const TIMESTAMP_CONTENT: ToolContent = {
  aboutHeading: 'About this Unix timestamp converter',
  about:
    'Logs, databases, JWTs and APIs store time as a Unix timestamp: the number of seconds (or milliseconds) since ' +
    '1 January 1970 UTC. This converter turns such a number into a readable date in any time zone, as ISO 8601, ' +
    'RFC 2822 and relative time, and turns a date and time back into a timestamp. It detects whether a number is in ' +
    'seconds, milliseconds, microseconds or nanoseconds from its length, and handles daylight saving time with your ' +
    'browser’s time zone data.',
  steps: [
    'Paste a timestamp, or choose Use now. The unit is detected, or you can pick it.',
    'Choose the time zone to see the date in, for example your servers’ zone or your users’.',
    'Copy the format you need: readable, ISO 8601, RFC 2822 or the timestamp in another unit.',
    'To go the other way, pick a date and time under Date to timestamp.',
  ],
  faq: [
    {
      question: 'Is a timestamp in seconds or milliseconds?',
      answer:
        'Today a timestamp in seconds has 10 digits and one in milliseconds has 13. Unix tools, PHP and most ' +
        'databases use seconds; JavaScript’s Date.now() and Java’s System.currentTimeMillis() use milliseconds.',
    },
    {
      question: 'Do Unix timestamps have a time zone?',
      answer:
        'No. A timestamp is the same moment everywhere; only its display depends on the time zone. That is why ' +
        'storing UTC timestamps and converting for display is the usual practice.',
    },
    {
      question: 'What is the year 2038 problem?',
      answer:
        'Systems that store seconds in a signed 32-bit number overflow on 19 January 2038 at 03:14:07 UTC. ' +
        'Use 64-bit integers for timestamps to avoid it.',
    },
    {
      question: 'Why does my converted date look one hour off?',
      answer:
        'Usually the wrong time zone or daylight saving time. Check the zone selected here, and remember that UTC ' +
        'never changes for daylight saving.',
    },
  ],
};
