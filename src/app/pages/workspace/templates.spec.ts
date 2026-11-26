import { describe, expect, it } from 'vitest';
import { splitOptions, systemPrompt } from '../../../../worker/assistant';
import { cleanOutput } from '../../../../worker/ai';
import { CATEGORIES, TEMPLATES, renderTemplate } from './templates';

const profile = { yourName: 'Lucky', managerName: 'Asha', signature: 'Lucky Agarwal\nBackend Developer', project: 'Payments' };

describe('message templates', () => {
  it('covers every category with unique ids', () => {
    for (const c of CATEGORIES) expect(TEMPLATES.some((t) => t.category === c)).toBe(true);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });

  it('writes an email with subject, greeting, body and signature', () => {
    const t = TEMPLATES.find((x) => x.id === 'casual-leave')!;
    const text = renderTemplate(t, { dates: '28 Nov 2026', reason: 'a family function' }, profile, 'email');
    expect(text).toBe(
      'Subject: Casual leave request - 28 Nov 2026\n\nHi Asha,\n\nI would like to request casual leave on 28 Nov 2026 for a family function.\n' +
        'I will make sure my current tasks are updated before I leave.\n\nKindly approve.\n\nRegards,\nLucky Agarwal\nBackend Developer',
    );
  });

  it('writes a chat message with both merge request links', () => {
    const t = TEMPLATES.find((x) => x.id === 'mr-deploy')!;
    const text = renderTemplate(t, { feature: 'Refunds', backend: 'https://git/x/1', ui: 'https://git/y/2' }, profile, 'chat');
    expect(text).toContain('Hi Asha,');
    expect(text).toContain('- Backend: https://git/x/1');
    expect(text).toContain('- UI: https://git/y/2');
    expect(text).toContain('so that testing can begin');
    expect(text).not.toContain('Subject:');
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
