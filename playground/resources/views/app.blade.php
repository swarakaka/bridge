<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ config('app.name', 'Bridge') }}</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <x-bridge::head />
    @if (file_exists(public_path('build/manifest.json')) || file_exists(public_path('hot')))
        @vite(['resources/js/app.ts'])
    @endif
</head>
<body>
    <x-bridge::app class="antialiased" />
    <noscript>This application requires JavaScript.</noscript>
</body>
</html>
