import { GUIDES, guidesForTool } from '../../core/guides';
import { TOOLS } from '../../core/tools';
import { API_ARTICLES } from './articles-api';
import { IMAGE_ARTICLES } from './articles-images';
import { JSON_ARTICLES } from './articles-json';
import { inlineParts } from './guide-page';

const ARTICLES = { ...JSON_ARTICLES, ...API_ARTICLES, ...IMAGE_ARTICLES };

describe('guides', () => {
  it('has a written article for every guide, and every article is listed', () => {
    expect(Object.keys(ARTICLES).sort()).toEqual(GUIDES.map((g) => g.slug).sort());
  });

  for (const guide of GUIDES) {
    it(`${guide.slug} is substantial, linked to live tools and has a search snippet`, () => {
      const article = ARTICLES[guide.slug];
      const words = [article.intro, ...article.body.map((b) => JSON.stringify(b))].join(' ').split(/\s+/).length;
      expect(words).toBeGreaterThan(550);
      expect(guide.description.length).toBeGreaterThan(100);
      expect(guide.description.length).toBeLessThanOrEqual(200);
      for (const tool of guide.tools) expect(TOOLS.find((t) => t.path === tool)?.live, tool).toBe(true);
      // Inline code marks must come in pairs.
      for (const block of article.body) {
        for (const text of Object.values(block).flat().filter((v): v is string => typeof v === 'string')) {
          if (!('code' in block)) expect((text.match(/`/g) ?? []).length % 2, text).toBe(0);
        }
      }
    });
  }

  it('links tools to their guides', () => {
    expect(guidesForTool('jwt').map((g) => g.slug)).toEqual(['what-is-a-jwt', 'jwt-signing-algorithms', 'api-authentication-methods']);
  });

  it('splits inline code from text', () => {
    expect(inlineParts('Use `null` here')).toEqual([
      { text: 'Use ', code: false },
      { text: 'null', code: true },
      { text: ' here', code: false },
    ]);
  });
});
