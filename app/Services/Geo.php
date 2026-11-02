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

    /** Ponto a $meters metros do início da polilinha. */
    public static function pointAlong(array $path, float $meters): array
    {
        for ($i = 1; $i < count($path); $i++) {
            $seg = self::distance($path[$i - 1], $path[$i]);
            if ($meters <= $seg && $seg > 0) {
                $t = $meters / $seg;

                return [
                    round($path[$i - 1][0] + ($path[$i][0] - $path[$i - 1][0]) * $t, 7),
                    round($path[$i - 1][1] + ($path[$i][1] - $path[$i - 1][1]) * $t, 7),
                ];
            }
            $meters -= $seg;
        }

        return $path[count($path) - 1] ?? [0, 0];
    }

    /** Distância aproximada (m) de um ponto até a polilinha (projeção local plana). */
    public static function distanceToPath(array $p, array $path): float
    {
        $k = cos(deg2rad((float) $p[0]));
        $xy = fn ($q) => [(float) $q[1] * 111320 * $k, (float) $q[0] * 110574];
        [$px, $py] = $xy($p);
        $best = INF;
        for ($i = 1; $i < count($path); $i++) {
            [$ax, $ay] = $xy($path[$i - 1]);
            [$bx, $by] = $xy($path[$i]);
            $dx = $bx - $ax;
            $dy = $by - $ay;
            $len2 = $dx * $dx + $dy * $dy;
            $t = $len2 ? max(0, min(1, (($px - $ax) * $dx + ($py - $ay) * $dy) / $len2)) : 0;
            $best = min($best, hypot($ax + $t * $dx - $px, $ay + $t * $dy - $py));
        }

        return $best;
    }
}
