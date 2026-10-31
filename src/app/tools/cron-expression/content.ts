import { ToolContent } from '../../shared/tool-info/tool-info';

export const CRON_CONTENT: ToolContent = {
  aboutHeading: 'About this cron expression explainer',
  about:
    'Cron schedules jobs with five fields: minute, hour, day of month, month and day of week. They are compact but ' +
    'easy to misread. Paste an expression to read it in plain English, see each field and get the next ten run times ' +
    'in your time zone or in UTC. It understands lists, ranges, steps such as */5, month and day names, shortcuts ' +
    'such as @daily, and the six-field form with seconds used by Spring and Quartz-style schedulers.',
  steps: [
    'Type or paste a cron expression, or start from a common schedule.',
    'Read the plain-English description and check each field.',
    'Compare the next run times with what you expect, in your time zone or UTC.',
    'Copy the expression into your crontab, CI workflow or scheduler.',
  ],
  faq: [
    {
      question: 'What do the five fields mean?',
      answer:
        'In order: minute (0–59), hour (0–23), day of month (1–31), month (1–12 or JAN–DEC) and day of week ' +
        '(0–6 or SUN–SAT, where 7 is also Sunday). * means every value, */n every n-th value and 1-5 a range.',
    },
    {
      question: 'Which time zone does cron use?',
      answer:
        'The time zone of the machine or service that runs it. GitHub Actions, Kubernetes CronJobs and most cloud ' +
        'schedulers use UTC unless you set a zone, so check the UTC run times before you deploy.',
    },
    {
      question: 'What happens if I set both day of month and day of week?',
      answer:
        'Standard cron runs the job when either one matches. For example, 0 0 13 * 5 runs on the 13th of every month ' +
        'and on every Friday, not only on Friday the 13th.',
    },
    {
      question: 'Are L, W and # supported?',
      answer:
        'No. They are Quartz extensions (such as L for the last day of the month) that standard cron does not ' +
        'understand. The tool tells you when an expression uses them.',
    },
  ],
};
