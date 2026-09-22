<?php

namespace App\Console\Commands;

use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use Bridge\Facades\Bridge;
use Bridge\Negotiation\ContentNegotiator;
use Illuminate\Console\Command;
use Illuminate\Http\Request;

/**
 * Micro-benchmark: time to build each representation of a 1,000-row page.
 * Prints one JSON line (consumed by benchmarks/scripts/run.mjs).
 */
class BenchSerialize extends Command
{
    protected $signature = 'bench:serialize {--rows=1000} {--iterations=20}';

    protected $description = 'Time Bridge page/JSON/HTML serialization of a large customer list';

    public function handle(): int
    {
        $rows = (int) $this->option('rows');
        $iterations = (int) $this->option('iterations');
        $customers = Customer::query()->limit($rows)->get();

        $scenarios = [
            'Bridge page' => ['Accept' => 'application/vnd.bridge+json; v=1'],
            'JSON mode' => ['Accept' => 'application/json'],
            'HTML shell (embedded page)' => ['Accept' => 'text/html'],
        ];

        $results = [];

        foreach ($scenarios as $name => $headers) {
            $request = Request::create('/bench', 'GET', [], [], [], ['HTTP_ACCEPT' => $headers['Accept']]);
            app()->instance('request', $request);
            $request->attributes->set(\Bridge\Negotiation\Negotiation::REQUEST_ATTRIBUTE, app(ContentNegotiator::class)->negotiate($request));

            $bytes = 0;
            $start = hrtime(true);

            for ($i = 0; $i < $iterations; $i++) {
                $response = Bridge::render('Customers/Index', [
                    'customers' => CustomerResource::collection($customers),
                    'filters' => ['search' => null],
                ])->toResponse($request);
                $bytes = strlen((string) $response->getContent());
            }

            $results[] = ['name' => $name, 'ms' => (hrtime(true) - $start) / 1e6 / $iterations, 'bytes' => $bytes, 'rows' => $customers->count()];
        }

        $this->line(json_encode($results));

        return self::SUCCESS;
    }
}
