<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Atenuação própria do cabo (dB/km). null = usa a padrão do projeto.
        Schema::table('cables', function (Blueprint $table) {
            $table->decimal('loss_db_km', 6, 3)->nullable()->after('fibers_per_tube');
        });
    }

    public function down(): void
    {
        Schema::table('cables', function (Blueprint $table) {
            $table->dropColumn('loss_db_km');
        });
    }
};
