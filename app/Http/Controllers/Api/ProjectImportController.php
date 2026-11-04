<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Project;
use App\Services\KmlService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;
use ZipArchive;

/**
 * Importa vários arquivos de uma vez (KMZ/KML soltos ou um .zip com eles,
 * como a exportação do ISM) e cria um projeto para cada arquivo.
 */
class ProjectImportController extends Controller
{
    private const MAX_FILES = 100;

    private const MAX_ENTRY_BYTES = 60 * 1024 * 1024;

    public function __construct(private KmlService $kml) {}

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'files' => ['required', 'array', 'min:1', 'max:'.self::MAX_FILES],
            'files.*' => ['file', 'max:204800'],
        ]);

        $sources = [];
        foreach ($request->file('files') as $file) {
            $name = $file->getClientOriginalName();
            if (preg_match('/\.zip$/i', $name)) {
                try {
                    array_push($sources, ...$this->fromZip($file->getRealPath()));
                } catch (RuntimeException $e) {
                    $sources[] = ['name' => $name, 'error' => $e->getMessage()];
                }
            } elseif (preg_match('/\.(kmz|kml)$/i', $name)) {
                $sources[] = ['name' => $name, 'path' => $file->getRealPath()];
            } else {
                $sources[] = ['name' => $name, 'error' => 'Envie arquivos .kmz, .kml ou .zip.'];
            }
        }
        if (count($sources) > self::MAX_FILES) {
            return response()->json(['message' => 'No máximo '.self::MAX_FILES.' arquivos por vez.'], 422);
        }

        $results = [];
        foreach ($sources as $src) {
            if (isset($src['error'])) {
                $results[] = ['file' => $src['name'], 'error' => $src['error']];

                continue;
            }
            try {
                $results[] = ['file' => $src['name']] + $this->importOne($request, $src['name'], $src['path']);
            } catch (Throwable $e) {
                report($e);
                $results[] = ['file' => $src['name'], 'error' => $e instanceof RuntimeException ? $e->getMessage() : 'Falha ao importar este arquivo.'];
            } finally {
                if (! empty($src['temp'])) {
                    @unlink($src['path']);
                }
            }
        }

        return response()->json(['results' => $results]);
    }

    /** @return array{project_id: int, name: string, nodes: int, cables: int, areas: int, skipped: int} */
    private function importOne(Request $request, string $fileName, string $path): array
    {
        $kml = $this->kml->readKml($path, $fileName);
        [$name, $city] = self::projectName($fileName);

        return DB::transaction(function () use ($request, $kml, $fileName, $name, $city) {
            /** @var Project $project */
            $project = $request->user()->projects()->create([
                'name' => $name,
                'city' => $city,
                'center_lat' => 0,
                'center_lng' => 0,
                'zoom' => 15,
            ]);
            $result = $this->kml->import($project, $kml, 'pole', [
                'pole_owner' => KmlService::poleOwnerFromFileName($fileName),
            ]);
            $this->centerOn($project);
            ActivityLog::record($project, 'project', null, 'imported', $result, $fileName);

            return ['project_id' => $project->id, 'name' => $project->name] + $result;
        });
    }

    /**
     * Extrai do .zip só os .kmz/.kml (inclusive em subpastas), para arquivos temporários.
     *
     * @return array<int, array{name: string, path?: string, temp?: bool, error?: string}>
     */
    private function fromZip(string $zipPath): array
    {
        $zip = new ZipArchive;
        if ($zip->open($zipPath) !== true) {
            throw new RuntimeException('Arquivo .zip inválido.');
        }
        $out = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            $entry = (string) ($stat['name'] ?? '');
            $base = basename(str_replace('\\', '/', $entry));
            if (str_ends_with($entry, '/') || str_starts_with($entry, '__MACOSX') || str_starts_with($base, '.')
                || ! preg_match('/\.(kmz|kml)$/i', $base)) {
                continue;
            }
            if (count($out) >= self::MAX_FILES) {
                break;
            }
            if (($stat['size'] ?? 0) > self::MAX_ENTRY_BYTES) {
                $out[] = ['name' => $base, 'error' => 'Arquivo grande demais.'];

                continue;
            }
            $data = $zip->getFromIndex($i);
            if ($data === false) {
                $out[] = ['name' => $base, 'error' => 'Não foi possível ler este arquivo do .zip.'];

                continue;
            }
            $tmp = tempnam(sys_get_temp_dir(), 'imp');
            file_put_contents($tmp, $data);
            $out[] = ['name' => $base, 'path' => $tmp, 'temp' => true];
        }
        $zip->close();
        if (! $out) {
            throw new RuntimeException('Nenhum arquivo .kmz ou .kml dentro do .zip.');
        }

        return $out;
    }

    /**
     * Nome do projeto pelo nome do arquivo; "Brejinho - RN" também vira cidade.
     *
     * @return array{0: string, 1: string|null}
     */
    public static function projectName(string $fileName): array
    {
        $name = preg_replace('/\.(kmz|kml)$/i', '', $fileName) ?? $fileName;
        $name = trim(preg_replace('/\s+/u', ' ', str_replace('_', ' · ', $name)) ?? $name);
        $name = mb_substr($name !== '' ? $name : 'Projeto importado', 0, 255);
        $city = preg_match('/^([\p{L}][\p{L}\'`´ ]+?) - ([A-Z]{2})$/u', $name) ? $name : null;

        return [$name, $city];
    }

    /** Centraliza o projeto no meio do que foi importado. */
    private function centerOn(Project $project): void
    {
        $lats = [];
        $lngs = [];
        // Prefere a rede (caixas e cabos); postes soltos longe dela não puxam o centro.
        $network = $project->nodes()->where('type', '!=', 'pole')->get(['lat', 'lng']);
        $hasNetwork = $network->isNotEmpty() || $project->cables()->exists();
        foreach ($hasNetwork ? $network : $project->nodes()->get(['lat', 'lng']) as $n) {
            $lats[] = $n->lat;
            $lngs[] = $n->lng;
        }
        foreach ($project->cables()->get(['path']) as $c) {
            foreach ($c->path ?? [] as $p) {
                $lats[] = $p[0];
                $lngs[] = $p[1];
            }
        }
        foreach ($hasNetwork ? [] : $project->areas()->get(['polygon']) as $a) {
            foreach ($a->polygon ?? [] as $p) {
                $lats[] = $p[0];
                $lngs[] = $p[1];
            }
        }
        if (! $lats) {
            return;
        }
        $span = max(max($lats) - min($lats), max($lngs) - min($lngs));
        $zoom = match (true) {
            $span > 1.5 => 9,
            $span > 0.6 => 10,
            $span > 0.3 => 11,
            $span > 0.15 => 12,
            $span > 0.07 => 13,
            $span > 0.03 => 14,
            $span > 0.015 => 15,
            default => 16,
        };
        $project->update([
            'center_lat' => (min($lats) + max($lats)) / 2,
            'center_lng' => (min($lngs) + max($lngs)) / 2,
            'zoom' => $zoom,
        ]);
    }
}
