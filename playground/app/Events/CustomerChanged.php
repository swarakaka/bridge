<?php

namespace App\Events;

use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use Bridge\Stream\Contracts\ShouldStream;
use Bridge\Stream\StreamMessage;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Dispatched after create/update/delete. Bridge publishes it to the bus;
 * every browser subscribed to `customers` invalidates its list.
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

    /**
     * The application event for listeners, plus an invalidation so every page
     * showing customers re-fetches through the authorized request path.
     */
    public function toStream(): array
    {
        return [
            StreamMessage::event("customer.{$this->action}", [
                'customer' => CustomerResource::make($this->customer)->resolve(),
            ]),
            StreamMessage::invalidate(['customers', 'customersCount', 'recentCustomers', 'stats']),
        ];
    }
}
