<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token', 'google_maps_key'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'google_maps_key' => 'encrypted',
        ];
    }

    /** Chave do Google Maps usada nos projetos deste usuário (a da conta ou a do .env). */
    public function googleMapsKey(): ?string
    {
        try {
            $own = $this->google_maps_key;
        } catch (\Illuminate\Contracts\Encryption\DecryptException) {
            $own = null; // APP_KEY trocada: a chave antiga não abre mais
        }

        return $own ?: (config('services.google_maps.key') ?: null);
    }

    public function equipmentModels(): HasMany
    {
        return $this->hasMany(EquipmentModel::class);
    }

    public function projects(): HasMany
    {
        return $this->hasMany(Project::class);
    }
}
