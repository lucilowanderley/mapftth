<?php

namespace App\Models;

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Crypt;

class NetworkNode extends Model
{
    public const TYPES = ['cto', 'ceo', 'pop', 'dc', 'tower', 'pole', 'client', 'condo', 'camera'];

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
}
