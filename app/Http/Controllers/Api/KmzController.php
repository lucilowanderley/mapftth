<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\NetworkNode;
use App\Models\Project;
use App\Services\KmlService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use RuntimeException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class KmzController extends Controller
{
    public function __construct(private KmlService $kml) {}

    public function import(Request $request, Project $project): JsonResponse
    {
        $this->authorizeProject($request, $project);
        $request->validate([
            'file' => ['required', 'file', 'max:51200'],
            'default_type' => ['sometimes', Rule::in(NetworkNode::TYPES)],
        ]);
        $file = $request->file('file');
        $name = $file->getClientOriginalName();
        if (! preg_match('/\.(kmz|kml)$/i', $name)) {
            return response()->json(['message' => 'Envie um arquivo .kmz ou .kml.'], 422);
        }

        try {
            $kml = $this->kml->readKml($file->getRealPath(), $name);
            $result = $this->kml->import($project, $kml, $request->input('default_type', 'pole'));
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($result);
    }

    public function export(Request $request, Project $project): BinaryFileResponse
    {
        $this->authorizeProject($request, $project);
        $path = $this->kml->toKmz($this->kml->export($project));

        return response()->download($path, Str::slug($project->name).'.kmz', [
            'Content-Type' => 'application/vnd.google-earth.kmz',
        ])->deleteFileAfterSend();
    }
}
