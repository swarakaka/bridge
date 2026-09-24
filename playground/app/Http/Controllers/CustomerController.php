<?php

namespace App\Http\Controllers;

use App\Events\CustomerChanged;
use App\Http\Requests\StoreCustomerRequest;
use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use Bridge\Bridge;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * One controller, three representations. There is no mode-specific code here:
 * Bridge::render() and Bridge::redirect() are represented as HTML, page or
 * JSON depending on the Accept header.
 */
class CustomerController extends Controller
{
    use AuthorizesRequests;

    public function index(Request $request)
    {
        $filters = ['search' => $request->string('search')->toString() ?: null];

        return Bridge::render('Customers/Index', [
            // Bridge::merge(): a "load more" partial reload appends the next page's rows.
            'customers' => Bridge::merge(fn () => CustomerResource::collection(
                Customer::query()->search($filters['search'])->latest('id')->paginate(min(200, max(1, (int) $request->integer('per_page', 20))))->withQueryString(),
            )),
            'filters' => $filters,
            'stats' => Bridge::defer(fn () => [
                'total' => Customer::count(),
                'active' => Customer::where('status', 'active')->count(),
            ]),
        ]);
    }

    public function create()
    {
        return Bridge::render('Customers/Create', [
            'statuses' => ['active', 'inactive'],
        ]);
    }

    public function store(StoreCustomerRequest $request)
    {
        $customer = Customer::create($request->safe()->except('avatar'));

        if ($request->hasFile('avatar')) {
            $customer->update(['avatar_path' => $request->file('avatar')->store('avatars', 'public')]);
        }

        CustomerChanged::dispatch($customer->refresh(), 'created');

        return Bridge::redirect()
            ->route('customers.show', $customer)
            ->with('customer', CustomerResource::make($customer))
            ->flash('Customer created.')
            ->created();
    }

    public function show(Customer $customer)
    {
        return Bridge::render('Customers/Show', [
            'customer' => CustomerResource::make($customer),
        ]);
    }

    public function edit(Customer $customer)
    {
        $this->authorize('update', $customer);

        return Bridge::render('Customers/Edit', [
            'customer' => CustomerResource::make($customer),
            'statuses' => ['active', 'inactive'],
        ]);
    }

    /**
     * Toggles the star. The client shows the change before this answers (an
     * optimistic update) and undoes it when this refuses a locked customer.
     */
    public function star(Customer $customer)
    {
        if ($customer->locked) {
            throw ValidationException::withMessages(['starred' => 'Locked customers cannot be starred.']);
        }

        $customer->update(['starred' => ! $customer->starred]);

        return Bridge::redirect()
            ->route('customers.show', $customer)
            ->with('customer', CustomerResource::make($customer));
    }

    public function update(StoreCustomerRequest $request, Customer $customer)
    {
        $this->authorize('update', $customer);

        $customer->update($request->safe()->except('avatar'));

        if ($request->hasFile('avatar')) {
            $customer->update(['avatar_path' => $request->file('avatar')->store('avatars', 'public')]);
        }

        CustomerChanged::dispatch($customer->refresh(), 'updated');

        return Bridge::redirect()
            ->route('customers.show', $customer)
            ->with('customer', CustomerResource::make($customer))
            ->flash('Customer updated.');
    }

    public function destroy(Customer $customer)
    {
        $this->authorize('delete', $customer);

        $customer->delete();
        CustomerChanged::dispatch($customer, 'deleted');

        return Bridge::redirect()
            ->route('customers.index')
            ->flash('Customer deleted.');
    }
}
