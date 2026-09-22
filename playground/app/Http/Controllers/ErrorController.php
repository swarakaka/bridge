<?php

namespace App\Http\Controllers;

use Bridge\Facades\Bridge;
use Illuminate\Auth\AuthenticationException;

class ErrorController extends Controller
{
    public function index()
    {
        return Bridge::render('Errors/Index');
    }

    public function trigger(int $status)
    {
        return match ($status) {
            401 => throw new AuthenticationException,
            403 => abort(403, 'You may not do that.'),
            404 => abort(404),
            419 => abort(419),
            500 => throw new \RuntimeException('Something exploded on purpose.'),
            default => abort($status),
        };
    }
}
