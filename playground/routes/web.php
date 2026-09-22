<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\ErrorController;
use App\Http\Controllers\JsonDemoController;
use App\Http\Controllers\RealtimeController;
use App\Http\Controllers\TokenController;
use Illuminate\Support\Facades\Route;

/*
| Every route below is served in three representations from the same
| controller action. Try:
|   curl -H 'Accept: text/html'                          http://localhost:8000/customers
|   curl -H 'Accept: application/vnd.bridge+json; v=1'   http://localhost:8000/customers
|   curl -H 'Accept: application/json' -H 'Authorization: Bearer <token>' http://localhost:8000/customers
|
| Customers require authentication through the `sanctum` guard, which accepts
| both the browser session and bearer tokens issued on the Tokens page.
*/

Route::get('/', DashboardController::class)->name('dashboard');
Route::get('/json', JsonDemoController::class)->name('json');

Route::get('/errors', [ErrorController::class, 'index'])->name('errors.index');
Route::get('/errors/{status}', [ErrorController::class, 'trigger'])->whereNumber('status')->name('errors.trigger');

Route::middleware('guest')->group(function (): void {
    Route::get('/login', [AuthController::class, 'create'])->name('login');
    Route::post('/login', [AuthController::class, 'store'])->name('login.store');
});

// The stream accepts the session, a bearer token, or a signed ticket (Bridge::streamTicket).
Route::middleware(['auth:sanctum'])->get('/events', [RealtimeController::class, 'events'])->name('events');
Route::middleware(['bridge.ticket:web', 'auth:sanctum'])->get('/events/ticket', [RealtimeController::class, 'events'])->name('events.ticket');

Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('/logout', [AuthController::class, 'destroy'])->name('logout');
    Route::resource('customers', CustomerController::class);
    Route::get('/realtime', [RealtimeController::class, 'page'])->name('realtime');
    Route::get('/realtime/export', [RealtimeController::class, 'export'])->name('realtime.export');
    Route::post('/realtime/ticket', [RealtimeController::class, 'ticket'])->name('realtime.ticket');
    Route::post('/realtime/notify', [RealtimeController::class, 'notify'])->name('realtime.notify');
    Route::post('/realtime/broadcast', [RealtimeController::class, 'broadcast'])->name('realtime.broadcast');
    Route::post('/realtime/prop', [RealtimeController::class, 'prop'])->name('realtime.prop');
    Route::post('/realtime/invalidate', [RealtimeController::class, 'invalidate'])->name('realtime.invalidate');
    Route::post('/realtime/end', [RealtimeController::class, 'end'])->name('realtime.end');
    Route::get('/tokens', [TokenController::class, 'index'])->name('tokens.index');
    Route::post('/tokens', [TokenController::class, 'store'])->name('tokens.store');
    Route::delete('/tokens/{token}', [TokenController::class, 'destroy'])->name('tokens.destroy');
});
