<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ActivityLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['user_id', 'subject_type', 'subject_id', 'subject_name', 'action', 'changes'];

    protected function casts(): array
    {
        return ['changes' => 'array', 'created_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Registra uma ação no histórico do projeto. */
    public static function record(Project $project, string $type, ?Model $subject, string $action, ?array $changes = null, ?string $name = null): void
    {
        $project->activity()->create([
            'user_id' => auth()->id(),
            'subject_type' => $type,
            'subject_id' => $subject?->getKey(),
            'subject_name' => $name ?? $subject?->getAttribute('name'),
            'action' => $action,
            'changes' => $changes ?: null,
        ]);
    }
}
