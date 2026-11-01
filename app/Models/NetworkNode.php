<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NetworkNode extends Model
{
    public const TYPES = ['cto', 'ceo', 'pop', 'pole', 'client'];

    public const STATUSES = ['planned', 'not_deployed', 'deployed', 'certified'];

    protected $fillable = ['type', 'name', 'lat', 'lng', 'status', 'notes', 'attributes', 'diagram'];

    protected function casts(): array
    {
        return [
            'lat' => 'float',
            'lng' => 'float',
            'attributes' => 'array',
            'diagram' => 'array',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }
}
