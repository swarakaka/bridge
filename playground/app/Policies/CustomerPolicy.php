<?php

namespace App\Policies;

use App\Models\Customer;
use App\Models\User;

/**
 * Locked customers cannot be edited or deleted. Bridge represents the
 * resulting AuthorizationException as 403 in HTML, page and JSON mode.
 */
class CustomerPolicy
{
    public function viewAny(?User $user): bool
    {
        return true;
    }

    public function view(?User $user, Customer $customer): bool
    {
        return true;
    }

    public function create(User $user): bool
    {
        return true;
    }

    public function update(User $user, Customer $customer): bool
    {
        return ! $customer->locked;
    }

    public function delete(User $user, Customer $customer): bool
    {
        return ! $customer->locked;
    }
}
