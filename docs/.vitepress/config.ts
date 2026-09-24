import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Bridge',
  description:
    'A server-driven application protocol for Laravel: page, JSON and stream modes from one controller.',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/getting-started/introduction' },
      { text: 'Reference', link: '/reference/protocol' },
      { text: 'GitHub', link: 'https://github.com/swarakaka/Bridge' },
    ],
    sidebar: [
      {
        text: 'Getting started',
        items: [
          { text: 'Introduction', link: '/getting-started/introduction' },
          { text: 'Demo application', link: '/getting-started/demo-application' },
          { text: 'Coming from Inertia', link: '/getting-started/coming-from-inertia' },
        ],
      },
      {
        text: 'Installation',
        items: [
          { text: 'Server-side setup', link: '/installation/server-side' },
          { text: 'Client-side setup', link: '/installation/client-side' },
        ],
      },
      {
        text: 'Core concepts',
        items: [
          { text: 'Who is it for', link: '/core-concepts/who-is-it-for' },
          { text: 'How it works', link: '/core-concepts/how-it-works' },
          { text: 'Modes and negotiation', link: '/core-concepts/modes' },
          {
            text: 'Representation and transport',
            link: '/core-concepts/representation-and-transport',
          },
        ],
      },
      {
        text: 'The basics',
        items: [
          { text: 'Pages', link: '/basics/pages' },
          { text: 'Responses', link: '/basics/responses' },
          { text: 'Redirects', link: '/basics/redirects' },
          { text: 'Routing', link: '/basics/routing' },
          { text: 'Title and meta', link: '/basics/title-and-meta' },
          { text: 'Links', link: '/basics/links' },
          { text: 'Manual visits', link: '/basics/manual-visits' },
          { text: 'Forms', link: '/basics/forms' },
          { text: 'Form component', link: '/basics/form-component' },
          { text: 'File uploads', link: '/basics/file-uploads' },
          { text: 'Validation', link: '/basics/validation' },
          { text: 'Shared data', link: '/basics/shared-data' },
        ],
      },
      {
        text: 'Data and props',
        items: [
          { text: 'Partial reloads', link: '/data/partial-reloads' },
          { text: 'Deferred props', link: '/data/deferred-props' },
          { text: 'Lazy props', link: '/data/lazy-props' },
          { text: 'Load when visible', link: '/data/load-when-visible' },
          { text: 'Always props', link: '/data/always-props' },
          { text: 'Merging props', link: '/data/merging-props' },
          { text: 'Prefetching', link: '/data/prefetching' },
        ],
      },
      {
        text: 'Real-time',
        items: [
          { text: 'Streams', link: '/realtime/streams' },
          { text: 'Publishing events', link: '/realtime/publishing' },
          { text: 'Channels and authorization', link: '/realtime/channels' },
          { text: 'The stream client', link: '/realtime/client' },
          { text: 'Deploying streams', link: '/realtime/deployment' },
        ],
      },
      {
        text: 'Beyond the browser',
        items: [
          { text: 'JSON mode', link: '/beyond/json-mode' },
          { text: 'Mobile and native clients', link: '/beyond/mobile-clients' },
        ],
      },
      {
        text: 'Security',
        items: [
          { text: 'Authentication', link: '/security/authentication' },
          { text: 'Authorization', link: '/security/authorization' },
          { text: 'CSRF protection', link: '/security/csrf' },
          { text: 'Caching and private data', link: '/security/caching' },
          { text: 'History encryption', link: '/security/history-encryption' },
        ],
      },
      {
        text: 'Advanced',
        items: [
          { text: 'Asset versioning', link: '/advanced/asset-versioning' },
          { text: 'Error handling', link: '/advanced/error-handling' },
          { text: 'Events', link: '/advanced/events' },
          { text: 'Optimistic updates', link: '/advanced/optimistic-updates' },
          { text: 'Progress indicators', link: '/advanced/progress-indicators' },
          { text: 'Remembering state', link: '/advanced/remembering-state' },
          { text: 'Scroll management', link: '/advanced/scroll-management' },
          { text: 'Server-side rendering', link: '/advanced/server-side-rendering' },
          { text: 'Code splitting', link: '/advanced/code-splitting' },
          { text: 'Testing', link: '/advanced/testing' },
          { text: 'Benchmarks', link: '/advanced/benchmarks' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Protocol', link: '/reference/protocol' },
          { text: 'Configuration', link: '/reference/configuration' },
          { text: 'Writing an adapter', link: '/reference/adapters' },
          { text: 'Versioning', link: '/reference/versioning' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/swarakaka/Bridge' }],
    search: { provider: 'local' },
  },
})
