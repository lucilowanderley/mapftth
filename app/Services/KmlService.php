<?php

namespace App\Services;

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

    private const TYPE_LABELS = ['pop' => 'POPs', 'dc' => 'Datacenters', 'tower' => 'Torres', 'ceo' => 'CEOs', 'cto' => 'CTOs', 'box' => 'Caixas', 'pole' => 'Postes', 'client' => 'Clientes', 'condo' => 'Condomínios', 'camera' => 'Câmeras'];

    private const DUCT_MATERIALS = ['pead' => 'PEAD', 'pvc' => 'PVC', 'corrugated' => 'Corrugado', 'steel' => 'Aço galvanizado', 'concrete' => 'Concreto', 'other' => 'Outro'];

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
     * Importa pontos (caixas, postes, clientes), linhas (cabos) e polígonos (áreas) do KML.
     *
     * Entende também a exportação do ISM: pastas "Terminais de atendimento" (CTO),
     * "Caixas de emenda" (CEO), "Estações" (POP; ícone de antena = torre), "Racks",
     * "Postes" (com subpastas "De 0 até 500") e "Áreas personalizadas".
     *
     * @param  array{pole_owner?: string|null}  $options
     * @return array{nodes: int, cables: int, areas: int, skipped: int}
     */
    public function import(Project $project, string $kml, string $defaultType = 'pole', array $options = []): array
    {
        $previous = libxml_use_internal_errors(true);
        $xml = simplexml_load_string($kml, SimpleXMLElement::class, LIBXML_NONET);
        libxml_use_internal_errors($previous);
        if ($xml === false) {
            throw new RuntimeException('Não foi possível ler o KML.');
        }

        $styles = $this->readStyles($xml);
        $points = [];
        $lines = [];
        $polygons = [];
        foreach ($xml->xpath('//*[local-name()="Placemark"]') ?: [] as $pm) {
            $name = trim((string) ($pm->xpath('./*[local-name()="name"]')[0] ?? ''));
            $description = $this->cleanDescription((string) ($pm->xpath('./*[local-name()="description"]')[0] ?? ''));
            $folders = array_map(
                fn ($n) => mb_strtolower((string) $n),
                $pm->xpath('ancestor::*[local-name()="Folder"]/*[local-name()="name"]') ?: [],
            );
            $context = mb_strtolower($name.' '.implode(' ', $folders));
            $styleUrl = ltrim(trim((string) ($pm->xpath('./*[local-name()="styleUrl"]')[0] ?? '')), '#');
            $inline = $pm->xpath('./*[local-name()="Style"]')[0] ?? null;
            $style = $inline !== null ? $this->styleOf($inline) : ($styles[$styleUrl] ?? []);
            $base = compact('name', 'description', 'folders', 'context', 'style');

            foreach ($pm->xpath('.//*[local-name()="Point"]/*[local-name()="coordinates"]') ?: [] as $coords) {
                $pts = $this->parseCoordinates((string) $coords);
                if ($pts) {
                    $points[] = $base + ['at' => $pts[0]];
                }
            }
            foreach ($pm->xpath('.//*[local-name()="LineString"]/*[local-name()="coordinates"]') ?: [] as $coords) {
                $pts = $this->parseCoordinates((string) $coords);
                if (count($pts) >= 2) {
                    $lines[] = $base + ['path' => $pts];
                }
            }
            foreach ($pm->xpath('.//*[local-name()="Polygon"]/*[local-name()="outerBoundaryIs"]//*[local-name()="coordinates"]') ?: [] as $coords) {
                $pts = $this->parseCoordinates((string) $coords);
                if (count($pts) >= 2 && $pts[0] === end($pts)) {
                    array_pop($pts);
                }
                if (count($pts) >= 3) {
                    $polygons[] = $base + ['polygon' => $pts];
                }
            }
        }

        return DB::transaction(function () use ($project, $points, $lines, $polygons, $defaultType, $options) {
            $counters = [];
            $created = 0;
            $skipped = 0;
            // Evita duplicar o mesmo elemento (mesmo tipo e nome a menos de 2 m),
            // por exemplo ao importar "postes COSERN" e "postes INTELNET" no mesmo projeto.
            $seen = [];
            foreach ($project->nodes()->get(['type', 'name', 'lat', 'lng']) as $n) {
                $seen[$n->type.'|'.mb_strtolower($n->name)][] = [$n->lat, $n->lng];
            }
            foreach ($points as $p) {
                $type = $this->typeFromFolders($p['folders'], $p['style']['icon'] ?? '')
                    ?? $this->guessNodeType($p['context'])
                    ?? $defaultType;
                $counters[$type] = ($counters[$type] ?? $project->nodes()->where('type', $type)->count()) + 1;
                $name = $p['name'] !== '' ? mb_substr($p['name'], 0, 255) : strtoupper($type).'-'.$counters[$type];
                $key = $type.'|'.mb_strtolower($name);
                foreach ($seen[$key] ?? [] as $at) {
                    if (Geo::distance($at, $p['at']) < 2) {
                        $skipped++;

                        continue 2;
                    }
                }
                $seen[$key][] = $p['at'];

                $attributes = [];
                if ($type === 'pole' && ! empty($options['pole_owner'])) {
                    $attributes['owner'] = $options['pole_owner'];
                }
                if (in_array($type, ['pop', 'dc'], true) && preg_match('/\bracks?\b/u', implode(' ', $p['folders']))) {
                    $attributes['imported_kind'] = 'rack';
                }
                $project->nodes()->create([
                    'type' => $type,
                    'name' => $name,
                    'lat' => $p['at'][0],
                    'lng' => $p['at'][1],
                    'notes' => $p['description'] !== '' ? $p['description'] : null,
                    'attributes' => $attributes ?: null,
                ]);
                $created++;
            }

            // Pontas dos cabos se ligam a caixas próximas (exceto postes).
            $anchors = $project->nodes()->where('type', '!=', 'pole')->get();
            // Linhas dentro de uma pasta "Dutos" (ou "Subdutos", "Tubulação") viram dutos, não cabos.
            [$ductLines, $lines] = collect($lines)->partition(
                fn ($l) => (bool) preg_match('/\b(sub)?dutos?\b|tubula[çc][ãa]o|tubula[çc][õo]es/u', implode(' ', $l['folders']))
            )->map->values()->all();
            foreach ($ductLines as $i => $l) {
                $from = $this->nearest($anchors, $l['path'][0]);
                $to = $this->nearest($anchors, end($l['path']));
                $path = $l['path'];
                if ($from) {
                    $path[0] = [$from->lat, $from->lng];
                }
                if ($to && $to->id !== $from?->id) {
                    $path[count($path) - 1] = [$to->lat, $to->lng];
                }
                $ctx = $l['context'].' '.mb_strtolower($l['description']);
                $material = match (true) {
                    str_contains($ctx, 'pvc') => 'pvc',
                    str_contains($ctx, 'corrugad') => 'corrugated',
                    (bool) preg_match('/\ba[çc]o\b|ferro|galvaniz/u', $ctx) => 'steel',
                    str_contains($ctx, 'concreto') => 'concrete',
                    default => 'pead',
                };
                $diameter = preg_match('/(\d{2,3})\s*mm/u', $ctx, $m) ? (int) $m[1] : 40;
                $sub = preg_match('/(\d{1,2})\s*subdutos/u', $ctx, $m) ? (int) $m[1] : (str_contains($ctx, 'tritubo') ? 3 : 0);
                // A descrição gerada pelo próprio MapFTTH ("PVC 100 mm · 120 m") não vira observação.
                $generated = (bool) preg_match('/^\S.* \d+ mm( · \d+ subdutos)? · [\d.]+ m/u', $l['description']);
                $project->ducts()->create([
                    'name' => $l['name'] !== '' ? mb_substr($l['name'], 0, 255) : 'Duto '.($i + 1),
                    'material' => $material,
                    'diameter_mm' => max(10, min(1000, $diameter)),
                    'subducts' => min(24, $sub),
                    'color' => $l['style']['line'] ?? '#A16207',
                    'path' => $path,
                    'from_node_id' => $from?->id,
                    'to_node_id' => $to && $to->id !== $from?->id ? $to->id : null,
                    'notes' => $l['description'] !== '' && ! $generated ? $l['description'] : null,
                ]);
            }
            foreach ($lines as $l) {
                $fibers = preg_match('/(\d{1,3})\s*(fo|f0|f\b|fibras?)/i', $l['context'], $m) ? (int) $m[1] : 12;
                $fibers = $fibers > 0 ? $fibers : 12;
                $category = str_contains($l['context'], 'drop') ? 'drop'
                    : (preg_match('/backbone|tronco|(^|[^a-z])bck([^a-z]|$)/', $l['context']) ? 'backbone' : 'distribution');
                $from = $this->nearest($anchors, $l['path'][0]);
                $to = $this->nearest($anchors, end($l['path']));
                $path = $l['path'];
                if ($from) {
                    $path[0] = [$from->lat, $from->lng];
                }
                if ($to && $to->id !== $from?->id) {
                    $path[count($path) - 1] = [$to->lat, $to->lng];
                }
                // O ISM coloca o código interno do cabo no fim do nome: "CABO 01 (152)".
                $name = $l['name'];
                $notes = $l['description'];
                if (preg_match('/^(.*\S)\s*\((\d+)\)$/u', $name, $m)) {
                    $name = $m[1];
                    $notes = trim("Código de origem: {$m[2]}\n".$notes);
                }
                $width = (int) round($l['style']['width'] ?? 0);
                $project->cables()->create([
                    'name' => $name !== '' ? mb_substr($name, 0, 255) : "Cabo {$fibers}FO",
                    'category' => $category,
                    'fiber_count' => max(1, min(288, $fibers)),
                    'fibers_per_tube' => $fibers >= 12 ? 12 : max(1, $fibers),
                    'color' => $l['style']['line'] ?? ['backbone' => '#EF4444', 'distribution' => '#0EA5E9', 'drop' => '#22C55E'][$category],
                    'width' => $width >= 1 && $width <= 12 ? $width : ($category === 'drop' ? 2 : 4),
                    'path' => $path,
                    'from_node_id' => $from?->id,
                    'to_node_id' => $to && $to->id !== $from?->id ? $to->id : null,
                    'notes' => $notes !== '' ? $notes : null,
                ]);
            }

            foreach ($polygons as $i => $a) {
                $project->areas()->create([
                    'name' => $a['name'] !== '' ? mb_substr($a['name'], 0, 255) : 'Área '.($i + 1),
                    'color' => $a['style']['poly'] ?? $a['style']['line'] ?? '#10B981',
                    'polygon' => $a['polygon'],
                    'notes' => $a['description'] !== '' ? $a['description'] : null,
                ]);
            }
            $project->touch();

            return ['nodes' => $created, 'cables' => count($lines), 'ducts' => count($ductLines), 'areas' => count($polygons), 'skipped' => $skipped];
        });
    }

    /** Gera um KML completo do projeto, com pastas por tipo de elemento. */
    public function export(Project $project): string
    {
        $nodes = $project->nodes()->orderBy('id')->get()->groupBy('type');
        $cables = $project->cables()->orderBy('id')->get()->groupBy('category');
        $e = fn ($s) => htmlspecialchars((string) $s, ENT_XML1 | ENT_QUOTES, 'UTF-8');

        $styles = '';
        foreach (['pop' => 'ff7c3aed', 'dc' => 'ff88940d', 'tower' => 'ff5e3ff4', 'ceo' => 'ffe9a50e', 'cto' => 'ff1673f9', 'box' => 'fff16663', 'pole' => 'ffb8a394', 'client' => 'ff5ec522', 'condo' => 'ffef46d9', 'camera' => 'ff08b3ea'] as $type => $abgr) {
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

        // Dutos: linha grossa marrom, com material, diâmetro, subdutos e os cabos que passam por eles.
        $ducts = $project->ducts()->orderBy('id')->get();
        if ($ducts->isNotEmpty()) {
            $cableNames = $project->cables()->pluck('name', 'id');
            $folders .= '<Folder><name>Dutos</name>';
            foreach ($ducts as $d) {
                $color = $this->kmlColor($d->color);
                $coords = implode(' ', array_map(fn ($p) => "{$p[1]},{$p[0]},0", $d->path));
                $names = collect($d->cable_ids ?? [])->map(fn ($id) => $cableNames[$id] ?? null)->filter()->implode(', ');
                $material = self::DUCT_MATERIALS[$d->material] ?? $d->material;
                $sub = $d->subducts ? " · {$d->subducts} subdutos" : '';
                $folders .= "<Placemark><name>{$e($d->name)}</name>"
                    ."<description>{$e($material)} {$d->diameter_mm} mm{$sub} · {$d->length_m} m".($names !== '' ? ' · cabos: '.$e($names) : '').'</description>'
                    ."<Style><LineStyle><color>{$color}</color><width>6</width></LineStyle></Style>"
                    ."<ExtendedData><Data name=\"material\"><value>{$e($material)}</value></Data><Data name=\"diametro_mm\"><value>{$d->diameter_mm}</value></Data>"
                    ."<Data name=\"subdutos\"><value>{$d->subducts}</value></Data><Data name=\"status\"><value>{$d->status}</value></Data><Data name=\"cabos\"><value>{$e($names)}</value></Data></ExtendedData>"
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

    /**
     * Ícones da exportação do ISM (o nome do arquivo é o md5 do ícone em base64,
     * então é o mesmo em todo arquivo exportado). Estação com antena = torre.
     */
    private const ISM_TOWER_ICONS = ['ZmU4ZjllNGY2ZTUwMGMxMWQ0YzgxMTc2NTY1ZjA0Zjk'];

    /** Tipo pelo nome da pasta, da mais interna para a mais externa. */
    private function typeFromFolders(array $folders, string $icon): ?string
    {
        foreach (array_reverse($folders) as $folder) {
            $type = match (true) {
                (bool) preg_match('/terminais? de atendimento|caixas? de atendimento|\bctos?\b/u', $folder) => 'cto',
                (bool) preg_match('/caixas? de emenda|\bceos?\b/u', $folder) => 'ceo',
                (bool) preg_match('/esta[çc](ões|oes|ão|ao)\b/u', $folder) => 'pop',
                (bool) preg_match('/\bracks?\b|\bpops?\b/u', $folder) => 'pop',
                (bool) preg_match('/\btorres?\b/u', $folder) => 'tower',
                (bool) preg_match('/\bpostes?\b/u', $folder) => 'pole',
                (bool) preg_match('/\bclientes?\b|\bassinantes?\b/u', $folder) => 'client',
                default => null,
            };
            if ($type !== null) {
                if ($type === 'pop') {
                    foreach (self::ISM_TOWER_ICONS as $tower) {
                        if (str_contains($icon, $tower)) {
                            return 'tower';
                        }
                    }
                }

                return $type;
            }
        }

        return null;
    }

    /** @return array<string, array{line?: string, width?: float, poly?: string, icon?: string}> */
    private function readStyles(SimpleXMLElement $xml): array
    {
        $styles = [];
        foreach ($xml->xpath('//*[local-name()="Style"][@id]') ?: [] as $st) {
            $styles[(string) $st['id']] = $this->styleOf($st);
        }
        // StyleMap: usa o estilo "normal".
        foreach ($xml->xpath('//*[local-name()="StyleMap"][@id]') ?: [] as $map) {
            foreach ($map->xpath('./*[local-name()="Pair"]') ?: [] as $pair) {
                if (trim((string) ($pair->xpath('./*[local-name()="key"]')[0] ?? '')) === 'normal') {
                    $ref = ltrim(trim((string) ($pair->xpath('./*[local-name()="styleUrl"]')[0] ?? '')), '#');
                    $styles[(string) $map['id']] = $styles[$ref] ?? [];
                }
            }
        }

        return $styles;
    }

    private function styleOf(SimpleXMLElement $st): array
    {
        $out = [];
        $line = trim((string) ($st->xpath('./*[local-name()="LineStyle"]/*[local-name()="color"]')[0] ?? ''));
        if ($hex = $this->hexColor($line)) {
            $out['line'] = $hex;
        }
        $width = (string) ($st->xpath('./*[local-name()="LineStyle"]/*[local-name()="width"]')[0] ?? '');
        if (is_numeric($width)) {
            $out['width'] = (float) $width;
        }
        $poly = trim((string) ($st->xpath('./*[local-name()="PolyStyle"]/*[local-name()="color"]')[0] ?? ''));
        if ($hex = $this->hexColor($poly)) {
            $out['poly'] = $hex;
        }
        $icon = trim((string) ($st->xpath('./*[local-name()="IconStyle"]//*[local-name()="href"]')[0] ?? ''));
        if ($icon !== '') {
            $out['icon'] = $icon;
        }

        return $out;
    }

    /** Converte aabbggrr do KML em #RRGGBB. */
    private function hexColor(string $abgr): ?string
    {
        if (! preg_match('/^[0-9a-f]{8}$/i', $abgr)) {
            return null;
        }

        return '#'.strtoupper(substr($abgr, 6, 2).substr($abgr, 4, 2).substr($abgr, 2, 2));
    }

    private function cleanDescription(string $html): string
    {
        $text = html_entity_decode(strip_tags(preg_replace('/<br\s*\/?>/i', "\n", $html) ?? ''), ENT_QUOTES | ENT_HTML5, 'UTF-8');

        return mb_substr(trim(preg_replace("/[ \t]+/", ' ', $text) ?? ''), 0, 2000);
    }

    /** "…_POSTES COSERN (2)" → "COSERN": dono dos postes pelo nome do arquivo. */
    public static function poleOwnerFromFileName(string $fileName): ?string
    {
        $base = preg_replace('/\.(kmz|kml)$/i', '', $fileName) ?? $fileName;
        if (preg_match('/postes?\s+(?!com\b|de\b|do\b|da\b)([\p{L}\d][\p{L}\d.\-]*)/iu', $base, $m)) {
            return mb_strtoupper($m[1]);
        }

        return null;
    }

    private function guessNodeType(string $context): ?string
    {
        return match (true) {
            (bool) preg_match('/\bctos?\b|caixa de (atendimento|termina)/', $context) => 'cto',
            (bool) preg_match('/\bceos?\b|emenda/', $context) => 'ceo',
            (bool) preg_match('/caixa (de )?(passagem|subterr|parede)|\bcx\b|\bcaixas?\b/u', $context) => 'box',
            (bool) preg_match('/data ?cent(er|ro)s?/', $context) => 'dc',
            (bool) preg_match('/\bpops?\b|\bolts?\b/', $context) => 'pop',
            (bool) preg_match('/condom[ií]nio|edif[ií]cio|residencial/iu', $context) => 'condo',
            (bool) preg_match('/\btorres?\b|\btowers?\b|\berbs?\b|\brbs\b/u', $context) => 'tower',
            (bool) preg_match('/c[aâ]meras?|\bcftv\b|\bdvr\b|\bnvr\b/u', $context) => 'camera',
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
