<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\NetworkNode;
use App\Services\CameraService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** Teste de comunicação e foto ao vivo de câmeras e gravadores (objeto Câmera do mapa). */
class CameraController extends Controller
{
    public function __construct(private CameraService $cameras) {}

    /** Testa HTTP/RTSP/ONVIF e guarda o resultado em attributes.cam_status (cor do ponto no mapa). */
    public function check(Request $request, NetworkNode $node): JsonResponse
    {
        $this->authorizeProject($request, $node->project, 'edit');
        abort_unless($node->type === 'camera', 404);
        abort_unless(config('services.cameras.check'), 403, 'O teste de câmeras está desativado neste servidor (CAMERA_CHECK=false).');
        [$device] = $this->cameras->source($node);
        $problem = $this->cameras->hostProblem($device->attributes['host'] ?? null);
        abort_if($problem !== null, 422, $problem ?? '');

        $status = $this->cameras->check($node);
        $node->attributes = array_merge(is_array($node->attributes) ? $node->attributes : [], ['cam_status' => $status]);
        $node->save();

        return response()->json(['node' => $node->fresh(), 'status' => $status]);
    }

    /** Foto do equipamento buscada pelo servidor (a senha não sai do servidor). */
    public function snapshot(Request $request, NetworkNode $node): Response|JsonResponse
    {
        $this->authorizeProject($request, $node->project, 'view');
        abort_unless($node->type === 'camera', 404);
        abort_unless(config('services.cameras.check'), 403, 'O acesso às câmeras está desativado neste servidor (CAMERA_CHECK=false).');
        $channel = $request->integer('channel') ?: null;
        $result = $this->cameras->snapshot($node, $channel && $channel <= 256 ? $channel : null);
        if (is_string($result)) {
            return response()->json(['message' => $result], 422);
        }

        return response($result[0], 200, ['Content-Type' => $result[1], 'Cache-Control' => 'no-store']);
    }
}
