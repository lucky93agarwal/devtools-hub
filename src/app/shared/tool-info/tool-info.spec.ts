import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TOOLS } from '../../core/tools';
import { COMPARE_CONTENT } from '../../tools/json-compare/content';
import { FORMATTER_CONTENT } from '../../tools/json-formatter/content';
import { IMAGE_CONTENT } from '../../tools/image-converter/content';
import { JWT_CONTENT } from '../../tools/jwt/content';
import { ToolInfoSection } from './tool-info';

const tool = TOOLS.find((t) => t.path === 'jwt')!;

describe('ToolInfoSection', () => {
  async function setup() {
    const fixture = TestBed.createComponent(ToolInfoSection);
    fixture.componentRef.setInput('tool', tool);
    fixture.componentRef.setInput('content', JWT_CONTENT);
    await fixture.whenStable();
    const head = TestBed.inject(DOCUMENT).head;
    return { fixture, el: fixture.nativeElement as HTMLElement, script: () => head.querySelector('#tool-structured-data') };
  }

  it('shows the explanation, steps and questions', async () => {
    const { el } = await setup();
    expect([...el.querySelectorAll('h2')].map((h) => h.textContent?.trim())).toEqual([
      'About this JWT tool',
      'How to use it',
      'Learn more',
      'Frequently asked questions',
    ]);
    expect(el.querySelectorAll('ol li')).toHaveLength(JWT_CONTENT.steps.length);
    expect(el.querySelectorAll('details')).toHaveLength(JWT_CONTENT.faq.length);
  });

  it('adds WebApplication and FAQPage structured data, and removes it when the page closes', async () => {
    const { fixture, script } = await setup();
    const data = JSON.parse(script()!.textContent!);
    expect(data['@graph'][0]).toMatchObject({ '@type': 'WebApplication', name: tool.name, isAccessibleForFree: true });
    expect(data['@graph'][0].url).toMatch(/\/jwt$/);
    expect(data['@graph'][1]['@type']).toBe('FAQPage');
    expect(data['@graph'][1].mainEntity[0].name).toBe(JWT_CONTENT.faq[0].question);

    fixture.destroy();
    expect(script()).toBeNull();
  });

  it('every live tool has enough original text', () => {
    for (const content of [FORMATTER_CONTENT, COMPARE_CONTENT, IMAGE_CONTENT, JWT_CONTENT]) {
      expect(content.about.length, content.aboutHeading).toBeGreaterThan(200);
      expect(content.steps.length, content.aboutHeading).toBeGreaterThanOrEqual(3);
      expect(content.faq.length, content.aboutHeading).toBeGreaterThanOrEqual(4);
    }
  });
});
