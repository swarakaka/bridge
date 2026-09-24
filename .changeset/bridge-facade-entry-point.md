---
'@swarakaka/bridge-protocol': major
---

Laravel 2.0: `Bridge\Bridge` is now the facade (`use Bridge\Bridge;` then `Bridge::render(...)`) and the service class is `Bridge\BridgeManager`, also bound as `bridge`. Code that injects or resolves the 1.x `Bridge\Bridge` class must type-hint `BridgeManager`; there is no shim for injecting `Bridge\Bridge`, since a facade instance cannot act as the service. `Bridge\Facades\Bridge` extends the new facade and is deprecated; the `Bridge` alias points at `Bridge\Bridge`. See `packages/laravel/UPGRADE.md`. The npm packages have no API changes and move to 2.0.0 because all packages share one version.
