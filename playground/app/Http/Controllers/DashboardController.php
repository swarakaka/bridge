<?php

namespace App\Http\Controllers;

use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use Bridge\Facades\Bridge;

class DashboardController extends Controller
{
    public function __invoke()
    {
        return Bridge::render('Dashboard', [
            'recentCustomers' => CustomerResource::collection(Customer::latest()->limit(5)->get()),
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
                ->all(), 'charts'),
        ]);
    }
}
