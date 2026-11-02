<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Modelo de equipamento cadastrado pelo usuário (OLT, DIO ou ativo), com altura em U. */
class EquipmentModel extends Model
{
    public const KINDS = ['olt', 'dio', 'active'];

    protected $fillable = ['kind', 'vendor', 'model', 'type', 'ports', 'slots', 'uplinks', 'tx_dbm', 'height_u', 'notes'];

    protected function casts(): array
    {
        return [
            'ports' => 'integer',
            'slots' => 'integer',
            'uplinks' => 'integer',
            'tx_dbm' => 'float',
            'height_u' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
