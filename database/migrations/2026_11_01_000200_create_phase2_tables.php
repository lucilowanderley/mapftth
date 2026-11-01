<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Membros da equipe com acesso a um projeto (o dono fica em projects.user_id).
        Schema::create('project_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // admin: gerencia equipe e edita; editor: edita a rede; viewer: só visualiza
            $table->string('role', 16)->default('viewer');
            $table->timestamps();
            $table->unique(['project_id', 'user_id']);
        });

        // Histórico de alterações (quem fez o quê em cada caixa/cabo).
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('subject_type', 16); // node, cable, area, project, member
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->string('subject_name')->nullable();
            $table->string('action', 32); // created, updated, deleted, moved, diagram, imported
            $table->json('changes')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['project_id', 'subject_type', 'subject_id']);
        });

        // Áreas desenhadas no mapa (bairros, células de atendimento, regiões de projeto).
        Schema::create('areas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('color', 16)->default('#A855F7');
            $table->json('polygon');
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('areas');
        Schema::dropIfExists('activity_logs');
        Schema::dropIfExists('project_members');
    }
};
