<?php

use App\Http\Controllers\Api\AccountController;
use App\Http\Controllers\Api\ActivityController;
use App\Http\Controllers\Api\AreaController;
use App\Http\Controllers\Api\DuctController;
use App\Http\Controllers\Api\CableController;
use App\Http\Controllers\Api\CameraController;
use App\Http\Controllers\Api\DuplicateController;
use App\Http\Controllers\Api\EquipmentModelController;
use App\Http\Controllers\Api\FixBulkController;
use App\Http\Controllers\Api\KmzController;
use App\Http\Controllers\Api\LaunchController;
use App\Http\Controllers\Api\MemberController;
use App\Http\Controllers\Api\NodeController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\ProjectImportController;
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
        Route::put('/me/google-maps-key', [AccountController::class, 'googleKey']);
        Route::post('/projects/import', [ProjectImportController::class, 'store']);
        Route::apiResource('projects', ProjectController::class);
        Route::post('/projects/{project}/nodes', [NodeController::class, 'store']);
        Route::post('/projects/{project}/nodes/bulk', [NodeController::class, 'bulk']);
        Route::put('/nodes/{node}', [NodeController::class, 'update']);
        Route::delete('/nodes/{node}', [NodeController::class, 'destroy']);
        // Objetos compartilhados entre projetos
        Route::post('/nodes/{node}/shares', [NodeController::class, 'share']);
        Route::delete('/nodes/{node}/shares/{project}', [NodeController::class, 'unshare']);
        Route::get('/duplicates', [DuplicateController::class, 'index']);
        Route::post('/duplicates/merge', [DuplicateController::class, 'merge']);
        Route::post('/nodes/{node}/camera/check', [CameraController::class, 'check'])->middleware('throttle:30,1');
        Route::get('/nodes/{node}/camera/snapshot', [CameraController::class, 'snapshot'])->middleware('throttle:60,1');
        Route::post('/projects/{project}/cables', [CableController::class, 'store']);
        Route::put('/cables/{cable}', [CableController::class, 'update']);
        Route::delete('/cables/{cable}', [CableController::class, 'destroy']);
        Route::post('/projects/{project}/launch/route', [LaunchController::class, 'route'])->middleware('throttle:30,1');
        Route::post('/projects/{project}/launch', [LaunchController::class, 'store']);
        Route::post('/projects/{project}/fix-bulk', [FixBulkController::class, 'store']);
        Route::post('/cables/{cable}/split', [CableController::class, 'split']);
        Route::post('/projects/{project}/import', [KmzController::class, 'import']);
        Route::get('/projects/{project}/export', [KmzController::class, 'export']);
        Route::post('/projects/{project}/areas', [AreaController::class, 'store']);
        Route::put('/areas/{area}', [AreaController::class, 'update']);
        Route::delete('/areas/{area}', [AreaController::class, 'destroy']);
        Route::post('/projects/{project}/ducts', [DuctController::class, 'store']);
        Route::put('/ducts/{duct}', [DuctController::class, 'update']);
        Route::delete('/ducts/{duct}', [DuctController::class, 'destroy']);
        Route::get('/projects/{project}/members', [MemberController::class, 'index']);
        Route::post('/projects/{project}/members', [MemberController::class, 'store']);
        Route::put('/projects/{project}/members/{member}', [MemberController::class, 'update']);
        Route::delete('/projects/{project}/members/{member}', [MemberController::class, 'destroy']);
        Route::get('/projects/{project}/activity', [ActivityController::class, 'index']);
        Route::apiResource('equipment-models', EquipmentModelController::class)->except('show');
        Route::get('/equipment-models/{equipmentModel}/image', [EquipmentModelController::class, 'image']);
        Route::post('/equipment-models/{equipmentModel}/image', [EquipmentModelController::class, 'storeImage']);
        Route::delete('/equipment-models/{equipmentModel}/image', [EquipmentModelController::class, 'destroyImage']);
    });
});
