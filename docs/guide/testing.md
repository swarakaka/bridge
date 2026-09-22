# Testing

## Laravel

```php
$this->withHeaders(['Accept' => 'application/vnd.bridge+json; v=1'])->get('/customers')
    ->assertBridgePage('Customers/Index', fn ($page) => $page
        ->url('/customers')
        ->has('customers.data', 20)
        ->where('customers.meta.total', 57)
        ->deferred('default', ['stats']));

$this->withHeaders(['Accept' => 'application/json'])->post('/customers', [])
    ->assertStatus(422)->assertJsonStructure(['message', 'errors']);

$this->withHeaders(['Accept' => 'application/vnd.bridge+json; v=1'])->post('/customers', [])
    ->assertBridgeError(422, 'validation');

$this->withHeaders(['Accept' => 'text/html'])->get('/customers')->assertHtmlShell();
```

Macros: `assertBridgePage`, `assertBridgeProp`, `assertBridgeError`, `assertJsonMode`, `assertHtmlShell`. `assertBridgePage` also reads the page embedded in an HTML shell.

### Streams

Use the `sync` bus, `->maxDuration(0)` to drain once, and `Last-Event-ID: 0` to replay everything published in the test:

```php
config(['bridge.stream.driver' => 'sync']);
Bridge::to('customers')->notify('hello');
$body = $this->withHeaders(['Accept' => 'text/event-stream', 'Last-Event-ID' => '0'])->get('/events')->streamedContent();
```

## Client

`@swarakaka/bridge-core` is tested with Vitest and jsdom using a mocked `fetch`. The Vue adapter mounts real components. For end-to-end coverage the repository runs Playwright against the playground, including a two-browser realtime test and raw stream-protocol checks over Node's fetch.
