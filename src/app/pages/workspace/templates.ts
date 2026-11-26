/**
 * Ready-made workplace messages. Each template fills instantly from its fields and the saved profile
 * (no AI needed); "Polish with AI" can then improve the draft.
 */

export interface AssistantProfile {
  yourName?: string;
  managerName?: string;
  signature?: string;
  project?: string;
  urls?: string;
  team?: string;
  favoriteTemplates?: string[];
}

export type Channel = 'email' | 'chat';

export interface TemplateField {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
}

export interface MessageTemplate {
  id: string;
  category: string;
  title: string;
  channel: Channel;
  fields: TemplateField[];
  /** Subject (email only) and body lines. */
  build(v: Record<string, string>, p: AssistantProfile): { subject: string; body: string[] };
}

export const CATEGORIES = [
  'Updates and EOD',
  'Merge request and deployment',
  'Leave and emails',
  'Issues and blockers',
  'Timelines and deadlines',
  'Clarifications',
] as const;

const val = (v: Record<string, string>, key: string, fallback = '') => (v[key] ?? '').trim() || fallback;
/** Lines from a multi-line field as bullet points. */
const bullets = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim().replace(/^[-*•]\s*/, ''))
    .filter(Boolean)
    .map((l) => `- ${l}`);

export const TEMPLATES: readonly MessageTemplate[] = [
  // ---------- Updates and EOD ----------
  {
    id: 'standup',
    category: 'Updates and EOD',
    title: 'Daily stand-up update',
    channel: 'chat',
    fields: [
      { key: 'yesterday', label: 'Done yesterday', multiline: true, placeholder: 'Finished login API\nFixed date filter bug' },
      { key: 'today', label: 'Plan for today', multiline: true, placeholder: 'Write tests for refunds' },
      { key: 'blockers', label: 'Blockers (optional)', multiline: true },
    ],
    build: (v) => ({
      subject: 'Daily update',
      body: [
        'Yesterday:',
        ...bullets(val(v, 'yesterday', '-')),
        '',
        'Today:',
        ...bullets(val(v, 'today', '-')),
        '',
        `Blockers: ${val(v, 'blockers') ? '' : 'None'}`,
        ...bullets(val(v, 'blockers')),
      ],
    }),
  },
  {
    id: 'eod',
    category: 'Updates and EOD',
    title: 'End-of-day (EOD) report',
    channel: 'email',
    fields: [
      { key: 'date', label: 'Date', placeholder: 'today' },
      { key: 'done', label: 'Completed today', multiline: true },
      { key: 'progress', label: 'In progress', multiline: true },
      { key: 'tomorrow', label: 'Plan for tomorrow', multiline: true },
      { key: 'blockers', label: 'Blockers (optional)', multiline: true },
    ],
    build: (v, p) => ({
      subject: `EOD update${p.project ? ` - ${p.project}` : ''} - ${val(v, 'date', new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }))}`,
      body: [
        "Here is my end-of-day update.",
        '',
        'Completed:',
        ...bullets(val(v, 'done', '-')),
        '',
        'In progress:',
        ...bullets(val(v, 'progress', '-')),
        '',
        'Plan for tomorrow:',
        ...bullets(val(v, 'tomorrow', '-')),
        ...(val(v, 'blockers') ? ['', 'Blockers:', ...bullets(val(v, 'blockers'))] : []),
      ],
    }),
  },
  {
    id: 'followup',
    category: 'Updates and EOD',
    title: 'Task follow-up',
    channel: 'chat',
    fields: [
      { key: 'task', label: 'Task / ticket', placeholder: 'JIRA-142 payment webhook' },
      { key: 'need', label: 'What you need from them', placeholder: 'an update on the review' },
    ],
    build: (v) => ({
      subject: `Follow-up: ${val(v, 'task', 'task')}`,
      body: [`Just following up on ${val(v, 'task', 'the task')}. Could you please share ${val(v, 'need', 'an update')} when you get a moment?`, '', 'Thanks!'],
    }),
  },
  // ---------- Merge request and deployment ----------
  {
    id: 'mr-deploy',
    category: 'Merge request and deployment',
    title: 'MR review, merge and deploy request',
    channel: 'chat',
    fields: [
      { key: 'feature', label: 'Feature / ticket', placeholder: 'Refund status page (JIRA-210)' },
      { key: 'backend', label: 'Backend MR URL' },
      { key: 'ui', label: 'UI MR URL' },
      { key: 'env', label: 'Deploy to', placeholder: 'staging' },
    ],
    build: (v) => ({
      subject: `Review and deploy: ${val(v, 'feature', 'merge requests')}`,
      body: [
        `The merge requests for ${val(v, 'feature', 'the feature')} are ready:`,
        ...(val(v, 'backend') ? [`- Backend: ${val(v, 'backend')}`] : []),
        ...(val(v, 'ui') ? [`- UI: ${val(v, 'ui')}`] : []),
        '',
        `Could you please review and merge them, and deploy to ${val(v, 'env', 'staging')}? Please let me know once the deployment is done so that testing can begin.`,
        '',
        'Thank you!',
      ],
    }),
  },
  {
    id: 'deploy-confirm',
    category: 'Merge request and deployment',
    title: 'Ask to confirm deployment',
    channel: 'chat',
    fields: [
      { key: 'feature', label: 'Feature / build', placeholder: 'release 2.4' },
      { key: 'env', label: 'Environment', placeholder: 'staging' },
    ],
    build: (v) => ({
      subject: `Deployment status: ${val(v, 'feature', 'release')}`,
      body: [`Could you please confirm whether ${val(v, 'feature', 'the build')} has been deployed to ${val(v, 'env', 'staging')}? QA is waiting to start testing.`, '', 'Thanks!'],
    }),
  },
  {
    id: 'deploy-notice',
    category: 'Merge request and deployment',
    title: 'Deployment notification',
    channel: 'email',
    fields: [
      { key: 'release', label: 'Release / version', placeholder: 'v2.4.0' },
      { key: 'env', label: 'Environment', placeholder: 'production' },
      { key: 'when', label: 'Date and time', placeholder: 'today, 9:00 PM IST' },
      { key: 'changes', label: 'Main changes', multiline: true },
      { key: 'impact', label: 'Downtime / impact', placeholder: 'No downtime expected' },
    ],
    build: (v) => ({
      subject: `Deployment notice: ${val(v, 'release', 'new release')} to ${val(v, 'env', 'production')}`,
      body: [
        `${val(v, 'release', 'The new release')} will be deployed to ${val(v, 'env', 'production')} on ${val(v, 'when', '[date and time]')}.`,
        '',
        'Changes:',
        ...bullets(val(v, 'changes', '-')),
        '',
        `Impact: ${val(v, 'impact', 'No downtime expected')}.`,
        '',
        'Please reach out if you have any concerns.',
      ],
    }),
  },
  // ---------- Leave and emails ----------
  {
    id: 'casual-leave',
    category: 'Leave and emails',
    title: 'Casual leave request',
    channel: 'email',
    fields: [
      { key: 'dates', label: 'Date(s)', placeholder: '28 Nov 2026' },
      { key: 'reason', label: 'Reason (optional)', placeholder: 'a family function' },
      { key: 'cover', label: 'Who covers / handover', placeholder: 'Ravi will handle urgent issues' },
    ],
    build: (v) => ({
      subject: `Casual leave request - ${val(v, 'dates', '[date]')}`,
      body: [
        `I would like to request casual leave on ${val(v, 'dates', '[date]')}${val(v, 'reason') ? ` for ${val(v, 'reason')}` : ''}.`,
        `${val(v, 'cover') ? `${val(v, 'cover')}. ` : ''}I will make sure my current tasks are updated before I leave.`,
        '',
        'Kindly approve.',
      ],
    }),
  },
  {
    id: 'sick-leave',
    category: 'Leave and emails',
    title: 'Sick leave',
    channel: 'email',
    fields: [
      { key: 'dates', label: 'Date(s)', placeholder: 'today' },
      { key: 'note', label: 'Anything to add (optional)', placeholder: 'I will be reachable on phone for urgent issues' },
    ],
    build: (v) => ({
      subject: `Sick leave - ${val(v, 'dates', 'today')}`,
      body: [`I am not feeling well and would like to take sick leave ${/^today|tomorrow$/i.test(val(v, 'dates', 'today')) ? '' : 'on '}${val(v, 'dates', 'today')}.`, `${val(v, 'note', 'I will check messages when I can for anything urgent')}.`, '', 'Thank you for understanding.'],
    }),
  },
  {
    id: 'wfh',
    category: 'Leave and emails',
    title: 'Work from home request',
    channel: 'email',
    fields: [
      { key: 'dates', label: 'Date(s)', placeholder: 'tomorrow' },
      { key: 'reason', label: 'Reason (optional)', placeholder: 'a plumbing repair at home' },
    ],
    build: (v) => ({
      subject: `Work from home request - ${val(v, 'dates', '[date]')}`,
      body: [
        `I would like to work from home ${/^today|tomorrow$/i.test(val(v, 'dates', '')) ? '' : 'on '}${val(v, 'dates', '[date]')}${val(v, 'reason') ? ` due to ${val(v, 'reason')}` : ''}.`,
        'I will be available online during working hours and on calls as usual.',
        '',
        'Kindly approve.',
      ],
    }),
  },
  {
    id: 'uat-signoff',
    category: 'Leave and emails',
    title: 'UAT sign-off / release notes',
    channel: 'email',
    fields: [
      { key: 'release', label: 'Release / version', placeholder: 'v2.4.0' },
      { key: 'features', label: 'Features delivered', multiline: true },
      { key: 'fixes', label: 'Bugs fixed', multiline: true },
      { key: 'known', label: 'Known issues (optional)', multiline: true },
    ],
    build: (v) => ({
      subject: `UAT sign-off request: ${val(v, 'release', 'release')}`,
      body: [
        `${val(v, 'release', 'The release')} is ready on UAT. Please find the release notes below.`,
        '',
        'New features:',
        ...bullets(val(v, 'features', '-')),
        '',
        'Bug fixes:',
        ...bullets(val(v, 'fixes', '-')),
        ...(val(v, 'known') ? ['', 'Known issues:', ...bullets(val(v, 'known'))] : []),
        '',
        'Could you please review and share your sign-off so we can plan the production release?',
      ],
    }),
  },
  // ---------- Issues and blockers ----------
  {
    id: 'bug',
    category: 'Issues and blockers',
    title: 'Bug report',
    channel: 'chat',
    fields: [
      { key: 'summary', label: 'What is wrong', placeholder: 'Refund button does nothing' },
      { key: 'where', label: 'Where (page, API, environment)', placeholder: 'Orders page on staging' },
      { key: 'steps', label: 'Steps to reproduce', multiline: true },
      { key: 'expected', label: 'Expected result' },
      { key: 'actual', label: 'Actual result' },
    ],
    build: (v) => ({
      subject: `Bug: ${val(v, 'summary', 'issue')}`,
      body: [
        `I found an issue: ${val(v, 'summary', '[summary]')} (${val(v, 'where', '[where]')}).`,
        '',
        'Steps to reproduce:',
        ...val(v, 'steps', '-')
          .split('\n')
          .filter((l) => l.trim())
          .map((l, i) => `${i + 1}. ${l.trim().replace(/^\d+[.)]\s*/, '')}`),
        '',
        `Expected: ${val(v, 'expected', '-')}`,
        `Actual: ${val(v, 'actual', '-')}`,
      ],
    }),
  },
  {
    id: 'env-issue',
    category: 'Issues and blockers',
    title: 'Staging / production issue',
    channel: 'chat',
    fields: [
      { key: 'env', label: 'Environment', placeholder: 'production' },
      { key: 'issue', label: 'What is happening', placeholder: 'Checkout returns 500 errors' },
      { key: 'since', label: 'Since when', placeholder: '10:30 AM' },
      { key: 'impact', label: 'Impact', placeholder: 'Users cannot pay' },
    ],
    build: (v) => ({
      subject: `Urgent: ${val(v, 'env', 'production')} issue - ${val(v, 'issue', 'issue')}`,
      body: [
        `Heads up: on ${val(v, 'env', 'production')}, ${val(v, 'issue', '[issue]')} since ${val(v, 'since', '[time]')}.`,
        `Impact: ${val(v, 'impact', '[impact]')}.`,
        '',
        'I am looking into it and will share updates here. Please let me know if anyone has more context.',
      ],
    }),
  },
  {
    id: 'access',
    category: 'Issues and blockers',
    title: 'Access request (DB / API / environment)',
    channel: 'email',
    fields: [
      { key: 'what', label: 'Access to', placeholder: 'read access to the staging database' },
      { key: 'why', label: 'Why it is needed', placeholder: 'to verify report data' },
      { key: 'by', label: 'Needed by (optional)', placeholder: 'Friday' },
    ],
    build: (v) => ({
      subject: `Access request: ${val(v, 'what', 'access')}`,
      body: [
        `Could you please grant me ${val(v, 'what', '[access]')}? I need it ${val(v, 'why', '[reason]')}.`,
        ...(val(v, 'by') ? [`It would help to have it by ${val(v, 'by')}.`] : []),
        '',
        'Thank you!',
      ],
    }),
  },
  // ---------- Timelines and deadlines ----------
  {
    id: 'delay',
    category: 'Timelines and deadlines',
    title: 'Task delay / revised ETA',
    channel: 'email',
    fields: [
      { key: 'task', label: 'Task / ticket' },
      { key: 'reason', label: 'Reason for the delay', multiline: true },
      { key: 'eta', label: 'Revised ETA', placeholder: 'Thursday EOD' },
    ],
    build: (v) => ({
      subject: `Revised ETA: ${val(v, 'task', 'task')}`,
      body: [
        `I wanted to update you that ${val(v, 'task', 'the task')} will take a little longer than planned.`,
        `Reason: ${val(v, 'reason', '[reason]')}`,
        '',
        `The revised ETA is ${val(v, 'eta', '[date]')}. I will keep you posted if anything changes.`,
      ],
    }),
  },
  {
    id: 'dependency',
    category: 'Timelines and deadlines',
    title: 'Cross-team dependency follow-up',
    channel: 'chat',
    fields: [
      { key: 'team', label: 'Team / person', placeholder: 'Payments team' },
      { key: 'need', label: 'What you are waiting for', placeholder: 'the updated webhook contract' },
      { key: 'by', label: 'Needed by', placeholder: 'tomorrow' },
    ],
    build: (v) => ({
      subject: `Dependency: ${val(v, 'need', 'update')}`,
      body: [
        `Hi ${val(v, 'team', 'team')}, our work is waiting on ${val(v, 'need', '[item]')}. Could you share an update or an expected date?`,
        `We need it by ${val(v, 'by', '[date]')} to stay on schedule.`,
        '',
        'Thanks a lot!',
      ],
    }),
  },
  // ---------- Clarifications ----------
  {
    id: 'clarify',
    category: 'Clarifications',
    title: 'Ask a question / clarify a requirement',
    channel: 'chat',
    fields: [
      { key: 'topic', label: 'Topic / ticket', placeholder: 'JIRA-305 export' },
      { key: 'questions', label: 'Questions', multiline: true, placeholder: 'Should the export include cancelled orders?\nCSV or Excel?' },
    ],
    build: (v) => ({
      subject: `Clarification needed: ${val(v, 'topic', 'requirement')}`,
      body: [
        `I have a few questions about ${val(v, 'topic', 'the requirement')} before I continue:`,
        ...val(v, 'questions', '-')
          .split('\n')
          .filter((l) => l.trim())
          .map((l, i) => `${i + 1}. ${l.trim().replace(/^\d+[.)]\s*/, '')}`),
        '',
        'Thanks for clarifying!',
      ],
    }),
  },
  {
    id: 'confirm-understanding',
    category: 'Clarifications',
    title: 'Confirm my understanding',
    channel: 'chat',
    fields: [
      { key: 'topic', label: 'Topic / ticket' },
      { key: 'understanding', label: 'What you understood', multiline: true },
    ],
    build: (v) => ({
      subject: `Confirming: ${val(v, 'topic', 'requirement')}`,
      body: [`Just to confirm my understanding of ${val(v, 'topic', 'this')}:`, ...bullets(val(v, 'understanding', '-')), '', 'Please let me know if I have missed anything.'],
    }),
  },
];

/** The finished draft: greeting, body and sign-off for email; greeting and body for chat. */
export function renderTemplate(t: MessageTemplate, values: Record<string, string>, profile: AssistantProfile, channel: Channel): string {
  const { subject, body } = t.build(values, profile);
  const greetingName = (values['to'] ?? '').trim() || profile.managerName?.trim() || '';
  const greeting = greetingName ? `Hi ${greetingName},` : channel === 'email' ? 'Hi,' : 'Hi,';
  const signOff = profile.signature?.trim() || profile.yourName?.trim() || '';
  if (channel === 'chat') return [greeting, '', ...body].join('\n').trim();
  return [`Subject: ${subject}`, '', greeting, '', ...body, '', 'Regards,', ...(signOff ? [signOff] : [])].join('\n').trim();
}
