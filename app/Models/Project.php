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

    public function members(): HasMany
    {
        return $this->hasMany(ProjectMember::class);
    }

    public function areas(): HasMany
    {
        return $this->hasMany(Area::class);
    }

    public function activity(): HasMany
    {
        return $this->hasMany(ActivityLog::class);
    }

    /** Papel do usuário no projeto: owner, admin, editor, viewer ou null (sem acesso). */
    public function roleOf(?User $user): ?string
    {
        if (! $user) {
            return null;
        }
        if ($this->user_id === $user->id) {
            return 'owner';
        }

        return $this->members()->where('user_id', $user->id)->value('role');
    }

    /** Projetos que o usuário pode abrir (próprios e compartilhados). */
    public static function accessibleBy(User $user)
    {
        return static::query()->where(fn ($q) => $q
            ->where('user_id', $user->id)
            ->orWhereHas('members', fn ($m) => $m->where('user_id', $user->id)));
    }

    /** Configurações do projeto já mescladas com os padrões. */
    public function effectiveSettings(): array
    {
        return array_merge(config('ftth.defaults'), $this->settings ?? []);
    }
}
