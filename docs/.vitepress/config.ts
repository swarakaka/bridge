import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Bridge',
  description:
    'A server-driven application protocol for Laravel: page, JSON and stream modes from one controller.',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'Protocol', link: '/guide/protocol' },
      { text: 'GitHub', link: 'https://github.com/swarakaka/Bridge' },
    ],
    sidebar: [
      {
        text: 'Getting started',
        items: [
          { text: 'Introduction', link: '/guide/introduction' },
          { text: 'Installation', link: '/guide/installation' },
          { text: 'Concepts', link: '/guide/concepts' },
        ],
      },
      {
        text: 'Building pages',
        items: [
          { text: 'Pages and props', link: '/guide/pages-and-props' },
          { text: 'Navigation', link: '/guide/navigation' },
          { text: 'Forms and validation', link: '/guide/forms' },
          { text: 'Errors', link: '/guide/errors' },
        ],
      },
      {
        text: 'Beyond the browser',
        items: [
          { text: 'JSON mode and mobile clients', link: '/guide/json-mode' },
          { text: 'Real-time streams', link: '/guide/streams' },
          { text: 'Deploying streams', link: '/guide/streams-deployment' },
          { text: 'Server-side rendering', link: '/guide/ssr' },
          { text: 'Mobile and native SDKs', link: '/guide/mobile-sdks' },
        ],
      },
      {
        text: 'Operations',
        items: [
          { text: 'Caching', link: '/guide/caching' },
          { text: 'Security', link: '/guide/security' },
          { text: 'Testing', link: '/guide/testing' },
          { text: 'Benchmarks', link: '/guide/benchmarks' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Protocol', link: '/guide/protocol' },
          { text: 'Writing an adapter', link: '/guide/adapters' },
          { text: 'Versioning', link: '/guide/versioning' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/swarakaka/Bridge' }],
    search: { provider: 'local' },
  },
})
