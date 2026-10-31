import { ToolContent } from '../../shared/tool-info/tool-info';

export const CHMOD_CONTENT: ToolContent = {
  aboutHeading: 'About this chmod calculator',
  about:
    'Unix and Linux decide who may read, write and run a file with three sets of permissions: for the owner, the ' +
    'group and everyone else. chmod sets them as a number such as 755, where each digit adds read (4), write (2) and ' +
    'execute (1). Tick the boxes to get the number, the rwxr-xr-x form that ls -l shows and the chmod command, or ' +
    'type a number or symbols to see in plain words what they allow. The setuid, setgid and sticky bits are included.',
  steps: [
    'Tick read, write and execute for the owner, the group and others, or type a value such as 644 or rwxr-xr-x.',
    'Read the plain-English summary to check who can do what.',
    'Copy the chmod command with the number, or the u=,g=,o= form that sets each class exactly.',
    'Run it in your terminal, replacing file with your file or folder name.',
  ],
  faq: [
    {
      question: 'What do 755 and 644 mean?',
      answer:
        '755 lets the owner read, write and run, and everyone else read and run: the usual setting for folders and ' +
        'scripts. 644 lets the owner read and write and everyone else only read: the usual setting for files.',
    },
    {
      question: 'Which permissions should an SSH key have?',
      answer:
        'A private key must be 600 or 400 (only you can read it), or ssh refuses to use it. The ~/.ssh folder should be 700.',
    },
    {
      question: 'Why is 777 a bad idea?',
      answer:
        'It lets every user on the machine change or replace the file. Fix the owner with chown, or give the group ' +
        'write access with 775 or 664, instead.',
    },
    {
      question: 'What does execute mean for a folder?',
      answer: 'For a folder, execute means you may enter it and open the files inside. Read only lets you list the names.',
    },
  ],
};
