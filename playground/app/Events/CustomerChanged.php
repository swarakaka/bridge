<?php

namespace App\Events;

use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use Bridge\Stream\Contracts\ShouldStream;
use Bridge\Stream\StreamMessage;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Dispatched after create/update/delete. Bridge publishes it to the bus as an
 * application event for stream listeners (the realtime page's event log).
 * Pages showing customers do not depend on it: their props watch the
 * Customer model, which publishes its own changes (StreamsChanges).
 */
class CustomerChanged implements ShouldStream
{
    use Dispatchable;

    public function __construct(
        public readonly Customer $customer,
        public readonly string $action, // created | updated | deleted
    ) {}

    public function streamOn(): array
    {
        return ['customers'];
    }

    public function toStream(): StreamMessage
    {
        return StreamMessage::event("customer.{$this->action}", [
            'customer' => CustomerResource::make($this->customer)->resolve(),
        ]);
    }
}
