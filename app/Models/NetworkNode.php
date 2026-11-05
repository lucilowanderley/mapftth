<?php

namespace App\Models;

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Facades\Crypt;

class NetworkNode extends Model
{
    public const TYPES = ['cto', 'ceo', 'box', 'pop', 'dc', 'tower', 'pole', 'client', 'condo', 'camera'];

    public const STATUSES = ['planned', 'not_deployed', 'deployed', 'certified'];

    /** Tipos de cliente (assinante): residencial, empresarial e corporativo. */
    public const CLIENT_SEGMENTS = ['residential', 'business', 'corporate'];

    /** Chave (em attributes) da senha da câmera/DVR, criptografada com a APP_KEY. Nunca sai na API. */
    public const CAMERA_SECRET = 'cam_secret';

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

    /** Senha da câmera/DVR decifrada (só usada no servidor, para testar e buscar a foto). */
    public function cameraPassword(): ?string
    {
        $enc = $this->attributesArray()[self::CAMERA_SECRET] ?? null;
        if (! is_string($enc) || $enc === '') {
            return null;
        }
        try {
            return Crypt::decryptString($enc);
        } catch (DecryptException) {
            return null;
        }
    }

    private function attributesArray(): array
    {
        $a = $this->getAttribute('attributes');

        return is_array($a) ? $a : [];
    }

    /** Esconde a senha criptografada: a API só diz se existe uma guardada. */
    public function toArray(): array
    {
        $out = parent::toArray();
        if (is_array($out['attributes'] ?? null) && array_key_exists(self::CAMERA_SECRET, $out['attributes'])) {
            unset($out['attributes'][self::CAMERA_SECRET]);
            $out['attributes']['cam_has_password'] = true;
        }

        return $out;
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** Outros projetos onde este objeto também aparece (compartilhado). O de origem é project_id. */
    public function sharedProjects(): BelongsToMany
    {
        return $this->belongsToMany(Project::class, 'node_shares')->withTimestamps();
    }

    /** Objetos visíveis num projeto: os dele e os compartilhados com ele. */
    public function scopeVisibleIn(Builder $query, int $projectId): Builder
    {
        return $query->where(fn ($q) => $q
            ->where('network_nodes.project_id', $projectId)
            ->orWhereIn('network_nodes.id', fn ($s) => $s->select('network_node_id')->from('node_shares')->where('project_id', $projectId)));
    }

    /** IDs de todos os projetos onde o objeto aparece (origem primeiro). */
    public function projectIds(): array
    {
        return array_values(array_unique([(int) $this->project_id, ...$this->sharedProjects()->pluck('projects.id')->map(fn ($id) => (int) $id)->all()]));
    }

    public function isVisibleIn(int $projectId): bool
    {
        return (int) $this->project_id === $projectId || $this->sharedProjects()->where('projects.id', $projectId)->exists();
    }
}
