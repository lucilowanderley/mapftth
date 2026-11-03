<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Modelo de equipamento cadastrado pelo usuário (OLT, DIO ou ativo), com altura em U.
 * Com `replaces`, substitui (edição) ou oculta (`hidden`) um modelo padrão do sistema.
 */
class EquipmentModel extends Model
{
    public const KINDS = ['olt', 'dio', 'active'];

    protected $fillable = ['kind', 'vendor', 'model', 'type', 'ports', 'slots', 'uplinks', 'tx_dbm', 'height_u', 'port_groups', 'notes', 'replaces', 'hidden'];

    protected $hidden = ['image_path'];

    protected $appends = ['image_url'];

    /** Endereço da foto de referência (com versão, para o navegador não usar a antiga do cache). */
    public function getImageUrlAttribute(): ?string
    {
        if (! $this->image_path) {
            return null;
        }

        return "/api/equipment-models/{$this->id}/image?v=".substr(md5($this->image_path), 0, 8);
    }

    protected function casts(): array
    {
        return [
            'ports' => 'integer',
            'slots' => 'integer',
            'uplinks' => 'integer',
            'tx_dbm' => 'float',
            'height_u' => 'integer',
            'port_groups' => 'array',
            'hidden' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
