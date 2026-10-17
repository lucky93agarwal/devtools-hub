import { Type } from '@angular/core';
import { Routes } from '@angular/router';
import { TOOLS } from './core/tools';

const placeholder = () =>
  import('./pages/placeholder/placeholder-page').then((m) => m.PlaceholderPage);

/** Tools that are built. Every other tool path shows the placeholder page. */
const toolComponents: Record<string, () => Promise<Type<unknown>>> = {
  'json-formatter': () => import('./tools/json-formatter/json-formatter').then((m) => m.JsonFormatter),
  'json-compare': () => import('./tools/json-compare/json-compare').then((m) => m.JsonCompare),
  'image-converter': () => import('./tools/image-converter/image-converter').then((m) => m.ImageConverter),
  jwt: () => import('./tools/jwt/jwt-tool').then((m) => m.JwtTool),
  'background-remover': () =>
    import('./tools/background-remover/background-remover').then((m) => m.BackgroundRemover),
  'json-to-code': () => import('./tools/json-to-code/json-to-code').then((m) => m.JsonToCode),
  'data-converter': () => import('./tools/data-converter/data-converter').then((m) => m.DataConverter),
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
    data: { description: 'Why DevTools Hub exists, which tools it offers and how your data stays in your browser.' },
  },
  {
    path: 'privacy',
    title: 'Privacy policy',
    loadComponent: () => import('./pages/info/privacy-page').then((m) => m.PrivacyPage),
    data: { description: 'How DevTools Hub handles your data: tools run in your browser, with no accounts and no cookies.' },
  },
  {
    path: 'terms',
    title: 'Terms of use',
    loadComponent: () => import('./pages/info/terms-page').then((m) => m.TermsPage),
    data: { description: 'The terms for using the free developer tools on DevTools Hub.' },
  },
  {
    path: 'contact',
    title: 'Contact',
    loadComponent: () => import('./pages/info/contact-page').then((m) => m.ContactPage),
    data: { description: 'Report a bug, request a tool or ask a question about DevTools Hub.' },
  },
];

export const routes: Routes = [
  {
    path: '',
    title: 'Free Developer Tools in Your Browser',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
    data: {
      description:
        'Free developer tools that run entirely in your browser: JSON formatter, JSON compare, image converter, JWT decoder and more.',
    },
  },
  ...toolRoutes,
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
