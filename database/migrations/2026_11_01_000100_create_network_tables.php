<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('projects', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('city')->nullable();
            $table->decimal('center_lat', 10, 7);
            $table->decimal('center_lng', 10, 7);
            $table->unsignedTinyInteger('zoom')->default(16);
            // Parâmetros de perda e potência (dB / dBm)
            $table->json('settings')->nullable();
            $table->timestamps();
        });

        Schema::create('network_nodes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            // cto, ceo, pop, pole, client
            $table->string('type', 16)->index();
            $table->string('name');
            $table->decimal('lat', 10, 7);
            $table->decimal('lng', 10, 7);
            // planned, not_deployed, deployed, certified
            $table->string('status', 16)->default('planned');
            $table->text('notes')->nullable();
            // Atributos específicos (capacidade, endereço do cliente...)
            $table->json('attributes')->nullable();
            // Diagrama de fusão: splitters, OLTs, DIOs, conexões e posições
            $table->json('diagram')->nullable();
            $table->timestamps();
        });

        Schema::create('cables', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            // backbone, distribution, drop
            $table->string('category', 16)->default('distribution');
            $table->string('model')->nullable();
            $table->unsignedSmallInteger('fiber_count')->default(12);
            $table->unsignedTinyInteger('fibers_per_tube')->default(12);
            $table->string('status', 16)->default('planned');
            $table->string('color', 16)->default('#0EA5E9');
            $table->unsignedTinyInteger('width')->default(4);
            $table->json('path');
            $table->foreignId('from_node_id')->nullable()->constrained('network_nodes')->nullOnDelete();
            $table->foreignId('to_node_id')->nullable()->constrained('network_nodes')->nullOnDelete();
            // Reserva técnica total em metros
            $table->unsignedInteger('slack_m')->default(0);
            $table->decimal('length_m', 12, 2)->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cables');
        Schema::dropIfExists('network_nodes');
        Schema::dropIfExists('projects');
    }
};
