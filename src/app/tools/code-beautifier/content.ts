import { ToolContent } from '../../shared/tool-info/tool-info';
import { CodeLanguage } from './beautify';

export const BEAUTIFIER_SAMPLES: Record<CodeLanguage, string> = {
  html:
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Shop</title><link rel="stylesheet" href="app.css">' +
    '</head><body><header class="top"><a href="/">Home</a> <a href="/cart">Cart (2)</a></header><main><h1>Deals</h1>' +
    '<ul class="items"><li><b>Notebook</b> ₹120</li><li><b>Pen</b> ₹20</li></ul></main></body></html>',
  css:
    ':root{--brand:#4f46e5}body{margin:0;font-family:system-ui,sans-serif}.btn{display:inline-flex;padding:12px 24px;' +
    'border-radius:9999px;background:var(--brand);color:#fff}.btn:hover{background:#4338ca}@media (max-width:640px){.btn{width:100%}}',
  js:
    'const cart=[{id:1,name:"Notebook",price:120,qty:2},{id:2,name:"Pen",price:20,qty:3}];function total(items){return ' +
    'items.reduce((sum,item)=>sum+item.price*item.qty,0)}document.querySelector("#total").textContent=`₹${total(cart)}`;',
};

export const BEAUTIFIER_CONTENT: ToolContent = {
  aboutHeading: 'About this HTML, CSS and JavaScript beautifier',
  about:
    'Minified code from a production site, a CDN or a build is hard to read, and hand-written code is larger than ' +
    'it needs to be. Beautify adds line breaks and indentation so you can read and debug it. Minify does the ' +
    'opposite: it removes comments and spaces and, for JavaScript, shortens local names with Terser, then shows ' +
    'how much smaller the code became. CSS is minified with CSSO; HTML minifying keeps the content of pre, ' +
    'textarea, script and style elements and the spaces between words untouched.',
  steps: [
    'Paste HTML, CSS or JavaScript. The language is detected, or choose it yourself.',
    'Choose Beautify to read code, or Minify to make it smaller.',
    'For Beautify, pick 2 spaces, 4 spaces or tabs.',
    'Copy or download the result.',
  ],
  faq: [
    {
      question: 'Can beautifying recover the original code?',
      answer:
        'It restores the layout, not the original names or comments. Minified JavaScript keeps short names such as ' +
        'a and b; a source map from the build is needed to see the real ones.',
    },
    {
      question: 'Is minifying safe for my code?',
      answer:
        'JavaScript and CSS minifying only removes what the browser ignores and renames local variables. Still test ' +
        'the result, and keep your original files: minified code is for shipping, not editing.',
    },
    {
      question: 'Should I minify by hand?',
      answer:
        'For a project, let your build tool (Vite, webpack, esbuild or Angular CLI) minify on every build. This page ' +
        'is handy for a quick snippet, an email template or checking how much a file would shrink.',
    },
    {
      question: 'Is my code uploaded?',
      answer: 'No. All formatting and minifying runs in your browser.',
    },
  ],
};
