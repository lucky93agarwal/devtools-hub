import { ToolContent } from '../../shared/tool-info/tool-info';

export const GITIGNORE_CONTENT: ToolContent = {
  aboutHeading: 'About this .gitignore generator',
  about:
    'A .gitignore file tells Git which files to leave out of a repository: dependencies such as node_modules, build ' +
    'output, logs, secrets in .env files and the clutter that editors and operating systems create. Pick what your ' +
    'project uses and this tool joins the matching templates from GitHub’s community github/gitignore collection ' +
    'into one file, with a heading for each part and repeated patterns removed.',
  steps: [
    'Search for or tick the languages, frameworks, editors and operating systems your team uses, or start from a preset.',
    'Add your own lines, such as .env.local or a coverage folder, if you need them.',
    'Copy the result, or download it and rename the file to .gitignore.',
    'Put it in the root folder of your repository and commit it.',
  ],
  faq: [
    {
      question: 'Why is a file still tracked after I added it to .gitignore?',
      answer:
        '.gitignore only affects files Git is not tracking yet. Stop tracking the file with git rm --cached <file>, ' +
        'then commit; it stays on your disk.',
    },
    {
      question: 'Should editor and operating system files go in the project .gitignore?',
      answer:
        'Many teams add them so nobody commits .DS_Store or .idea by accident. You can also keep them in a global ' +
        'ignore file on your own machine with git config --global core.excludesFile ~/.gitignore_global.',
    },
    {
      question: 'Where do the templates come from?',
      answer:
        'From GitHub’s github/gitignore repository, which is in the public domain (CC0). They are copied into this ' +
        'page, so nothing is downloaded while you use it.',
    },
    {
      question: 'Why is the download called gitignore without a dot?',
      answer:
        'Browsers do not save files whose name starts with a dot. Rename it to .gitignore, or copy the text into a ' +
        'new .gitignore file in your editor.',
    },
  ],
};
