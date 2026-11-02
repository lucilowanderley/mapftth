<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Cadastro de modelos de equipamento (OLT, DIO, ativos) de cada usuário.
        Schema::create('equipment_models', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 16)->index();
            $table->string('vendor', 120)->nullable();
            $table->string('model', 160);
            $table->string('type', 60)->nullable();
            $table->unsignedSmallInteger('ports');
            $table->unsignedSmallInteger('slots')->nullable();
            $table->unsignedSmallInteger('uplinks')->nullable();
            $table->decimal('tx_dbm', 5, 2)->nullable();
            $table->unsignedTinyInteger('height_u')->default(1);
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('equipment_models');
    }
};
