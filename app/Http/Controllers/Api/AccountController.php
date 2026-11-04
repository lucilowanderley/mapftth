<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccountController extends Controller
{
    /**
     * Grava (ou apaga, com key vazia) a chave da Google Map Tiles API da conta.
     * Ela fica criptografada no banco e vale para todos os projetos de que o usuário é dono.
     */
    public function googleKey(Request $request): JsonResponse
    {
        $data = $request->validate([
            'key' => ['nullable', 'string', 'max:255', 'regex:/^[A-Za-z0-9_\-]+$/'],
        ], [
            'key.regex' => 'A chave do Google tem só letras, números, "-" e "_" (sem espaços).',
        ]);
        $user = $request->user();
        $user->google_maps_key = $data['key'] ?: null;
        $user->save();

        return response()->json([
            'google_maps_key' => $user->googleMapsKey(),
            'google_key_source' => $data['key'] ? 'account' : (config('services.google_maps.key') ? 'env' : null),
        ]);
    }
}
