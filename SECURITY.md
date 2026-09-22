# Security Policy

## Supported versions

Bridge is pre-release. Security fixes land on `main` and in the latest tagged release of each package.

## Reporting a vulnerability

Please do **not** open a public issue for security problems.

Report privately through GitHub's private vulnerability reporting on `github.com/swarakaka/Bridge` (Security tab → "Report a vulnerability"). If that is unavailable, email the maintainer listed in `composer.json` of `packages/laravel` with the subject `[Bridge security]`.

Include: affected package and version, a description, reproduction steps or a proof of concept, and the impact you believe it has.

You will receive an acknowledgement within 72 hours and a triage decision within 7 days. We will coordinate a disclosure date with you; the default is 90 days after the report or on release of a fix, whichever is earlier.

## Scope notes

Bridge determines response **representation** only. Authentication, authorization, CSRF, and CORS remain the responsibility of Laravel and the host application. Reports about those are still welcome when Bridge's behaviour weakens them (for example, a mode that bypasses a guard, a cache header that exposes private data, or an SSE channel that leaks data across users or tenants).
