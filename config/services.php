<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // Mapas do Google (Map Tiles API). Opcional: sem chave as opções do Google não aparecem.
    'google_maps' => [
        'key' => env('GOOGLE_MAPS_KEY'),
    ],

    // Lançamento de cabo: caminho pela rua (OSRM). Vazio = servidores públicos do OpenStreetMap (sem chave),
    // com linha reta quando não respondem. ROUTING_URL aponta para um OSRM próprio (ex.: http://localhost:5000).
    'routing' => [
        'url' => env('ROUTING_URL'),
    ],

    // Câmeras (objeto Câmera): teste de comunicação e foto feitos pelo servidor. CAMERA_CHECK=false desliga.
    'cameras' => [
        'check' => env('CAMERA_CHECK', true),
        'allow_loopback' => env('CAMERA_ALLOW_LOOPBACK', false),
    ],

];
