<?php

namespace App\Services;

/**
 * Referências a cabos dentro do diagrama de uma caixa: pontas das conexões ("c12"/"f3"), posição do cartão
 * do cabo (cablePos), cabos vinculados ao DIO, rotas (cable = "c12") e tubos nas bandejas ("c12:t2").
 */
class DiagramRefs
{
    /** Troca o cabo $from pelo $to em todas as referências. */
    public static function rename(?array $diagram, int $from, int $to): ?array
    {
        if (! $diagram || $from === $to) {
            return $diagram;
        }
        $old = 'c'.$from;
        $new = 'c'.$to;
        foreach ($diagram['connections'] ?? [] as $i => $conn) {
            foreach (['a', 'b'] as $side) {
                if (($conn[$side]['c'] ?? null) === $old) {
                    $diagram['connections'][$i][$side]['c'] = $new;
                }
            }
        }
        if (isset($diagram['cablePos'][$old])) {
            $diagram['cablePos'][$new] ??= $diagram['cablePos'][$old];
            unset($diagram['cablePos'][$old]);
        }
        foreach ($diagram['components'] ?? [] as $i => $comp) {
            if (isset($comp['cables']) && is_array($comp['cables'])) {
                $diagram['components'][$i]['cables'] = array_values(array_unique(array_map(fn ($c) => $c === $old ? $new : $c, $comp['cables'])));
            }
            if (($comp['cable'] ?? null) === $old) {
                $diagram['components'][$i]['cable'] = $new;
            }
        }
        foreach ($diagram['trays'] ?? [] as $i => $tray) {
            $diagram['trays'][$i]['tubes'] = array_values(array_unique(array_map(
                fn ($k) => str_starts_with((string) $k, $old.':') ? $new.substr((string) $k, strlen($old)) : $k,
                $tray['tubes'] ?? [],
            )));
        }

        return $diagram;
    }

    /** Tira o cabo do diagrama (conexões, cartão, DIO, rotas e tubos das bandejas). */
    public static function forget(?array $diagram, int $cableId): ?array
    {
        if (! $diagram) {
            return $diagram;
        }
        $key = 'c'.$cableId;
        $diagram['connections'] = array_values(array_filter(
            $diagram['connections'] ?? [],
            fn ($c) => ($c['a']['c'] ?? null) !== $key && ($c['b']['c'] ?? null) !== $key,
        ));
        unset($diagram['cablePos'][$key]);
        $components = [];
        foreach ($diagram['components'] ?? [] as $comp) {
            if (($comp['kind'] ?? null) === 'route' && ($comp['cable'] ?? null) === $key) {
                continue;
            }
            if (isset($comp['cables']) && is_array($comp['cables'])) {
                $comp['cables'] = array_values(array_filter($comp['cables'], fn ($c) => $c !== $key));
            }
            $components[] = $comp;
        }
        $diagram['components'] = $components;
        foreach ($diagram['trays'] ?? [] as $i => $tray) {
            $diagram['trays'][$i]['tubes'] = array_values(array_filter($tray['tubes'] ?? [], fn ($k) => ! str_starts_with((string) $k, $key.':')));
        }

        return $diagram;
    }

    /** Conexões do diagrama que tocam o cabo. */
    public static function connectionsOf(?array $diagram, int $cableId): array
    {
        $key = 'c'.$cableId;

        return array_values(array_filter(
            $diagram['connections'] ?? [],
            fn ($c) => ($c['a']['c'] ?? null) === $key || ($c['b']['c'] ?? null) === $key,
        ));
    }

    /** Fibras do cabo ocupadas por alguma conexão do diagrama. */
    public static function usedFibers(?array $diagram, int $cableId): array
    {
        $key = 'c'.$cableId;
        $used = [];
        foreach ($diagram['connections'] ?? [] as $c) {
            foreach (['a', 'b'] as $side) {
                if (($c[$side]['c'] ?? null) === $key) {
                    $used[(int) substr((string) ($c[$side]['p'] ?? 'f0'), 1)] = true;
                }
            }
        }

        return $used;
    }
}
