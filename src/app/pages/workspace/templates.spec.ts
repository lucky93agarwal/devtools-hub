import { describe, expect, it } from 'vitest';
import { splitOptions, systemPrompt } from '../../../../worker/assistant';
import { cleanOutput } from '../../../../worker/ai';
import { CATEGORIES, TEMPLATES, niceDate, renderTemplate } from './templates';

const profile = { yourName: 'Lucky', managerName: 'Asha', signature: 'Lucky Agarwal\nBackend Developer', project: 'Payments' };

describe('message templates', () => {
  it('covers every category with unique ids', () => {
    for (const c of CATEGORIES) expect(TEMPLATES.some((t) => t.category === c)).toBe(true);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });

  it('writes an email with subject, greeting, body and signature', () => {
    const t = TEMPLATES.find((x) => x.id === 'casual-leave')!;
    const text = renderTemplate(t, { from: '2026-11-28', reason: 'a family function' }, profile, 'email');
    expect(text).toBe(
      'Subject: Casual leave request - 28 Nov 2026\n\nHi Asha,\n\nI would like to request casual leave on 28 Nov 2026 for a family function.\n' +
        'I will make sure my current tasks are updated before I leave.\n\nKindly approve.\n\nRegards,\nLucky Agarwal\nBackend Developer',
    );
    expect(renderTemplate(t, { from: '2026-11-28', to: '2026-11-30' }, profile, 'email')).toContain('casual leave from 28 Nov 2026 to 30 Nov 2026.');
  });

  it('formats picked dates and times', () => {
    expect(niceDate('2026-11-28')).toBe('28 Nov 2026');
    expect(niceDate('2026-11-28T21:05')).toBe('28 Nov 2026, 9:05 PM');
    expect(niceDate('next Monday')).toBe('next Monday');
  });

  it('writes a merge request message for several tickets and bugs, with the repository before each link', () => {
    const t = TEMPLATES.find((x) => x.id === 'mr-deploy')!;
    const mr = {
      items: [
        { ticket: 'JIRA-210', title: 'Refund status', backend: [{ repo: 'payments-api', url: 'https://git/x/1' }, { repo: 'ledger', url: 'https://git/x/2' }], ui: [{ repo: 'web-app', url: 'https://git/y/3' }] },
        { ticket: '', title: 'Date filter crash', backend: [], ui: [{ repo: '', url: 'https://git/y/4' }] },
      ],
      env: 'UAT',
      date: '2026-11-28',
    };
    const text = renderTemplate(t, { mr: JSON.stringify(mr) }, profile, 'chat');
    expect(text).toBe(
      [
        'Hi Asha,',
        '',
        'The following merge requests are ready:',
        '',
        '1. JIRA-210: Refund status',
        '   Backend:',
        '   - [payments-api] - https://git/x/1',
        '   - [ledger] - https://git/x/2',
        '   UI:',
        '   - [web-app] - https://git/y/3',
        '',
        '2. Bug: Date filter crash',
        '   UI:',
        '   - https://git/y/4',
        '',
        'Could you please review and merge them, and deploy to UAT on 28 Nov 2026? Please let me know once the deployment is done so that testing can begin.',
        '',
        'Thank you!',
      ].join('\n'),
    );
    expect(renderTemplate(t, { mr: JSON.stringify(mr) }, profile, 'email')).toContain('Subject: Review and deploy: JIRA-210 and 1 more');
  });

  it('numbers steps and questions', () => {
    const bug = renderTemplate(TEMPLATES.find((x) => x.id === 'bug')!, { steps: 'Open orders\n2. Click refund' }, {}, 'chat');
    expect(bug).toContain('1. Open orders\n2. Click refund');
  });
});

describe('assistant server helpers', () => {
  it('builds prompts for each task with the profile', () => {
    expect(systemPrompt('refine', 'email', 'formal', profile)).toContain('Subject:');
    expect(systemPrompt('refine', 'chat', 'crisp', profile)).toContain('instant message');
    expect(systemPrompt('refine', 'email', 'polite', profile)).toContain('Lucky Agarwal\nBackend Developer');
    expect(systemPrompt('prompt', 'chat', 'polite', {})).toContain('Output format');
    expect(systemPrompt('reply', 'chat', 'polite', {})).toContain('exactly 3');
  });

  it('splits reply options and cleans model chatter', () => {
    expect(splitOptions('Option 1: Sure, done.\n---\n**Option 2:** Can you share more?\n---\nReply 3) Not today.')).toEqual(['Sure, done.', 'Can you share more?', 'Not today.']);
    expect(cleanOutput("Here's your polished email:\n\nSubject: Hi")).toBe('Subject: Hi');
    expect(cleanOutput('"Thanks, will do."')).toBe('Thanks, will do.');
  });
});
