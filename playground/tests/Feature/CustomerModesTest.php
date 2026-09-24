<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The same controller, exercised in every representation.
 */
class CustomerModesTest extends TestCase
{
    use RefreshDatabase;

    private const PAGE = 'application/vnd.bridge+json; v=1';

    protected function setUp(): void
    {
        parent::setUp();

        Customer::factory()->count(25)->create();
        Customer::factory()->create(['name' => 'Acme', 'email' => 'hello@acme.test', 'locked' => true]);
        $this->actingAs(User::factory()->create());
    }

    public function test_guests_are_represented_per_mode(): void
    {
        auth()->logout();
        $this->app['auth']->forgetGuards();

        $this->withHeaders(['Accept' => 'text/html'])->get('/customers')->assertRedirect('/login');
        $this->withHeaders(['Accept' => self::PAGE])->get('/customers')->assertBridgeError(401, 'unauthenticated')->assertJsonPath('error.redirect', '/login');
        $this->withHeaders(['Accept' => 'application/json'])->get('/customers')->assertUnauthorized()->assertExactJson(['message' => 'Unauthenticated.']);
    }

    public function test_bearer_tokens_work_on_the_same_routes(): void
    {
        auth()->logout();
        $this->app['auth']->forgetGuards();
        $token = User::factory()->create()->createToken('demo')->plainTextToken;

        $this->withHeaders(['Accept' => 'application/json', 'Authorization' => "Bearer {$token}"])
            ->get('/customers')
            ->assertOk()
            ->assertJsonMode();

        $this->withHeaders(['Accept' => 'application/json', 'Authorization' => "Bearer {$token}"])
            ->post('/customers', ['name' => 'Via token', 'email' => 'token@example.com'])
            ->assertCreated();
    }

    public function test_locked_customers_are_forbidden_per_mode(): void
    {
        $locked = Customer::where('email', 'hello@acme.test')->firstOrFail();

        $this->withHeaders(['Accept' => self::PAGE])->get("/customers/{$locked->id}/edit")->assertBridgeError(403, 'forbidden');
        $this->withHeaders(['Accept' => 'application/json'])->delete("/customers/{$locked->id}")->assertForbidden()->assertJsonStructure(['message']);
        $this->withHeaders(['Accept' => 'text/html'])->get("/customers/{$locked->id}/edit")->assertForbidden();
    }

    public function test_html_shell_embeds_the_page(): void
    {
        $this->withHeaders(['Accept' => 'text/html'])->get('/customers')
            ->assertOk()
            ->assertHtmlShell()
            ->assertBridgePage('Customers/Index', fn ($page) => $page->has('customers.data', 20)->deferred('default', ['stats']));
    }

    public function test_page_mode_returns_the_page_object(): void
    {
        $this->withHeaders(['Accept' => self::PAGE])->get('/customers?page=2')
            ->assertOk()
            ->assertHeader('Content-Type', 'application/vnd.bridge+json; v=1')
            ->assertBridgePage('Customers/Index', fn ($page) => $page
                ->url('/customers?page=2')
                ->has('customers.data', 6)
                ->where('customers.meta.total', 26)
                ->missing('stats')
                ->deferred('default', ['stats']));
    }

    public function test_json_mode_returns_the_envelope_with_deferred_props_inline(): void
    {
        $this->withHeaders(['Accept' => 'application/json'])->get('/customers?search=acme')
            ->assertOk()
            ->assertJsonMode()
            ->assertJsonPath('data.customers.meta.total', 1)
            ->assertJsonPath('data.customers.data.0.email', 'hello@acme.test')
            ->assertJsonPath('data.filters.search', 'acme')
            ->assertJsonPath('data.stats.total', 26);
    }

    public function test_partial_reload_returns_only_requested_props(): void
    {
        $response = $this->withHeaders([
            'Accept' => self::PAGE,
            'X-Bridge-Only' => 'stats',
            'X-Bridge-Component' => 'Customers/Index',
        ])->get('/customers')->assertOk();

        $props = $response->json('props');

        $this->assertArrayHasKey('stats', $props);
        $this->assertArrayNotHasKey('customers', $props);
    }

    public function test_validation_is_represented_per_mode(): void
    {
        $this->withHeaders(['Accept' => self::PAGE])->post('/customers', ['name' => 'a'])
            ->assertBridgeError(422, 'validation')
            ->assertJsonPath('error.errors.email.0', 'The email field is required.');

        $this->withHeaders(['Accept' => 'application/json'])->post('/customers', ['name' => 'a'])
            ->assertStatus(422)
            ->assertJsonStructure(['message', 'errors' => ['email', 'name']]);

        $this->withHeaders(['Accept' => 'text/html'])->from('/customers/create')->post('/customers', ['name' => 'a'])
            ->assertRedirect('/customers/create')
            ->assertSessionHasErrors('email');
    }

    public function test_starring_toggles_and_refuses_locked_customers_per_mode(): void
    {
        $customer = Customer::where('locked', false)->firstOrFail();
        $locked = Customer::where('email', 'hello@acme.test')->firstOrFail();

        $this->withHeaders(['Accept' => self::PAGE])->post("/customers/{$customer->id}/star")->assertStatus(303);
        $this->assertTrue($customer->refresh()->starred);

        $this->withHeaders(['Accept' => 'application/json'])->post("/customers/{$customer->id}/star")
            ->assertOk()
            ->assertJsonPath('data.customer.starred', false);

        $this->withHeaders(['Accept' => self::PAGE])->post("/customers/{$locked->id}/star")
            ->assertBridgeError(422, 'validation')
            ->assertJsonPath('error.errors.starred.0', 'Locked customers cannot be starred.');
        $this->withHeaders(['Accept' => 'application/json'])->post("/customers/{$locked->id}/star")->assertStatus(422);
        $this->assertFalse($locked->refresh()->starred);
    }

    public function test_store_is_represented_per_mode(): void
    {
        $this->withHeaders(['Accept' => 'application/json'])
            ->post('/customers', ['name' => 'Initech', 'email' => 'it@initech.test'])
            ->assertCreated()
            ->assertJsonPath('data.customer.name', 'Initech')
            ->assertJsonPath('meta.flash.message', 'Customer created.')
            ->assertHeader('Location');

        $this->withHeaders(['Accept' => self::PAGE])
            ->post('/customers', ['name' => 'Globex', 'email' => 'info@globex.test'])
            ->assertStatus(303);

        $globex = Customer::where('email', 'info@globex.test')->firstOrFail();

        $this->withHeaders(['Accept' => self::PAGE])->get("/customers/{$globex->id}")
            ->assertBridgePage('Customers/Show', fn ($page) => $page
                ->where('customer.name', 'Globex')
                ->where('flash.message', 'Customer created.'));
    }

    public function test_not_found_and_stream_accept(): void
    {
        config(['app.debug' => false]);

        $this->withHeaders(['Accept' => 'application/json'])->get('/customers/999999')
            ->assertNotFound()
            ->assertExactJson(['message' => 'Not Found.']);

        $this->withHeaders(['Accept' => self::PAGE])->get('/customers/999999')->assertBridgeError(404, 'not_found');

        $this->withHeaders(['Accept' => 'text/event-stream'])->get('/customers')->assertStatus(406);
    }

    public function test_dashboard_defers_groups(): void
    {
        $this->withHeaders(['Accept' => self::PAGE])->get('/')
            ->assertBridgePage('Dashboard', fn ($page) => $page
                ->has('recentCustomers', 5)
                ->deferred('default', ['stats'])
                ->deferred('charts', ['signups']));

        $this->withHeaders(['Accept' => 'application/json'])->get('/')
            ->assertJsonMode()
            ->assertJsonPath('data.stats.customers', 26)
            ->assertJsonStructure(['data' => ['signups']]);
    }
}
