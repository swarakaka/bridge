<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        User::factory()->create([
            'name' => 'Ada Lovelace',
            'email' => 'ada@example.com',
            'password' => 'password',
        ]);

        // Locked: the policy forbids editing and deleting it (403 in every mode).
        Customer::factory()->create([
            'name' => 'Acme',
            'email' => 'hello@acme.test',
            'company' => 'Acme Corporation',
            'locked' => true,
        ]);

        Customer::factory()->count(56)->create();
    }
}
