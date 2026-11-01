<?php

namespace App\Models;

use App\Services\Geo;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Cable extends Model
{
    public const CATEGORIES = ['backbone', 'distribution', 'drop'];

    protected $fillable = [
        'name', 'category', 'model', 'fiber_count', 'fibers_per_tube', 'status', 'color', 'width',
        'path', 'from_node_id', 'to_node_id', 'slack_m', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'path' => 'array',
            'fiber_count' => 'integer',
            'fibers_per_tube' => 'integer',
            'width' => 'integer',
            'slack_m' => 'integer',
            'length_m' => 'float',
            'from_node_id' => 'integer',
            'to_node_id' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::saving(function (Cable $cable) {
            $cable->length_m = round(Geo::pathLength($cable->path ?? []), 2);
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
