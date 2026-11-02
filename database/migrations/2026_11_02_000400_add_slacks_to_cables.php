<?php

use App\Services\Geo;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cables', function (Blueprint $table) {
            // Reservas técnicas posicionadas: [{id, lat, lng, length_m, kind: aerial|underground, notes}]
            $table->json('slacks')->nullable()->after('slack_m');
        });

        // A reserva antiga (só metragem) vira uma reserva suspensa no meio do cabo, para ser reposicionada.
        DB::table('cables')->where('slack_m', '>', 0)->orderBy('id')->each(function ($c) {
            $path = json_decode($c->path, true) ?: [];
            if (count($path) < 2) {
                return;
            }
            [$lat, $lng] = Geo::pointAlong($path, Geo::pathLength($path) / 2);
            DB::table('cables')->where('id', $c->id)->update(['slacks' => json_encode([[
                'id' => 'r'.Str::lower(Str::random(7)),
                'lat' => $lat,
                'lng' => $lng,
                'length_m' => (int) $c->slack_m,
                'kind' => 'aerial',
                'notes' => 'Migrada: posicione no local correto',
            ]])]);
        });
    }

    public function down(): void
    {
        Schema::table('cables', function (Blueprint $table) {
            $table->dropColumn('slacks');
        });
    }
};
