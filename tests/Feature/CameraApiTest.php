<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\NetworkNode;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CameraApiTest extends TestCase
{
    use RefreshDatabase;

    private function project(User $user): Project
    {
        return $user->projects()->create(['name' => 'Rede Centro', 'center_lat' => -2.44, 'center_lng' => -54.71]);
    }

    public function test_camera_password_is_encrypted_and_never_returned(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $this->actingAs($user);

        $r = $this->postJson("/api/projects/{$project->id}/nodes", [
            'type' => 'camera', 'lat' => 0, 'lng' => 0,
            'attributes' => ['cam_kind' => 'ip', 'host' => '192.168.1.64', 'username' => 'admin', 'password' => 'S3gredo!'],
        ])->assertCreated()
            ->assertJsonPath('name', 'CAM-1')
            ->assertJsonPath('attributes.cam_has_password', true)
            ->assertJsonMissingPath('attributes.password')
            ->assertJsonMissingPath('attributes.cam_secret');
        $this->assertStringNotContainsString('S3gredo', $r->getContent());

        $node = NetworkNode::find($r->json('id'));
        $this->assertSame('S3gredo!', $node->cameraPassword());
        $this->assertStringNotContainsString('S3gredo', json_encode($node->getAttributes()));

        // Salvar sem senha mantém a guardada; o histórico não recebe a senha criptografada.
        $this->putJson("/api/nodes/{$node->id}", ['attributes' => ['cam_kind' => 'ip', 'host' => '192.168.1.65', 'username' => 'admin', 'cam_has_password' => true]])
            ->assertOk()->assertJsonPath('node.attributes.host', '192.168.1.65');
        $this->assertSame('S3gredo!', $node->fresh()->cameraPassword());
        $log = ActivityLog::where('subject_id', $node->id)->latest('id')->first();
        $this->assertStringNotContainsString('cam_secret', json_encode($log->changes));

        // Senha nova e depois remoção.
        $this->putJson("/api/nodes/{$node->id}", ['attributes' => ['host' => '192.168.1.65', 'password' => 'nova']])->assertOk();
        $this->assertSame('nova', $node->fresh()->cameraPassword());
        $this->putJson("/api/nodes/{$node->id}", ['attributes' => ['host' => '192.168.1.65', 'password_clear' => true]])
            ->assertOk()->assertJsonMissingPath('node.attributes.cam_has_password');
        $this->assertNull($node->fresh()->cameraPassword());
    }

    public function test_camera_host_is_validated(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $this->actingAs($user);

        $this->postJson("/api/projects/{$project->id}/nodes", [
            'type' => 'camera', 'lat' => 0, 'lng' => 0, 'attributes' => ['host' => 'http://x/ y'],
        ])->assertUnprocessable()->assertJsonValidationErrors('attributes.host');
    }

    public function test_status_check_reports_open_and_closed_ports(): void
    {
        config(['services.cameras.allow_loopback' => true]);
        $user = User::factory()->create();
        $project = $this->project($user);
        $this->actingAs($user);

        // Uma porta aberta (servidor local) e outra fechada.
        $server = stream_socket_server('tcp://127.0.0.1:0');
        $open = (int) substr(strrchr(stream_socket_get_name($server, false), ':'), 1);
        $probe = stream_socket_server('tcp://127.0.0.1:0');
        $closed = (int) substr(strrchr(stream_socket_get_name($probe, false), ':'), 1);
        fclose($probe);

        $cam = $project->nodes()->create(['type' => 'camera', 'name' => 'CAM', 'lat' => 0, 'lng' => 0, 'attributes' => [
            'cam_kind' => 'ip', 'host' => '127.0.0.1', 'http_port' => $closed, 'rtsp_port' => $open,
        ]]);

        $r = $this->postJson("/api/nodes/{$cam->id}/camera/check")->assertOk()
            ->assertJsonPath('status.online', true)
            ->assertJsonPath('node.attributes.cam_status.online', true);
        $checks = collect($r->json('status.checks'))->keyBy('name');
        $this->assertFalse($checks['HTTP']['ok']);
        $this->assertTrue($checks['RTSP']['ok']);
        fclose($server);
    }

    public function test_loopback_and_metadata_hosts_are_refused(): void
    {
        $user = User::factory()->create();
        $project = $this->project($user);
        $this->actingAs($user);
        foreach (['127.0.0.1', '169.254.169.254'] as $host) {
            $cam = $project->nodes()->create(['type' => 'camera', 'name' => 'CAM', 'lat' => 0, 'lng' => 0, 'attributes' => ['host' => $host]]);
            $this->postJson("/api/nodes/{$cam->id}/camera/check")->assertStatus(422);
        }
    }

    public function test_analog_camera_uses_the_dvr_and_viewers_cannot_check(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $project = $this->project($owner);
        $project->members()->create(['user_id' => $viewer->id, 'role' => 'viewer']);
        $dvr = $project->nodes()->create(['type' => 'camera', 'name' => 'DVR', 'lat' => 0, 'lng' => 0, 'attributes' => ['cam_kind' => 'dvr', 'host' => '10.0.0.5', 'channels' => 8]]);
        $cam = $project->nodes()->create(['type' => 'camera', 'name' => 'CAM', 'lat' => 0, 'lng' => 0, 'attributes' => ['cam_kind' => 'analog', 'dvr_id' => $dvr->id, 'dvr_channel' => 3]]);

        [$device, $channel] = app(\App\Services\CameraService::class)->source($cam);
        $this->assertSame($dvr->id, $device->id);
        $this->assertSame(3, $channel);

        $this->actingAs($viewer)->postJson("/api/nodes/{$cam->id}/camera/check")->assertForbidden();
    }
}
