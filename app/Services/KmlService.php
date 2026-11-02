<?php

namespace App\Services;

use App\Models\Cable;
use App\Models\NetworkNode;
use App\Models\Project;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use SimpleXMLElement;
use ZipArchive;

class KmlService
{
    /** Distância máxima (m) para ligar a ponta de um cabo a uma caixa. */
    private const SNAP_METERS = 15;

    private const TYPE_LABELS = ['pop' => 'POPs', 'ceo' => 'CEOs', 'cto' => 'CTOs', 'pole' => 'Postes', 'client' => 'Clientes'];

    private const CATEGORY_LABELS = ['backbone' => 'Cabos backbone', 'distribution' => 'Cabos distribuição', 'drop' => 'Cabos drop'];

    /** Lê o conteúdo KML de um arquivo .kml ou .kmz. */
    public function readKml(string $path, string $originalName): string
    {
        if (str_ends_with(strtolower($originalName), '.kml')) {
            return (string) file_get_contents($path);
        }
        $zip = new ZipArchive;
        if ($zip->open($path) !== true) {
            throw new RuntimeException('Arquivo KMZ inválido.');
        }
        $kml = $zip->getFromName('doc.kml');
        if ($kml === false) {
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $name = $zip->getNameIndex($i);
                if (str_ends_with(strtolower($name), '.kml')) {
                    $kml = $zip->getFromIndex($i);
                    break;
                }
            }
        }
        $zip->close();
        if ($kml === false || $kml === null) {
            throw new RuntimeException('Nenhum arquivo KML encontrado dentro do KMZ.');
        }

        return $kml;
    }

    /**
     * Importa pontos (caixas, postes, clientes) e linhas (cabos) do KML para o projeto.
     *
     * @return array{nodes: int, cables: int}
     */
    public function import(Project $project, string $kml, string $defaultType = 'pole'): array
    {
        $previous = libxml_use_internal_errors(true);
        $xml = simplexml_load_string($kml, SimpleXMLElement::class, LIBXML_NONET);
        libxml_use_internal_errors($previous);
        if ($xml === false) {
            throw new RuntimeException('Não foi possível ler o KML.');
        }

        $points = [];
        $lines = [];
        foreach ($xml->xpath('//*[local-name()="Placemark"]') ?: [] as $pm) {
            $name = trim((string) ($pm->xpath('./*[local-name()="name"]')[0] ?? ''));
            $folders = array_map(
                fn ($n) => (string) $n,
                $pm->xpath('ancestor::*[local-name()="Folder"]/*[local-name()="name"]') ?: [],
            );
            $context = strtolower($name.' '.implode(' ', $folders));

            foreach ($pm->xpath('.//*[local-name()="Point"]/*[local-name()="coordinates"]') ?: [] as $coords) {
                $pts = $this->parseCoordinates((string) $coords);
                if ($pts) {
                    $points[] = ['name' => $name, 'context' => $context, 'at' => $pts[0]];
                }
            }
            foreach ($pm->xpath('.//*[local-name()="LineString"]/*[local-name()="coordinates"]') ?: [] as $coords) {
                $pts = $this->parseCoordinates((string) $coords);
                if (count($pts) >= 2) {
                    $lines[] = ['name' => $name, 'context' => $context, 'path' => $pts];
                }
            }
        }

        return DB::transaction(function () use ($project, $points, $lines, $defaultType) {
            $counters = [];
            $created = [];
            foreach ($points as $p) {
                $type = $this->guessNodeType($p['context']) ?? $defaultType;
                $counters[$type] = ($counters[$type] ?? $project->nodes()->where('type', $type)->count()) + 1;
                $created[] = $project->nodes()->create([
                    'type' => $type,
                    'name' => $p['name'] !== '' ? mb_substr($p['name'], 0, 255) : strtoupper($type).'-'.$counters[$type],
                    'lat' => $p['at'][0],
                    'lng' => $p['at'][1],
                ]);
            }

            // Pontas dos cabos se ligam a caixas próximas (exceto postes).
            $anchors = $project->nodes()->where('type', '!=', 'pole')->get();
            foreach ($lines as $l) {
                $fibers = preg_match('/(\d{1,3})\s*(fo|f\b|fibras?)/i', $l['context'], $m) ? (int) $m[1] : 12;
                $category = str_contains($l['context'], 'drop') ? 'drop'
                    : (preg_match('/backbone|tronco/', $l['context']) ? 'backbone' : 'distribution');
                $from = $this->nearest($anchors, $l['path'][0]);
                $to = $this->nearest($anchors, end($l['path']));
                $path = $l['path'];
                if ($from) {
                    $path[0] = [$from->lat, $from->lng];
                }
                if ($to && $to->id !== $from?->id) {
                    $path[count($path) - 1] = [$to->lat, $to->lng];
                }
                $project->cables()->create([
                    'name' => $l['name'] !== '' ? mb_substr($l['name'], 0, 255) : "Cabo {$fibers}FO",
                    'category' => $category,
                    'fiber_count' => max(1, min(288, $fibers)),
                    'fibers_per_tube' => $fibers >= 12 ? 12 : max(1, $fibers),
                    'color' => ['backbone' => '#EF4444', 'distribution' => '#0EA5E9', 'drop' => '#22C55E'][$category],
                    'width' => $category === 'drop' ? 2 : 4,
                    'path' => $path,
                    'from_node_id' => $from?->id,
                    'to_node_id' => $to && $to->id !== $from?->id ? $to->id : null,
                ]);
            }
            $project->touch();

            return ['nodes' => count($created), 'cables' => count($lines)];
        });
    }

    /** Gera um KML completo do projeto, com pastas por tipo de elemento. */
    public function export(Project $project): string
    {
        $nodes = $project->nodes()->orderBy('id')->get()->groupBy('type');
        $cables = $project->cables()->orderBy('id')->get()->groupBy('category');
        $e = fn ($s) => htmlspecialchars((string) $s, ENT_XML1 | ENT_QUOTES, 'UTF-8');

        $styles = '';
        foreach (['pop' => 'ff7c3aed', 'ceo' => 'ffe9a50e', 'cto' => 'ff1673f9', 'pole' => 'ffb8a394', 'client' => 'ff5ec522'] as $type => $abgr) {
            $styles .= "<Style id=\"node-{$type}\"><IconStyle><color>{$abgr}</color><scale>0.9</scale>"
                .'<Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle></Style>';
        }

        $folders = '';
        foreach (self::TYPE_LABELS as $type => $label) {
            if (! isset($nodes[$type])) {
                continue;
            }
            $folders .= "<Folder><name>{$label}</name>";
            foreach ($nodes[$type] as $n) {
                $folders .= "<Placemark><name>{$e($n->name)}</name><styleUrl>#node-{$type}</styleUrl>"
                    ."<ExtendedData><Data name=\"tipo\"><value>{$type}</value></Data><Data name=\"status\"><value>{$n->status}</value></Data></ExtendedData>"
                    ."<Point><coordinates>{$n->lng},{$n->lat},0</coordinates></Point></Placemark>";
            }
            $folders .= '</Folder>';
        }
        foreach (self::CATEGORY_LABELS as $cat => $label) {
            if (! isset($cables[$cat])) {
                continue;
            }
            $folders .= "<Folder><name>{$label}</name>";
            foreach ($cables[$cat] as $c) {
                $color = $this->kmlColor($c->color);
                $coords = implode(' ', array_map(fn ($p) => "{$p[1]},{$p[0]},0", $c->path));
                $folders .= "<Placemark><name>{$e($c->name)}</name>"
                    ."<description>{$c->fiber_count}FO · {$c->length_m} m + {$c->slack_m} m reserva</description>"
                    ."<Style><LineStyle><color>{$color}</color><width>{$c->width}</width></LineStyle></Style>"
                    ."<ExtendedData><Data name=\"fibras\"><value>{$c->fiber_count}</value></Data><Data name=\"status\"><value>{$c->status}</value></Data></ExtendedData>"
                    ."<LineString><tessellate>1</tessellate><coordinates>{$coords}</coordinates></LineString></Placemark>";
            }
            $folders .= '</Folder>';
        }

        // Reservas técnicas posicionadas: um ponto por reserva, com metragem e tipo.
        $slackItems = '';
        foreach ($project->cables()->orderBy('id')->get() as $c) {
            foreach ($c->slacks ?? [] as $r) {
                $kind = ($r['kind'] ?? 'aerial') === 'underground' ? 'Subterrânea' : 'Suspensa';
                $slackItems .= "<Placemark><name>Reserva {$r['length_m']} m · {$e($c->name)}</name>"
                    ."<description>{$kind}".(! empty($r['notes']) ? ' · '.$e($r['notes']) : '').'</description>'
                    .'<styleUrl>#slack-'.($kind === 'Suspensa' ? 'aerial' : 'underground').'</styleUrl>'
                    ."<ExtendedData><Data name=\"cabo\"><value>{$e($c->name)}</value></Data><Data name=\"metragem\"><value>{$r['length_m']}</value></Data><Data name=\"tipo\"><value>{$kind}</value></Data></ExtendedData>"
                    ."<Point><coordinates>{$r['lng']},{$r['lat']},0</coordinates></Point></Placemark>";
            }
        }
        if ($slackItems) {
            $styles .= '<Style id="slack-aerial"><IconStyle><color>ff00a5ff</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/target.png</href></Icon></IconStyle></Style>'
                .'<Style id="slack-underground"><IconStyle><color>ff2a2aa5</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/square.png</href></Icon></IconStyle></Style>';
            $folders .= "<Folder><name>Reservas técnicas</name>{$slackItems}</Folder>";
        }

        return '<?xml version="1.0" encoding="UTF-8"?>'
            .'<kml xmlns="http://www.opengis.net/kml/2.2"><Document>'
            ."<name>{$e($project->name)}</name>{$styles}{$folders}</Document></kml>";
    }

    /** Empacota o KML em um arquivo KMZ temporário e devolve o caminho. */
    public function toKmz(string $kml): string
    {
        $path = tempnam(sys_get_temp_dir(), 'kmz');
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::OVERWRITE);
        $zip->addFromString('doc.kml', $kml);
        $zip->close();

        return $path;
    }

    /** @return array<int, array{0: float, 1: float}> pontos [lat, lng] */
    private function parseCoordinates(string $text): array
    {
        $points = [];
        foreach (preg_split('/\s+/', trim($text)) ?: [] as $tuple) {
            $parts = explode(',', $tuple);
            if (count($parts) >= 2 && is_numeric($parts[0]) && is_numeric($parts[1])) {
                $points[] = [round((float) $parts[1], 7), round((float) $parts[0], 7)];
            }
        }

        return $points;
    }

    private function guessNodeType(string $context): ?string
    {
        return match (true) {
            (bool) preg_match('/\bctos?\b|caixa de (atendimento|termina)/', $context) => 'cto',
            (bool) preg_match('/\bceos?\b|emenda/', $context) => 'ceo',
            (bool) preg_match('/\bpops?\b|\bolts?\b|datacenter/', $context) => 'pop',
            (bool) preg_match('/poste/', $context) => 'pole',
            (bool) preg_match('/client|\bonu\b|assinante/', $context) => 'client',
            default => null,
        };
    }

    private function nearest($anchors, array $point): ?NetworkNode
    {
        $best = null;
        $bestDist = self::SNAP_METERS;
        foreach ($anchors as $n) {
            $d = Geo::distance([$n->lat, $n->lng], $point);
            if ($d <= $bestDist) {
                $best = $n;
                $bestDist = $d;
            }
        }

        return $best;
    }

    /** Converte #RRGGBB em aabbggrr do KML. */
    private function kmlColor(string $hex): string
    {
        $hex = ltrim($hex, '#');

        return 'ff'.strtolower(substr($hex, 4, 2).substr($hex, 2, 2).substr($hex, 0, 2));
    }
}
