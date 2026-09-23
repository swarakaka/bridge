# Who is it for

Bridge is for teams that run Laravel and want:

- **A single-page application without an API layer for it.** Controllers return pages; components receive props. Routing, authentication, authorization, validation and sessions stay in Laravel.
- **A mobile app or integration on the same code.** JSON mode serves the same routes to any HTTP client with Laravel-native shapes, so there is no second set of controllers to keep in sync.
- **Live pages without a separate real-time stack.** Streams publish invalidations and notifications from anywhere in the application and do not require Redis to start.

Bridge is not:

- **A REST or GraphQL framework.** JSON mode exposes what a page needs, not a resource graph. Public APIs with their own contract are better designed as such.
- **A content site generator.** Server-side rendering exists for SEO and first paint, but Bridge assumes JavaScript runs in the browser.
- **A replacement for Livewire.** Livewire keeps components on the server; Bridge keeps them in the browser and gives the server the data role.
