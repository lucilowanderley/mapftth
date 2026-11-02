<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cables', function (Blueprint $table) {
            // null = automático (tracejado quando "Em projeto"); solid, dashed ou dotted.
            $table->string('line_style', 10)->nullable()->after('width');
        });
    }

    public function down(): void
    {
        Schema::table('cables', function (Blueprint $table) {
            $table->dropColumn('line_style');
        });
    }
};
