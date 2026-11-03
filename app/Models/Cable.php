<?php

namespace App\Models;

use App\Services\Geo;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Cable extends Model
{
    public const CATEGORIES = ['backbone', 'distribution', 'drop'];

    public const LINE_STYLES = ['solid', 'dashed', 'dotted'];

    /** Reserva técnica suspensa (aérea, no poste) ou subterrânea (caixa/câmara). */
    public const SLACK_KINDS = ['aerial', 'underground'];

    protected $fillable = [
        'name', 'category', 'model', 'fiber_count', 'fibers_per_tube', 'loss_db_km', 'status', 'color', 'width', 'line_style',
        'path', 'from_node_id', 'to_node_id', 'slack_m', 'slacks', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'path' => 'array',
            'fiber_count' => 'integer',
            'fibers_per_tube' => 'integer',
            'loss_db_km' => 'float',
            'width' => 'integer',
            'slack_m' => 'integer',
            'slacks' => 'array',
            'length_m' => 'float',
            'from_node_id' => 'integer',
            'to_node_id' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::saving(function (Cable $cable) {
            $cable->length_m = round(Geo::pathLength($cable->path ?? []), 2);
            // Com reservas posicionadas no mapa, a reserva total do cabo é a soma delas.
            if (is_array($cable->slacks) && count($cable->slacks)) {
                $cable->slack_m = (int) round(array_sum(array_column($cable->slacks, 'length_m')));
            }
        });
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function fromNode(): BelongsTo
    {
        return $this->belongsTo(NetworkNode::class, 'from_node_id');
    }

    public function toNode(): BelongsTo
    {
        return $this->belongsTo(NetworkNode::class, 'to_node_id');
    }
}
