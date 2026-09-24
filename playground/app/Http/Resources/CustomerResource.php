<?php

namespace App\Http\Resources;

use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Customer
 */
class CustomerResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'company' => $this->company,
            'status' => $this->status,
            'locked' => (bool) $this->locked,
            'starred' => (bool) $this->starred,
            'avatar_url' => $this->avatar_path ? url('/storage/'.$this->avatar_path) : null,
            'notes' => $this->when($request->routeIs('customers.show', 'customers.edit'), $this->notes),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
