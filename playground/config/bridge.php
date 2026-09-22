<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Protocol
    |--------------------------------------------------------------------------
    | Highest Bridge protocol version this server speaks. Page requests asking
    | for a higher `v` receive 406 (packages/protocol/spec/negotiation.md §3).
    */
    'protocol' => [
        'max_version' => 1,
    ],

    /*
    |--------------------------------------------------------------------------
    | HTML shell
    |--------------------------------------------------------------------------
    | `view`  : Blade view rendered for text/html requests. Use @bridgeHead and
    |           @bridge inside it. Publish with `bridge:install` to customise.
    | `embed` : embed the initial page object in the shell (default). Set to
    |           false for a static, CDN-cacheable shell; the client then
    |           bootstraps with a page request.
    */
    'shell' => [
        'view' => 'app',
        'embed' => true,
        'root_id' => 'app',
    ],

    /*
    |--------------------------------------------------------------------------
    | Asset build
    |--------------------------------------------------------------------------
    | Compared with X-Bridge-Build on GET page requests; mismatch → 409 and a
    | full reload. Null derives it from the Vite manifest hash.
    */
    'build' => [
        'version' => env('BRIDGE_BUILD_VERSION'),
        'manifest' => null,
    ],

    /*
    |--------------------------------------------------------------------------
    | Negotiation
    |--------------------------------------------------------------------------
    | Mode used when the request only matches through a wildcard (star/star).
    | Override per route with ->defaults('bridge.default_mode', 'json').
    */
    'negotiation' => [
        'default_mode' => 'html',
    ],

    'json' => [
        // Resolve deferred props inline for JSON clients (they have no post-render phase).
        'resolve_deferred' => true,
    ],

    'auth' => [
        // `redirect` hint on unauthenticated errors when the exception has none.
        'login_url' => '/login',
    ],

    'flash' => [
        // Session keys exposed as the `flash` shared prop; the first is the message, the second the level.
        'keys' => ['message', 'level'],
    ],

    'cache' => [
        // Weak ETag + 304 handling on GET page/JSON responses.
        'etag' => true,
    ],

    'csrf' => [
        // Only affects Bridge\Http\Middleware\VerifyCsrfToken when you use it.
        'skip_for_bearer' => true,
    ],

    'middleware' => [
        // Push HandleBridgeRequests onto the `web` group automatically.
        'auto_register' => true,
    ],

];
