<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

/** Prints a fresh Sanctum token for the first user (benchmarks and curl demos). */
class BenchToken extends Command
{
    protected $signature = 'bench:token {--name=bench}';

    protected $description = 'Create and print a personal access token for the first user';

    public function handle(): int
    {
        $user = User::query()->firstOrFail();
        $this->line($user->createToken((string) $this->option('name'))->plainTextToken);

        return self::SUCCESS;
    }
}
