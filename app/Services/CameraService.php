<?php

namespace App\Services;

use App\Models\NetworkNode;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Comunicação com câmeras IP e gravadores DVR/NVR a partir do servidor.
 *
 * Só faz o que é seguro e não muda nada no equipamento: abre conexão TCP nas portas cadastradas, pergunta ao RTSP
 * (OPTIONS), lê a página web (HTTP), lê fabricante/modelo/firmware por ONVIF e busca uma foto (snapshot).
 * O servidor precisa alcançar a rede das câmeras (IP público, VPN ou rota até a rede da câmera).
 */
class CameraService
{
    /** Caminhos de foto por fabricante ({ch} = canal). Iguais aos do frontend (lib/camera.ts). */
    public const SNAPSHOT_PATHS = [
        'Intelbras' => '/cgi-bin/snapshot.cgi?channel={ch}',
        'Dahua' => '/cgi-bin/snapshot.cgi?channel={ch}',
        'Hikvision' => '/ISAPI/Streaming/channels/{ch}01/picture',
        'HiLook' => '/ISAPI/Streaming/channels/{ch}01/picture',
        'Axis' => '/axis-cgi/jpg/image.cgi?camera={ch}',
        'Uniview (UNV)' => '/images/snapshot.jpg',
    ];

    private const TIMEOUT = 3;

    private const MAX_IMAGE = 5 * 1024 * 1024;

    /**
     * Equipamento que responde por esta câmera: ela mesma ou, se for analógica (ou IP sem endereço) ligada a um
     * gravador, o gravador e o canal.
     *
     * @return array{0: NetworkNode, 1: int}
     */
    public function source(NetworkNode $camera): array
    {
        $a = is_array($camera->attributes) ? $camera->attributes : [];
        $dvrId = (int) ($a['dvr_id'] ?? 0);
        $channel = (int) ($a['dvr_channel'] ?? 0);
        if ($dvrId && $channel > 0 && (($a['cam_kind'] ?? 'ip') === 'analog' || empty($a['host']))) {
            $dvr = NetworkNode::where('project_id', $camera->project_id)->where('type', 'camera')->find($dvrId);
            if ($dvr) {
                return [$dvr, $channel];
            }
        }

        return [$camera, 1];
    }

    /** Recusa endereços que não são de câmera (metadados da nuvem e, por padrão, o próprio servidor). */
    public function hostProblem(?string $host): ?string
    {
        $host = trim((string) $host, " []");
        if ($host === '') {
            return 'Cadastre o IP ou nome (DDNS) do equipamento.';
        }
        if (! preg_match('/^([0-9A-Fa-f:.]+|[A-Za-z0-9.-]+)$/', $host)) {
            return 'Endereço inválido.';
        }
        $ip = filter_var($host, FILTER_VALIDATE_IP) ? $host : gethostbyname($host);
        if (! filter_var($ip, FILTER_VALIDATE_IP)) {
            return "Não foi possível resolver o nome {$host} no servidor.";
        }
        if (str_starts_with($ip, '169.254.') || str_starts_with(strtolower($ip), 'fe80:')) {
            return 'Endereço link-local não é permitido.';
        }
        $loopback = str_starts_with($ip, '127.') || $ip === '::1' || $ip === '0.0.0.0';
        if ($loopback && ! config('services.cameras.allow_loopback')) {
            return 'O endereço aponta para o próprio servidor.';
        }

        return null;
    }

    /**
     * Testa a comunicação e devolve o resultado no formato guardado em attributes.cam_status.
     *
     * @return array{online: bool, at: string, checks: array<int, array<string, mixed>>, info: ?array}
     */
    public function check(NetworkNode $camera): array
    {
        [$device] = $this->source($camera);
        $a = is_array($device->attributes) ? $device->attributes : [];
        $host = trim((string) ($a['host'] ?? ''), '[]');
        $https = ! empty($a['https']);
        $httpPort = (int) ($a['http_port'] ?? ($https ? 443 : 80));
        $rtspPort = (int) ($a['rtsp_port'] ?? 554);
        $checks = [];

        $checks[] = $this->checkHttp($host, $httpPort, $https);
        $checks[] = $this->checkRtsp($host, $rtspPort);
        $info = null;
        if (($a['protocol'] ?? null) === 'onvif' || ! empty($a['onvif_port'])) {
            [$onvif, $info] = $this->checkOnvif($host, (int) ($a['onvif_port'] ?? $httpPort), $a['username'] ?? null, $device->cameraPassword());
            $checks[] = $onvif;
        }

        return [
            'online' => collect($checks)->contains('ok', true),
            'at' => now()->toIso8601String(),
            'checks' => $checks,
            'info' => $info,
        ];
    }

    /** Abre conexão TCP. Devolve o socket (para continuar a conversa) ou a mensagem de erro. */
    private function connect(string $host, int $port, float $timeout = self::TIMEOUT): array
    {
        $target = str_contains($host, ':') ? "[{$host}]" : $host;
        $start = microtime(true);
        $errno = 0;
        $errstr = '';
        $fp = @stream_socket_client("tcp://{$target}:{$port}", $errno, $errstr, $timeout);
        $ms = (int) round((microtime(true) - $start) * 1000);

        return [$fp ?: null, $ms, $fp ? null : ($errstr !== '' ? $errstr : 'sem resposta')];
    }

    private function checkRtsp(string $host, int $port): array
    {
        [$fp, $ms, $err] = $this->connect($host, $port);
        if (! $fp) {
            return ['name' => 'RTSP', 'port' => $port, 'ok' => false, 'ms' => null, 'detail' => $err];
        }
        stream_set_timeout($fp, self::TIMEOUT);
        @fwrite($fp, "OPTIONS rtsp://{$host}:{$port}/ RTSP/1.0\r\nCSeq: 1\r\nUser-Agent: MapFTTH\r\n\r\n");
        $line = (string) @fgets($fp, 256);
        fclose($fp);
        $detail = preg_match('#^RTSP/\d\.\d\s+(\d{3})#', $line, $m)
            ? ($m[1] === '401' ? 'responde (pede senha)' : "responde ({$m[1]})")
            : 'porta aberta';

        return ['name' => 'RTSP', 'port' => $port, 'ok' => true, 'ms' => $ms, 'detail' => $detail];
    }

    private function checkHttp(string $host, int $port, bool $https): array
    {
        $name = $https ? 'HTTPS' : 'HTTP';
        [$fp, $ms, $err] = $this->connect($host, $port);
        if (! $fp) {
            return ['name' => $name, 'port' => $port, 'ok' => false, 'ms' => null, 'detail' => $err];
        }
        fclose($fp);
        $detail = 'porta aberta';
        try {
            $r = Http::timeout(self::TIMEOUT)->withOptions(['verify' => false, 'allow_redirects' => false])
                ->get($this->baseUrl($host, $port, $https).'/');
            $server = $r->header('Server');
            $detail = "HTTP {$r->status()}".($server ? " · {$server}" : '');
        } catch (Throwable) {
            // Porta aberta, mas sem resposta HTTP válida.
        }

        return ['name' => $name, 'port' => $port, 'ok' => true, 'ms' => $ms, 'detail' => mb_substr($detail, 0, 120)];
    }

    /** ONVIF GetDeviceInformation com autenticação WS-Security (UsernameToken digest). */
    private function checkOnvif(string $host, int $port, ?string $user, ?string $password): array
    {
        $security = '';
        if ($user) {
            $nonce = random_bytes(16);
            $created = gmdate('Y-m-d\TH:i:s\Z');
            $digest = base64_encode(sha1($nonce.$created.($password ?? ''), true));
            $u = htmlspecialchars($user, ENT_XML1);
            $security = '<s:Header><Security s:mustUnderstand="1" xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">'
                .'<UsernameToken><Username>'.$u.'</Username>'
                .'<Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">'.$digest.'</Password>'
                .'<Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">'.base64_encode($nonce).'</Nonce>'
                .'<Created xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">'.$created.'</Created>'
                .'</UsernameToken></Security></s:Header>';
        }
        $body = '<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">'.$security
            .'<s:Body><GetDeviceInformation xmlns="http://www.onvif.org/ver10/device/wsdl"/></s:Body></s:Envelope>';
        $start = microtime(true);
        try {
            $r = Http::timeout(self::TIMEOUT)->withBody($body, 'application/soap+xml; charset=utf-8')
                ->post($this->baseUrl($host, $port, false).'/onvif/device_service');
        } catch (Throwable) {
            return [['name' => 'ONVIF', 'port' => $port, 'ok' => false, 'ms' => null, 'detail' => 'sem resposta'], null];
        }
        $ms = (int) round((microtime(true) - $start) * 1000);
        $xml = $r->body();
        $tag = fn (string $t) => preg_match('#<(?:\w+:)?'.$t.'>([^<]*)</#', $xml, $m) ? mb_substr(trim($m[1]), 0, 80) : null;
        $info = array_filter([
            'manufacturer' => $tag('Manufacturer'),
            'model' => $tag('Model'),
            'firmware' => $tag('FirmwareVersion'),
            'serial' => $tag('SerialNumber'),
            'hardware' => $tag('HardwareId'),
        ]);
        if ($info) {
            return [['name' => 'ONVIF', 'port' => $port, 'ok' => true, 'ms' => $ms, 'detail' => 'dados do equipamento lidos'], $info];
        }
        $auth = $r->status() === 401 || str_contains($xml, 'NotAuthorized');

        return [[
            'name' => 'ONVIF', 'port' => $port, 'ok' => $auth || $r->successful(), 'ms' => $ms,
            'detail' => $auth ? 'responde, mas recusou usuário/senha' : "HTTP {$r->status()} (ONVIF desativado?)",
        ], null];
    }

    /**
     * Foto (snapshot) do equipamento, com autenticação digest (padrão de Intelbras/Dahua/Hikvision) ou básica.
     *
     * @return array{0: string, 1: string}|string  [bytes, content-type] ou a mensagem de erro
     */
    public function snapshot(NetworkNode $camera, ?int $channel = null): array|string
    {
        [$device, $ch] = $this->source($camera);
        $ch = $channel ?: $ch;
        $a = is_array($device->attributes) ? $device->attributes : [];
        $problem = $this->hostProblem($a['host'] ?? null);
        if ($problem) {
            return $problem;
        }
        $path = (string) ($a['snapshot_path'] ?? '') ?: (self::SNAPSHOT_PATHS[$a['vendor'] ?? ''] ?? '');
        if ($path === '') {
            return 'Informe o caminho da foto (snapshot) do fabricante no cadastro da câmera.';
        }
        $path = str_replace('{ch}', (string) max(1, $ch), $path);
        $https = ! empty($a['https']);
        $url = $this->baseUrl(trim($a['host'], '[]'), (int) ($a['http_port'] ?? ($https ? 443 : 80)), $https).'/'.ltrim($path, '/');
        $user = (string) ($a['username'] ?? '');
        $pass = (string) ($device->cameraPassword() ?? '');
        try {
            $req = fn () => Http::timeout(6)->withOptions(['verify' => false, 'allow_redirects' => false]);
            $r = $user !== '' ? $req()->withDigestAuth($user, $pass)->get($url) : $req()->get($url);
            if ($r->status() === 401 && $user !== '') {
                $r = $req()->withBasicAuth($user, $pass)->get($url);
            }
        } catch (Throwable) {
            return 'O servidor não conseguiu falar com o equipamento (sem rota até a rede da câmera ou porta fechada).';
        }
        if ($r->status() === 401) {
            return 'O equipamento recusou o usuário/senha.';
        }
        $type = strtolower((string) $r->header('Content-Type'));
        if (! $r->successful() || ! str_starts_with($type, 'image/')) {
            return "O equipamento respondeu HTTP {$r->status()} sem imagem. Confira o caminho da foto.";
        }
        $bytes = $r->body();
        if (strlen($bytes) > self::MAX_IMAGE) {
            return 'Imagem grande demais.';
        }

        return [$bytes, explode(';', $type)[0]];
    }

    private function baseUrl(string $host, int $port, bool $https): string
    {
        $h = str_contains($host, ':') ? "[{$host}]" : $host;
        $default = $https ? 443 : 80;

        return ($https ? 'https' : 'http')."://{$h}".($port === $default ? '' : ":{$port}");
    }
}
