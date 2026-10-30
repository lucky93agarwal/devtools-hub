import { Type } from '@angular/core';
import { Routes } from '@angular/router';
import { TOOLS } from './core/tools';
import { adsEnabled } from './core/ads';
import { GUIDES } from './core/guides';

const placeholder = () =>
  import('./pages/placeholder/placeholder-page').then((m) => m.PlaceholderPage);

/** Tools that are built. Every other tool path shows the placeholder page. */
const toolComponents: Record<string, () => Promise<Type<unknown>>> = {
  'json-formatter': () => import('./tools/json-formatter/json-formatter').then((m) => m.JsonFormatter),
  'json-compare': () => import('./tools/json-compare/json-compare').then((m) => m.JsonCompare),
  'image-converter': () => import('./tools/image-converter/image-converter').then((m) => m.ImageConverter),
  'image-resizer': () => import('./tools/image-resizer/image-resizer').then((m) => m.ImageResizer),
  'image-cropper': () => import('./tools/image-cropper/image-cropper').then((m) => m.ImageCropper),
  jwt: () => import('./tools/jwt/jwt-tool').then((m) => m.JwtTool),
  'background-remover': () =>
    import('./tools/background-remover/background-remover').then((m) => m.BackgroundRemover),
  'json-to-code': () => import('./tools/json-to-code/json-to-code').then((m) => m.JsonToCode),
  'api-client': () => import('./tools/api-client/api-client').then((m) => m.ApiClient),
  'data-converter': () => import('./tools/data-converter/data-converter').then((m) => m.DataConverter),
  'xml-formatter': () => import('./tools/text-formatter/text-formatter').then((m) => m.TextFormatter),
  'yaml-validator': () => import('./tools/text-formatter/text-formatter').then((m) => m.TextFormatter),
  'app-icon-generator': () => import('./tools/app-icon/app-icon-generator').then((m) => m.AppIconGenerator),
};

/** Each tool is a lazy-loaded route with its own URL, title and description. */
const toolRoutes: Routes = TOOLS.map((tool) => ({
  path: tool.path,
  title: tool.seoTitle,
  loadComponent: toolComponents[tool.path] ?? placeholder,
  data: {
    heading: tool.name,
    description: tool.metaDescription,
    phase: tool.phase,
    // "Coming soon" pages have nothing to offer yet, so keep them out of search results.
    noindex: !tool.live,
  },
}));

/** About, Privacy, Terms and Contact. */
const infoRoutes: Routes = [
  {
    path: 'about',
    title: 'About',
    loadComponent: () => import('./pages/info/about-page').then((m) => m.AboutPage),
    data: { description: 'Why DevTools24 exists, which tools it offers and how your data stays in your browser.' },
  },
  {
    path: 'privacy',
    title: 'Privacy policy',
    loadComponent: () => import('./pages/info/privacy-page').then((m) => m.PrivacyPage),
    data: {
      description: adsEnabled()
        ? 'How DevTools24 handles your data: tools run in your browser, with no accounts. Ads are served by Google AdSense.'
        : 'How DevTools24 handles your data: tools run in your browser, with no accounts and no cookies.',
    },
  },
  {
    path: 'terms',
    title: 'Terms of use',
    loadComponent: () => import('./pages/info/terms-page').then((m) => m.TermsPage),
    data: { description: 'The terms for using the free developer tools on DevTools24.' },
  },
  {
    path: 'contact',
    title: 'Contact',
    loadComponent: () => import('./pages/info/contact-page').then((m) => m.ContactPage),
    data: { description: 'Report a bug, request a tool or ask a question about DevTools24.' },
  },
];

/** The guides list and one page per guide, each prerendered with its own title. */
const guideRoutes: Routes = [
  {
    path: 'guides',
    title: 'Developer Guides',
    loadComponent: () => import('./pages/guides/guide-page').then((m) => m.GuidesPage),
    data: {
      description:
        'Practical guides to JSON, YAML, XML, JWTs, CORS, HTTP status codes, API authentication, image formats and app icons.',
    },
  },
  ...GUIDES.map((guide) => ({
    path: `guides/${guide.slug}`,
    title: guide.title,
    loadComponent: () => import('./pages/guides/guide-page').then((m) => m.GuidePage),
    data: { description: guide.description },
  })),
];

export const routes: Routes = [
  {
    path: '',
    title: 'Free Developer Tools in Your Browser',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
    data: {
      description:
        'Free developer tools that run in your browser: JSON formatter, JSON to code, YAML and XML converters, image converter, JWT decoder and more.',
    },
  },
  ...toolRoutes,
  ...guideRoutes,
  ...infoRoutes,
  {
    // Hidden proof-of-concept page for the background remover; not linked and not indexed.
    path: 'lab/background-remover',
    title: 'Background remover test',
    loadComponent: () =>
      import('./tools/background-remover/background-remover-lab').then((m) => m.BackgroundRemoverLab),
    data: { description: 'Test page for the background remover.', noindex: true },
  },
  // The page's first address, from before it was built.
  { path: 'json-to-model', redirectTo: 'json-to-code' },
  {
    path: '**',
    title: 'Page not found',
    loadComponent: placeholder,
    data: {
      heading: 'Page not found',
      description: 'This page does not exist. Try one of the tools instead.',
      notFound: true,
    },
  },
];
