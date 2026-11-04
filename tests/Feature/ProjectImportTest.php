<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;
use ZipArchive;

class ProjectImportTest extends TestCase
{
    use RefreshDatabase;

    /** KML no formato exportado pelo ISM (pastas em português, estilos por styleUrl). */
    private function ismKml(string $name): string
    {
        $pole = '<Style id="sp"><IconStyle><Icon><href>icones/OTgzMzI.png</href></Icon></IconStyle></Style>';
        $tower = '<Style id="st"><IconStyle><Icon><href>icones/ZmU4ZjllNGY2ZTUwMGMxMWQ0YzgxMTc2NTY1ZjA0Zjk2026_11_04.png</href></Icon></IconStyle></Style>';
        $line = '<Style id="sl"><LineStyle><color>ffff0000</color><width>4</width></LineStyle></Style>';
        $poly = '<Style id="sa"><PolyStyle><color>7f00ff00</color></PolyStyle></Style>';
        $pt = fn ($n, $s, $lng, $lat, $d = '') => "<Placemark><name>{$n}</name>".($d ? "<description>{$d}</description>" : '')
            ."<styleUrl>#{$s}</styleUrl><Point><coordinates>{$lng},{$lat}</coordinates></Point></Placemark>";

        return '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>'
            ."<name>{$name}</name>{$pole}{$tower}{$line}{$poly}"
            .'<Folder><name>Cabos (1)</name><Placemark><name>projeto brejinho 12F0 (201)</name><styleUrl>#sl</styleUrl>'
            .'<LineString><coordinates>-35.3500,-6.1990 -35.3510,-6.1990 -35.3520,-6.1990</coordinates></LineString></Placemark></Folder>'
            .'<Folder><name>Postes (2)</name><Folder><name>De 0 até 500</name>'
            .$pt('COSERN POP N44095', 'sp', -35.3510, -6.1990)
            .$pt('PT01', 'sp', -35.3515, -6.1990)
            .'</Folder></Folder>'
            .'<Folder><name>Estações (2)</name>'.$pt('ES06', 'st', -35.3600, -6.1900).$pt('POP X', 'sp', -35.3500, -6.1990).'</Folder>'
            .'<Folder><name>Caixas de emenda (1)</name>'.$pt('CE04', 'sp', -35.3520, -6.1990).'</Folder>'
            .'<Folder><name>Terminais de atendimento (1)</name>'.$pt('LD001', 'sp', -35.3530, -6.1990, 'SINAL -18.45').'</Folder>'
            .'<Folder><name>Racks (1)</name>'.$pt('RK02', 'sp', -35.3540, -6.1990).'</Folder>'
            .'<Folder><name>Áreas personalizadas (1)</name><Placemark><name>Bairro</name><styleUrl>#sa</styleUrl><Polygon><outerBoundaryIs><LinearRing>'
            .'<coordinates>-35.35,-6.19 -35.36,-6.19 -35.36,-6.20 -35.35,-6.19</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Folder>'
            .'</Document></kml>';
    }

    private function kmz(string $kml): string
    {
        $path = tempnam(sys_get_temp_dir(), 'kmz');
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::OVERWRITE);
        $zip->addFromString('doc.kml', $kml);
        $zip->close();

        return (string) file_get_contents($path);
    }

    public function test_zip_with_ism_export_becomes_one_project_per_file(): void
    {
        $user = User::factory()->create();
        $zipPath = tempnam(sys_get_temp_dir(), 'zip');
        $zip = new ZipArchive;
        $zip->open($zipPath, ZipArchive::OVERWRITE);
        $zip->addFromString('Brejinho - RN.kmz', $this->kmz($this->ismKml('Brejinho - RN')));
        $zip->addFromString('BACKBONER_NCZ_POSTES COSERN (2) .kmz', $this->kmz($this->ismKml('Postes')));
        $zip->addFromString('leia-me.txt', 'ignorar');
        $zip->close();

        $res = $this->actingAs($user)->post('/api/projects/import', [
            'files' => [new UploadedFile($zipPath, 'ISM_exportacao.zip', 'application/zip', null, true)],
        ], ['Accept' => 'application/json'])->assertOk();

        $results = $res->json('results');
        $this->assertCount(2, $results);
        $this->assertSame(2, Project::count());

        $p = Project::where('name', 'Brejinho - RN')->firstOrFail();
        $this->assertSame('Brejinho - RN', $p->city);
        $this->assertEqualsWithDelta(-6.195, $p->center_lat, 0.01);

        $types = $p->nodes()->pluck('type', 'name');
        $this->assertSame('pole', $types['COSERN POP N44095']);
        $this->assertSame('pole', $types['PT01']);
        $this->assertSame('tower', $types['ES06']);
        $this->assertSame('pop', $types['POP X']);
        $this->assertSame('ceo', $types['CE04']);
        $this->assertSame('cto', $types['LD001']);
        $this->assertSame('pop', $types['RK02']);
        $this->assertSame('SINAL -18.45', $p->nodes()->where('name', 'LD001')->value('notes'));

        $cable = $p->cables()->firstOrFail();
        $this->assertSame('projeto brejinho 12F0', $cable->name);
        $this->assertSame(12, $cable->fiber_count);
        $this->assertSame('#0000FF', $cable->color);
        $this->assertStringContainsString('201', $cable->notes);

        $area = $p->areas()->firstOrFail();
        $this->assertSame('Bairro', $area->name);
        $this->assertSame('#00FF00', $area->color);
        $this->assertCount(3, $area->polygon);

        $postes = Project::where('name', 'like', 'BACKBONER%')->firstOrFail();
        $this->assertSame('COSERN', $postes->nodes()->where('name', 'PT01')->first()->attributes['owner']);
        $this->assertNull($postes->nodes()->where('name', 'LD001')->first()->attributes['owner'] ?? null);
    }

    public function test_importing_same_file_twice_skips_repeated_points(): void
    {
        $user = User::factory()->create();
        $project = $user->projects()->create(['name' => 'Rede', 'center_lat' => -6.19, 'center_lng' => -35.35]);
        $file = fn () => UploadedFile::fake()->createWithContent('rede.kml', $this->ismKml('Rede'));

        $this->actingAs($user)->post("/api/projects/{$project->id}/import", ['file' => $file()], ['Accept' => 'application/json'])
            ->assertOk()->assertJson(['nodes' => 7, 'areas' => 1, 'skipped' => 0]);
        $this->actingAs($user)->post("/api/projects/{$project->id}/import", ['file' => $file()], ['Accept' => 'application/json'])
            ->assertOk()->assertJson(['nodes' => 0, 'skipped' => 7]);
    }
}
