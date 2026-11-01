<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Project extends Model
{
    protected $fillable = ['name', 'city', 'center_lat', 'center_lng', 'zoom', 'settings'];

    protected function casts(): array
    {
        return [
            'center_lat' => 'float',
            'center_lng' => 'float',
            'zoom' => 'integer',
            'settings' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function nodes(): HasMany
    {
        return $this->hasMany(NetworkNode::class);
    }

    public function cables(): HasMany
    {
        return $this->hasMany(Cable::class);
    }

    /** Configurações do projeto já mescladas com os padrões. */
    public function effectiveSettings(): array
    {
        return array_merge(config('ftth.defaults'), $this->settings ?? []);
    }
}
