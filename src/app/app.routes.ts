import { Routes } from '@angular/router';
import { TOOLS } from './core/tools';

const placeholder = () =>
  import('./pages/placeholder/placeholder-page').then((m) => m.PlaceholderPage);

/** Each tool is a lazy-loaded route with its own URL, title and description. */
const toolRoutes: Routes = TOOLS.map((tool) => ({
  path: tool.path,
  title: tool.name,
  loadComponent: placeholder,
  data: { heading: tool.name, description: tool.description, phase: tool.phase },
}));

const infoPages = [
  { path: 'about', heading: 'About', description: `Who builds these tools and why.` },
  { path: 'privacy', heading: 'Privacy policy', description: 'How this site handles your data.' },
  { path: 'terms', heading: 'Terms of use', description: 'The rules for using this site.' },
  { path: 'contact', heading: 'Contact', description: 'How to reach us with feedback or questions.' },
];

const infoRoutes: Routes = infoPages.map((page) => ({
  path: page.path,
  title: page.heading,
  loadComponent: placeholder,
  data: { heading: page.heading, description: page.description },
}));

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
    data: {
      description:
        'Free developer tools that run entirely in your browser: JSON formatter, JSON compare, image converter, JWT decoder and more.',
    },
  },
  ...toolRoutes,
  ...infoRoutes,
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
