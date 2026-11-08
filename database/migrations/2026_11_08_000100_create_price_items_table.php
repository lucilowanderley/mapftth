<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Cadastro de preços (valor de mercado) de cada usuário: materiais, equipamentos, postes,
        // dutos, caixas, lançamento e mão de obra. `key` liga o item às quantidades calculadas
        // da rede (ex.: "cable:12", "node:cto", "labor:fusion"); sem key = item avulso.
        Schema::create('price_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('key', 120)->nullable();
            $table->string('category', 20)->index();
            $table->string('name', 160);
            $table->string('unit', 12)->default('un');
            $table->decimal('price', 14, 2)->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'key']);
        });

        // Orçamento do projeto: BDI, desconto, escopo, quantidades ajustadas e itens extras.
        Schema::table('projects', function (Blueprint $table) {
            $table->json('budget')->nullable()->after('settings');
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn('budget');
        });
        Schema::dropIfExists('price_items');
    }
};
