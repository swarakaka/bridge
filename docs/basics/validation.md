# Validation

Validate as you always do: form requests or `$request->validate()`. Bridge represents a `ValidationException` per mode:

| Mode                     | Response                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| Page                     | `422` with a Bridge error object: `{ type: "error", error: { kind: "validation", message, errors } }` |
| JSON                     | `422` with Laravel's `{ message, errors }`                                                            |
| HTML (classic form post) | Laravel's redirect back with errors in the session                                                    |

In page mode there is no redirect: the client receives the errors in the response to the request that failed and gives them to the form that submitted. The page is untouched, nothing is written to the session, and bearer-token clients see exactly what browsers see.

```vue
<p v-if="form.errors.email">{{ form.errors.email }}</p>
```

## Live validation with Precognition

Add Laravel's `precognitive` middleware to the route and call `form.validate(method, url, field)` when a field loses focus:

```php
Route::resource('customers', CustomerController::class)->middleware('precognitive');
```

```vue
<input v-model="form.data.email" @blur="form.validate('post', '/customers', 'email')" />
```

Only that field's rules run. A `422` sets the field's error, a `204` clears it, and other fields' errors are untouched. `form.validating` is true while the request is in flight.

## Named error bags

Bridge does not need them. Each form owns the errors of the request it sent, so several forms on one page cannot interfere.
