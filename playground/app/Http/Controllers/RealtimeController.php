<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use Bridge\Facades\Bridge;
use Bridge\Stream\StreamWriter;
use Illuminate\Http\Request;

/**
 * The realtime demo: one stream per signed-in user subscribed to the shared
 * `customers` channel and a private `user.{id}` channel.
 */
class RealtimeController extends Controller
{
    public function page(Request $request)
    {
        return Bridge::render('Realtime', [
            'customersCount' => fn () => Customer::count(),
            'unreadCount' => 0,
            'channels' => ['customers', 'user.'.$request->user()->id],
            'heartbeatMs' => (int) config('bridge.stream.heartbeat_ms'),
            'maxDurationS' => (int) (config('bridge.stream.max_duration_s') ?: 60),
            'driver' => (string) config('bridge.stream.driver'),
        ]);
    }

    public function events(Request $request)
    {
        return Bridge::stream()->channels(fn ($user) => ['customers', "user.{$user->id}"]);
    }

    /** A short-lived signed URL for clients that cannot send headers (native EventSource + tokens). */
    public function ticket()
    {
        return response()->json(['url' => Bridge::streamTicket('events.ticket')]);
    }

    /** One-off producer stream: progress of a fake export. */
    public function export()
    {
        return Bridge::stream(function (StreamWriter $s): void {
            for ($i = 1; $i <= 5; $i++) {
                usleep(150_000);
                $s->progress('export', $i / 5, "Exporting batch {$i}/5");
            }
            $s->emit('export.done', ['rows' => Customer::count()]);
        });
    }

    // Demo triggers (publish to the current user's private channel or the shared one).

    public function notify(Request $request)
    {
        $data = $request->validate(['message' => ['required', 'string', 'max:120'], 'level' => ['nullable', 'in:info,success,warning,error']]);
        Bridge::to('user.'.$request->user()->id)->notify($data['message'], $data['level'] ?? 'info', 'Realtime demo');

        return Bridge::redirect()->route('realtime');
    }

    public function prop(Request $request)
    {
        $value = (int) $request->integer('value', random_int(1, 99));
        Bridge::to('user.'.$request->user()->id)->prop('unreadCount', $value);

        return Bridge::redirect()->route('realtime')->with('value', $value);
    }

    public function invalidate(Request $request)
    {
        Bridge::to('customers')->invalidate(['customersCount', 'customers']);

        return Bridge::redirect()->route('realtime');
    }

    public function end(Request $request)
    {
        Bridge::to('user.'.$request->user()->id)->end('server_shutdown', true);

        return Bridge::redirect()->route('realtime');
    }

    public function broadcast(Request $request)
    {
        $data = $request->validate(['message' => ['required', 'string', 'max:120']]);
        Bridge::to('customers')->notify($data['message'], 'info', $request->user()->name);

        return Bridge::redirect()->route('realtime');
    }
}
