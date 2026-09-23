---
layout: home
hero:
  name: Bridge
  text: One controller. Page, JSON and stream.
  tagline: A server-driven application protocol for Laravel with a Vue 3 client. Inspired by Inertia's developer experience, designed as Laravel → Protocol → Client.
  actions:
    - theme: brand
      text: Get started
      link: /getting-started/introduction
    - theme: alt
      text: Coming from Inertia
      link: /getting-started/coming-from-inertia
features:
  - title: Standard content negotiation
    details: The Accept header selects the HTML shell, a Bridge page object, or a plain JSON document. No mode-specific code in controllers.
  - title: JSON mode is core
    details: Mobile and external clients call the same routes with Laravel-native resource shapes and errors. No duplicate API controllers.
  - title: Real-time by design
    details: Server-sent events with invalidate-first semantics, replay, bounded connections and a bus that works without Redis.
---
