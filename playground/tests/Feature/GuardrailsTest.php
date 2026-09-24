<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Upload validation, Precognition and token ownership: the checks a client
 * relies on but the happy-path tests never reach.
 */
class GuardrailsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        $this->actingAs(User::factory()->create());
    }

    public function test_avatar_uploads_must_be_small_images(): void
    {
        $post = fn (UploadedFile $avatar) => $this->withHeaders(['Accept' => 'application/json'])
            ->post('/customers', ['name' => 'Initech', 'email' => 'it@initech.test', 'avatar' => $avatar]);

        $post(UploadedFile::fake()->create('notes.pdf', 10, 'application/pdf'))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('avatar');
        $post(UploadedFile::fake()->image('huge.png')->size(3000))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('avatar');

        $this->assertDatabaseCount('customers', 0);
        $this->assertSame([], Storage::disk('public')->allFiles());

        $post(UploadedFile::fake()->image('ok.png')->size(100))->assertCreated();
        $this->assertCount(1, Storage::disk('public')->files('avatars'));
    }

    public function test_precognition_validates_without_running_the_controller(): void
    {
        $precognitive = ['Accept' => 'application/json', 'Precognition' => 'true'];

        $this->withHeaders($precognitive)
            ->post('/customers', ['name' => '', 'email' => 'not-an-email'])
            ->assertUnprocessable()
            ->assertHeader('Precognition', 'true')
            ->assertJsonValidationErrors(['name', 'email']);

        // Only the named field is validated; the empty name is not reported.
        $this->withHeaders($precognitive + ['Precognition-Validate-Only' => 'email'])
            ->post('/customers', ['name' => '', 'email' => 'fine@example.com'])
            ->assertNoContent()
            ->assertHeader('Precognition-Success', 'true');

        $this->withHeaders($precognitive)
            ->post('/customers', ['name' => 'Initech', 'email' => 'it@initech.test'])
            ->assertNoContent();

        $this->assertDatabaseCount('customers', 0);
    }

    public function test_a_user_cannot_revoke_someone_elses_token(): void
    {
        $other = User::factory()->create();
        $theirs = $other->createToken('theirs')->accessToken;
        $mine = auth()->user()->createToken('mine')->accessToken;

        $this->withHeaders(['Accept' => 'application/json'])->delete("/tokens/{$theirs->id}")->assertOk();
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $theirs->id]);

        $this->withHeaders(['Accept' => 'application/json'])->delete("/tokens/{$mine->id}")->assertOk();
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $mine->id]);
    }
}
