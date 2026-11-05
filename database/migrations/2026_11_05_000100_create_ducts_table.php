<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Dutos (tubulação subterrânea por onde os cabos passam), desenhados como linha entre caixas/POP/DC.
        Schema::create('ducts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            // pead, pvc, corrugated, steel, concrete, other
            $table->string('material', 16)->default('pead');
            // Diâmetro externo nominal (mm)
            $table->unsignedSmallInteger('diameter_mm')->default(40);
            // Subdutos (tritubo = 3); 0 = duto simples
            $table->unsignedTinyInteger('subducts')->default(0);
            // buried (enterrado/vala), directional (MND / perfuração direcional), surface (aparente / fachada / ponte)
            $table->string('placement', 16)->default('buried');
            $table->decimal('depth_m', 5, 2)->nullable();
            $table->string('status', 16)->default('planned');
            $table->string('color', 16)->default('#A16207');
            $table->json('path');
            $table->foreignId('from_node_id')->nullable()->constrained('network_nodes')->nullOnDelete();
            $table->foreignId('to_node_id')->nullable()->constrained('network_nodes')->nullOnDelete();
            $table->decimal('length_m', 12, 2)->default(0);
            // Cabos que passam pelo duto: [id, ...]
            $table->json('cable_ids')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ducts');
    }
};
