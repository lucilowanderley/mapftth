<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Modelos padrão do sistema editados ou excluídos pelo usuário:
        // `replaces` = id do padrão ("zte-c320"); `hidden` = padrão excluído (oculto) para esse usuário.
        Schema::table('equipment_models', function (Blueprint $table) {
            $table->string('replaces', 60)->nullable()->after('notes');
            $table->boolean('hidden')->default(false)->after('replaces');
        });
    }

    public function down(): void
    {
        Schema::table('equipment_models', function (Blueprint $table) {
            $table->dropColumn(['replaces', 'hidden']);
        });
    }
};
