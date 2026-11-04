<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Chave da Google Map Tiles API da conta (criptografada com a APP_KEY).
        // Vale para todos os projetos de que o usuário é dono; null = usa GOOGLE_MAPS_KEY do .env.
        Schema::table('users', function (Blueprint $table) {
            $table->text('google_maps_key')->nullable()->after('password');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('google_maps_key');
        });
    }
};
