<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Area extends Model
{
    protected $fillable = ['name', 'color', 'polygon', 'notes'];

    protected function casts(): array
    {
        return ['polygon' => 'array'];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }
}
