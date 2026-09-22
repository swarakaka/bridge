<?php

namespace App\Http\Controllers;

use Bridge\Facades\Bridge;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function create()
    {
        return Bridge::render('Auth/Login', [
            'hint' => ['email' => 'ada@example.com', 'password' => 'password'],
        ]);
    }

    public function store(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required'],
        ]);

        if (! Auth::attempt($credentials, $request->boolean('remember'))) {
            throw ValidationException::withMessages(['email' => 'These credentials do not match our records.']);
        }

        $request->session()->regenerate();

        return Bridge::redirect()->to($request->session()->pull('url.intended', route('customers.index')))->flash('Welcome back, '.$request->user()->name.'.');
    }

    public function destroy(Request $request)
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return Bridge::redirect()->route('dashboard')->flash('Signed out.', 'info');
    }
}
