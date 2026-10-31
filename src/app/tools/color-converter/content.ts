import { ToolContent } from '../../shared/tool-info/tool-info';

export const COLOR_CONTENT: ToolContent = {
  aboutHeading: 'About this colour converter',
  about:
    'Designers hand over colours in one format and code needs another. Paste a colour as HEX, RGB, HSL, OKLCH, ' +
    'an Android 0xAARRGGBB value or a CSS name, or pick one, and copy it as CSS, Android XML, Jetpack Compose, ' +
    'Flutter, SwiftUI or UIKit code. Transparency is kept in every format. The contrast checker works out the WCAG ' +
    'contrast ratio of a text colour on a background and shows whether it passes the AA and AAA levels.',
  steps: [
    'Type or paste a colour, or choose one with the colour picker.',
    'Copy the format you need from the list, for the web or for Android and iOS code.',
    'Enter a text colour and a background colour in the contrast checker.',
    'Adjust the colours until the checks you need show Pass.',
  ],
  faq: [
    {
      question: 'What contrast ratio do I need?',
      answer:
        'WCAG level AA asks for at least 4.5:1 for normal text and 3:1 for large text (24 px, or 19 px bold) and for ' +
        'icons and borders. Level AAA asks for 7:1 and 4.5:1.',
    },
    {
      question: 'Why do Android colours start with FF?',
      answer:
        'Android and Flutter write the alpha (opacity) first, as 0xAARRGGBB. FF means fully opaque. CSS puts alpha ' +
        'last, as #RRGGBBAA, so the converter moves it for you.',
    },
    {
      question: 'What is OKLCH?',
      answer:
        'A newer CSS colour format built on how people see lightness. Changing only its lightness gives shades that ' +
        'look evenly spaced, which makes it handy for design systems. All current browsers support it.',
    },
    {
      question: 'Are my colours stored anywhere?',
      answer: 'No. Everything is worked out in your browser.',
    },
  ],
};
