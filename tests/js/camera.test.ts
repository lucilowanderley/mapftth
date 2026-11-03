import { describe, expect, it } from 'vitest';
import { distance } from '../../resources/js/lib/geo';
import { cameraHealth, cameraLinks, dvrChannels, fovPolygon, rtspUrl, streamSource, validHost, webUrl } from '../../resources/js/lib/camera';
import type { CameraAttributes, NetNode } from '../../resources/js/lib/types';

const node = (id: number, type: NetNode['type'], attributes: CameraAttributes = {}, lat = 0, lng = 0): NetNode => ({
  id, project_id: 1, type, name: `N${id}`, lat, lng, status: 'planned', notes: null, attributes, diagram: null,
});

describe('câmera', () => {
  it('campo de visão só com direção, com o alcance informado', () => {
    expect(fovPolygon(node(1, 'camera', { cam_kind: 'ip' }))).toBeNull();
    expect(fovPolygon(node(1, 'camera', { cam_kind: 'dvr', azimuth: 90 }))).toBeNull();
    const p = fovPolygon(node(1, 'camera', { cam_kind: 'ip', azimuth: 90, fov: 60, range_m: 40 }))!;
    expect(p[0]).toEqual([0, 0]);
    expect(distance([0, 0], p[1])).toBeCloseTo(40, 0);
  });

  it('URLs da interface web e RTSP (sem senha) pelo fabricante', () => {
    expect(webUrl({ host: '192.168.1.64' })).toBe('http://192.168.1.64/');
    expect(webUrl({ host: 'cam.dns.net', http_port: 8080 })).toBe('http://cam.dns.net:8080/');
    expect(webUrl({ host: '10.0.0.2', https: true })).toBe('https://10.0.0.2/');
    expect(rtspUrl({ host: '10.0.0.2', vendor: 'Intelbras', username: 'admin' }, 3)).toBe('rtsp://admin@10.0.0.2/cam/realmonitor?channel=3&subtype=0');
    expect(rtspUrl({ host: '10.0.0.2', vendor: 'Hikvision', rtsp_port: 5554 }, 2)).toBe('rtsp://10.0.0.2:5554/Streaming/Channels/201');
    expect(rtspUrl({})).toBeNull();
  });

  it('câmera analógica usa o endereço e o canal do DVR', () => {
    const dvr = node(1, 'camera', { cam_kind: 'dvr', host: '10.0.0.5', channels: 4 });
    const a = node(2, 'camera', { cam_kind: 'analog', dvr_id: 1, dvr_channel: 2 });
    const ip = node(3, 'camera', { cam_kind: 'ip', host: '10.0.0.9', dvr_id: 1, dvr_channel: 3 });
    expect(streamSource(a, [dvr, a, ip])).toEqual({ node: dvr, channel: 2 });
    expect(streamSource(ip, [dvr, a, ip])).toEqual({ node: ip, channel: 1 });
    const ch = dvrChannels(dvr, [dvr, a, ip]);
    expect(ch).toHaveLength(4);
    expect(ch[1].camera?.id).toBe(2);
    expect(ch[2].camera?.id).toBe(3);
    expect(ch[0].camera).toBeNull();
  });

  it('ligações com o gravador e com o objeto onde está instalada', () => {
    const pole = node(10, 'pole');
    const dvr = node(1, 'camera', { cam_kind: 'dvr' });
    const cam = node(2, 'camera', { cam_kind: 'analog', dvr_id: 1, dvr_channel: 1, mount_id: 10 });
    const cto = node(11, 'cto');
    const wrong = node(3, 'camera', { mount_id: 11 });
    const links = cameraLinks([pole, dvr, cam, cto, wrong]);
    expect(links.map((l) => `${l.kind}:${l.from.id}-${l.to.id}`).sort()).toEqual(['dvr:2-1', 'mount:2-10']);
  });

  it('situação e validação do endereço', () => {
    expect(cameraHealth(undefined)).toBe('unknown');
    expect(cameraHealth({ online: false, at: '', checks: [] })).toBe('offline');
    expect(validHost('192.168.0.10')).toBe(true);
    expect(validHost('cam1.meudns.com')).toBe(true);
    expect(validHost('http://x/ y')).toBe(false);
  });
});
