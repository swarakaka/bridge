<?php

namespace App\Http\Controllers;

use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use Bridge\Bridge;

class DashboardController extends Controller
{
    public function __invoke()
    {
        return Bridge::render('Dashboard', [
            'recentCustomers' => CustomerResource::collection(Customer::latest('id')->limit(5)->get()),
            // Reloaded every few seconds by usePoll() on the page.
            'serverTime' => now()->format('H:i:s'),
            'stats' => Bridge::defer(fn () => [
                'customers' => Customer::count(),
                'active' => Customer::where('status', 'active')->count(),
                'inactive' => Customer::where('status', 'inactive')->count(),
            ]),
            'signups' => Bridge::defer(fn () => Customer::query()
                ->selectRaw("strftime('%Y-%m-%d', created_at) as day, count(*) as count")
                ->groupBy('day')
                ->orderBy('day')
                ->limit(30)
                ->get()
                ->map(fn ($row) => ['day' => $row->day, 'count' => (int) $row->count])
                ->all(), 'charts')
                // Deferred and once: loaded after the first render, then reused by this tab for
                // five minutes, so returning to the dashboard sends no `charts` request.
                ->once(ttl: 300),
        ]);
    }
}
