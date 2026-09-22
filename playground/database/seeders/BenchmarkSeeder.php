<?php

namespace Database\Seeders;

use App\Models\Customer;
use Illuminate\Database\Seeder;

/** Adds customers up to 1,000 rows for the benchmarks. */
class BenchmarkSeeder extends Seeder
{
    public function run(): void
    {
        $missing = 1000 - Customer::count();

        if ($missing > 0) {
            $start = Customer::count();
            Customer::factory()->count($missing)->sequence(fn ($sequence) => ['email' => 'bench-'.($start + $sequence->index).'@example.com'])->create();
        }
    }
}
