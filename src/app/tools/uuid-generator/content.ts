import { ToolContent } from '../../shared/tool-info/tool-info';

export const UUID_CONTENT: ToolContent = {
  aboutHeading: 'About this UUID, ULID and NanoID generator',
  about:
    'Unique ids are needed everywhere: database keys, request ids, file names and test data. This generator makes ' +
    'random UUID version 4 values, time-ordered UUID version 7 values from RFC 9562, ULIDs and NanoIDs, up to 1,000 ' +
    'at a time, using your browser’s cryptographically secure random number generator. The inspector tells you the ' +
    'version and variant of any UUID and the time stored in version 1, 6 and 7 UUIDs and in ULIDs.',
  steps: [
    'Choose UUID v4, UUID v7, ULID or NanoID.',
    'Set how many you need and the format: uppercase, hyphens and braces for UUIDs, or length and alphabet for NanoID.',
    'Choose Generate for a fresh set, then copy them all or download a text file.',
    'Paste an id under Inspect to see its type and when it was made.',
  ],
  faq: [
    {
      question: 'Should I use UUID v4 or v7?',
      answer:
        'Use v7 for database primary keys: it starts with a timestamp, so new rows land at the end of the index and ' +
        'inserts stay fast. Use v4 when the id must not reveal when it was created.',
    },
    {
      question: 'Can two generated UUIDs be the same?',
      answer:
        'In practice, no. A v4 UUID has 122 random bits; you would need to make billions per second for many years ' +
        'before a repeat became likely.',
    },
    {
      question: 'What is the difference between ULID and NanoID?',
      answer:
        'A ULID is 26 characters, sorts by creation time and is case-insensitive. A NanoID is a short random string ' +
        'with no time in it; 21 characters give about the same uniqueness as a UUID v4.',
    },
    {
      question: 'Are the ids sent anywhere?',
      answer: 'No. They are made in your browser and are not stored or logged.',
    },
  ],
};
