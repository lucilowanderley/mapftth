<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Grupos de portas do ativo: [{type, count, speed}] (tipo, quantidade, capacidade em Gbps).
        Schema::table('equipment_models', function (Blueprint $table) {
            $table->json('port_groups')->nullable()->after('height_u');
        });
    }

    public function down(): void
    {
        Schema::table('equipment_models', function (Blueprint $table) {
            $table->dropColumn('port_groups');
        });
    }
};
