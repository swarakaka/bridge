<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use Bridge\Stream\Bus\BusManager;
use Bridge\Stream\Contracts\EventBus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RealtimeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->app->instance(EventBus::class, $this->app->make(BusManager::class)->driver('sync'));
        $this->actingAs(User::factory()->create());
    }

    private function frames(string $body): array
    {
        return array_values(array_filter(array_map(function (string $block) {
            $frame = [];
            foreach (explode("\n", $block) as $line) {
                if ($line === '' || str_starts_with($line, ':')) {
                    continue;
                }
                [$field, $value] = array_map('trim', explode(':', $line, 2) + [1 => '']);
                $frame[$field] = $field === 'data' ? json_decode($value, true) : $value;
            }

            return $frame;
        }, explode("\n\n", trim($body)))));
    }

    public function test_the_stream_is_negotiated_and_publishes_customer_changes(): void
    {
        $this->withHeaders(['Accept' => 'application/json'])->get('/events')->assertStatus(406);
        $this->withHeaders(['Accept' => 'text/html'])->get('/events')->assertStatus(406);

        // Creating a customer dispatches CustomerChanged → published to `customers`.
        $this->withHeaders(['Accept' => 'application/json'])
            ->post('/customers', ['name' => 'Streamed', 'email' => 'stream@example.com'])
            ->assertCreated();

        config(['bridge.stream.max_duration_s' => 0]);
        $response = $this->withHeaders(['Accept' => 'text/event-stream', 'Last-Event-ID' => '0'])->get('/events');
        $response->assertOk()->assertHeader('Content-Type', 'text/event-stream; charset=utf-8');

        $frames = $this->frames($response->streamedContent());
        $created = array_values(array_filter($frames, fn ($f) => ($f['event'] ?? null) === 'customer.created'));

        $this->assertSame('ready', $frames[1]['data']['type']);
        $this->assertCount(1, $created);
        $this->assertSame('Streamed', $created[0]['data']['customer']['name']);
        $this->assertSame('end', end($frames)['data']['type']);
    }

    public function test_guests_get_json_401_and_demo_triggers_publish_to_the_private_channel(): void
    {
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Accept' => 'text/event-stream'])->get('/events')->assertUnauthorized()->assertHeader('Content-Type', 'application/json');

        $user = User::factory()->create();
        $this->actingAs($user);
        $this->withHeaders(['Accept' => 'application/json'])->post('/realtime/notify', ['message' => 'hello'])->assertOk();
        $this->withHeaders(['Accept' => 'application/json'])->post('/realtime/prop', ['value' => 7])->assertOk();

        config(['bridge.stream.max_duration_s' => 0]);
        $frames = $this->frames($this->withHeaders(['Accept' => 'text/event-stream', 'Last-Event-ID' => '0'])->get('/events')->streamedContent());
        $types = array_map(fn ($f) => $f['data']['type'] ?? $f['event'] ?? null, $frames);

        $this->assertContains('notification', $types);
        $this->assertContains('prop', $types);
    }

    public function test_the_realtime_page_renders_in_every_mode(): void
    {
        Customer::factory()->count(3)->create();

        $this->withHeaders(['Accept' => 'application/vnd.bridge+json; v=1'])->get('/realtime')
            ->assertBridgePage('Realtime', fn ($page) => $page->where('customersCount', 3)->has('channels', 2));
        $this->withHeaders(['Accept' => 'application/json'])->get('/realtime')->assertJsonMode()->assertJsonPath('data.customersCount', 3);
    }

    public function test_customer_changes_reach_watched_props_with_the_hashed_client(): void
    {
        $this->withHeaders(['Accept' => 'application/json', 'X-Bridge-Client' => 'Zm9vYmFyYmF6cXV4cXV1eA.4'])
            ->post('/customers', ['name' => 'Watched', 'email' => 'watched@example.com'])
            ->assertCreated();
        $id = Customer::query()->where('email', 'watched@example.com')->value('id');
        $this->flushHeaders()->withHeaders(['Accept' => 'application/json'])->post('/realtime/touch')->assertOk();

        config(['bridge.stream.max_duration_s' => 0]);
        $frames = $this->frames($this->flushHeaders()->withHeaders(['Accept' => 'text/event-stream', 'Last-Event-ID' => '0'])->get('/events')->streamedContent());
        $watch = array_values(array_filter($frames, fn ($f) => ($f['data']['type'] ?? null) === 'invalidate'));

        $this->assertSame([
            ['type' => 'invalidate', 'keys' => [], 'tags' => ['customers', "customers.{$id}"], 'client' => 'ZnlfgKAmTkeQjF2rdZN7Lg.4'],
            ['type' => 'invalidate', 'keys' => [], 'tags' => ['customers.*']],
        ], array_column($watch, 'data'));
    }

    public function test_pages_list_their_watched_props(): void
    {
        $customer = Customer::factory()->create();
        $page = ['Accept' => 'application/vnd.bridge+json; v=1'];

        $this->withHeaders($page)->get("/customers/{$customer->id}")
            ->assertOk()
            ->assertJsonPath('meta.watch', ['customer' => ["customers.{$customer->id}"]]);
        $this->withHeaders($page)->get('/customers')->assertJsonPath('meta.watch', ['customers' => ['customers']]);
        $this->withHeaders($page)->get('/')->assertJsonPath('meta.watch', ['recentCustomers' => ['customers']]);
        $this->withHeaders(['Accept' => 'application/json'])->get('/customers')->assertJsonMissingPath('meta.watch');
    }

    public function test_tickets_open_the_stream_without_a_session(): void
    {
        $url = $this->withHeaders(['Accept' => 'application/json'])->post('/realtime/ticket')->assertOk()->json('url');
        $this->assertStringContainsString('/events/ticket?', $url);

        $this->app['auth']->forgetGuards();
        config(['bridge.stream.max_duration_s' => 0]);

        $this->flushHeaders()->withHeaders(['Accept' => 'text/event-stream'])->get($url)->assertOk()->assertHeader('Content-Type', 'text/event-stream; charset=utf-8');
    }
}
