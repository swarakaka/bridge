<?php

namespace App\Http\Controllers;

use Bridge\Bridge;

class JsonDemoController extends Controller
{
    public function __invoke()
    {
        return Bridge::render('Json', [
            'endpoints' => [
                ['method' => 'GET', 'path' => '/customers', 'label' => 'Customers list (paginated resource)'],
                ['method' => 'GET', 'path' => '/customers?search=acme', 'label' => 'Customers list, filtered'],
                ['method' => 'GET', 'path' => '/customers/1', 'label' => 'Customer #1 (locked)'],
                ['method' => 'GET', 'path' => '/', 'label' => 'Dashboard (deferred props resolved inline in JSON)'],
                ['method' => 'POST', 'path' => '/customers', 'label' => 'Create customer (validation and 201 + Location)'],
                ['method' => 'GET', 'path' => '/customers/999999', 'label' => '404'],
                ['method' => 'GET', 'path' => '/customers/1/edit', 'label' => '403 (locked customer)'],
            ],
            'accepts' => [
                'application/json',
                'application/vnd.bridge+json; v=1',
                'text/html',
                'text/event-stream',
            ],
        ]);
    }
}
