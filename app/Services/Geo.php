<?php

namespace App\Services;

class Geo
{
    private const EARTH_RADIUS_M = 6371008.8;

    /** Distância geodésica (haversine) em metros entre dois pontos [lat, lng]. */
    public static function distance(array $a, array $b): float
    {
        [$lat1, $lng1] = [deg2rad((float) $a[0]), deg2rad((float) $a[1])];
        [$lat2, $lng2] = [deg2rad((float) $b[0]), deg2rad((float) $b[1])];
        $h = sin(($lat2 - $lat1) / 2) ** 2 + cos($lat1) * cos($lat2) * sin(($lng2 - $lng1) / 2) ** 2;

        return 2 * self::EARTH_RADIUS_M * asin(min(1.0, sqrt($h)));
    }

    /** Comprimento total em metros de uma polilinha [[lat, lng], ...]. */
    public static function pathLength(array $path): float
    {
        $total = 0.0;
        for ($i = 1; $i < count($path); $i++) {
            $total += self::distance($path[$i - 1], $path[$i]);
        }

        return $total;
    }
}
