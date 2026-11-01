<?php

use App\Http\Controllers\Api\CableController;
use App\Http\Controllers\Api\KmzController;
use App\Http\Controllers\Api\NodeController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\AuthController;
use Illuminate\Support\Facades\Route;

Route::get('/', fn () => redirect(auth()->check() ? '/app' : '/login'));

Route::middleware('guest')->group(function () {
    Route::get('/login', [AuthController::class, 'showLogin'])->name('login');
    Route::post('/login', [AuthController::class, 'login']);
    Route::get('/register', [AuthController::class, 'showRegister'])->name('register');
    Route::post('/register', [AuthController::class, 'register']);
});

Route::middleware('auth')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout'])->name('logout');

    // Aplicação React (SPA)
    Route::view('/app/{any?}', 'app')->where('any', '.*')->name('app');

    // API JSON usada pelo frontend (sessão + CSRF)
    Route::prefix('api')->group(function () {
        Route::get('/me', fn () => auth()->user()->only('id', 'name', 'email'));
        Route::apiResource('projects', ProjectController::class);
        Route::post('/projects/{project}/nodes', [NodeController::class, 'store']);
        Route::put('/nodes/{node}', [NodeController::class, 'update']);
        Route::delete('/nodes/{node}', [NodeController::class, 'destroy']);
        Route::post('/projects/{project}/cables', [CableController::class, 'store']);
        Route::put('/cables/{cable}', [CableController::class, 'update']);
        Route::delete('/cables/{cable}', [CableController::class, 'destroy']);
        Route::post('/projects/{project}/import', [KmzController::class, 'import']);
        Route::get('/projects/{project}/export', [KmzController::class, 'export']);
    });
});
