<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Item do cadastro de preços (valor de mercado). Com `key`, substitui o preço do item padrão
 * correspondente (cabo 12FO, CTO, fusão...); sem `key`, é um item avulso cadastrado pelo usuário.
 */
class PriceItem extends Model
{
    public const CATEGORIES = ['active', 'passive', 'cable', 'box', 'pole', 'duct', 'launch', 'labor', 'other'];

    protected $fillable = ['key', 'category', 'name', 'unit', 'price', 'notes'];

    protected function casts(): array
    {
        return ['price' => 'float'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
