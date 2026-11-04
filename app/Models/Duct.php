<?php

namespace App\Models;

use App\Services\Geo;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Duto: tubulação (geralmente subterrânea) entre caixas, POP e datacenter, por onde passam cabos. */
class Duct extends Model
{
    public const MATERIALS = ['pead', 'pvc', 'corrugated', 'steel', 'concrete', 'other'];

    public const PLACEMENTS = ['buried', 'directional', 'surface'];

    public const STATUSES = ['planned', 'not_deployed', 'deployed', 'certified'];

    protected $fillable = [
        'name', 'material', 'diameter_mm', 'subducts', 'placement', 'depth_m', 'status', 'color',
        'path', 'from_node_id', 'to_node_id', 'cable_ids', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'path' => 'array',
            'cable_ids' => 'array',
            'diameter_mm' => 'integer',
            'subducts' => 'integer',
            'depth_m' => 'float',
            'length_m' => 'float',
            'from_node_id' => 'integer',
            'to_node_id' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::saving(function (Duct $duct) {
            $duct->length_m = round(Geo::pathLength($duct->path ?? []), 2);
            $duct->cable_ids = array_values(array_unique(array_map('intval', $duct->cable_ids ?? [])));
        });
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** Tira o cabo excluído de todos os dutos do projeto. */
    public static function forgetCable(Cable $cable): void
    {
        static::where('project_id', $cable->project_id)->get()->each(function (Duct $d) use ($cable) {
            $ids = $d->cable_ids ?? [];
            if (in_array($cable->id, $ids, true)) {
                $d->cable_ids = array_values(array_diff($ids, [$cable->id]));
                $d->save();
            }
        });
    }
}
