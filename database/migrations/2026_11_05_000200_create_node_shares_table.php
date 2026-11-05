<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Objetos compartilhados: o mesmo poste/POP/caixa... aparece em outros projetos além do de origem
     * (network_nodes.project_id). É o mesmo registro, então editar num projeto reflete em todos.
     */
    public function up(): void
    {
        Schema::create('node_shares', function (Blueprint $table) {
            $table->id();
            $table->foreignId('network_node_id')->constrained()->cascadeOnDelete();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['network_node_id', 'project_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('node_shares');
    }
};
