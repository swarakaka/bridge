<?php

namespace App\Http\Controllers;

use Bridge\Bridge;
use Illuminate\Http\Request;

/**
 * Issues Sanctum personal access tokens so the JSON demo page (and curl) can
 * call the same routes as a mobile client would.
 */
class TokenController extends Controller
{
    public function index(Request $request)
    {
        return Bridge::render('Auth/Tokens', [
            'tokens' => $request->user()->tokens()->latest()->get()->map(fn ($token) => [
                'id' => $token->id,
                'name' => $token->name,
                'last_used_at' => $token->last_used_at?->toIso8601String(),
                'created_at' => $token->created_at?->toIso8601String(),
            ])->all(),
            'plainTextToken' => fn () => $request->session()->get('plainTextToken'),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:60']]);
        $token = $request->user()->createToken($data['name']);
        $request->session()->flash('plainTextToken', $token->plainTextToken);

        return Bridge::redirect()
            ->route('tokens.index')
            ->with('token', ['name' => $data['name'], 'plainTextToken' => $token->plainTextToken])
            ->flash('Token created. Copy it now; it is shown once.')
            ->created();
    }

    public function destroy(Request $request, int $tokenId)
    {
        $request->user()->tokens()->where('id', $tokenId)->delete();

        return Bridge::redirect()->route('tokens.index')->flash('Token revoked.', 'info');
    }
}
