<?php

namespace App\Models;

use Bridge\Stream\Concerns\StreamsChanges;
use Database\Factories\CustomerFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Customer extends Model
{
    /** @use HasFactory<CustomerFactory> */
    use HasFactory;

    // Created, updated and deleted customers reload every watched prop built from them.
    use StreamsChanges;

    protected $fillable = ['name', 'email', 'company', 'status', 'locked', 'starred', 'avatar_path', 'notes'];

    /**
     * Where changes are published: the demo has one shared `customers`
     * channel. A multi-tenant app would return the tenant's channel here.
     *
     * @return list<string>
     */
    public function streamOn(): array
    {
        return ['customers'];
    }

    protected function casts(): array
    {
        return ['locked' => 'boolean', 'starred' => 'boolean'];
    }

    /**
     * @param  Builder<Customer>  $query
     */
    public function scopeSearch(Builder $query, ?string $term): void
    {
        if ($term === null || trim($term) === '') {
            return;
        }

        $like = '%'.trim($term).'%';

        $query->where(fn (Builder $q) => $q
            ->where('name', 'like', $like)
            ->orWhere('email', 'like', $like)
            ->orWhere('company', 'like', $like));
    }
}
