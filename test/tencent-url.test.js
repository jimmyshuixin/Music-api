import assert from 'node:assert/strict';
import TencentProvider from '../src/providers/tencent.js';

const requests = [];
const meting = {
  header: {
    Cookie: 'qqmusic_uin=123456; qqmusic_key=test-music-key; p_skey=test-skey; pgv_pvid=987654321'
  },
  temp: { br: 320 },
  async _exec(api) {
    requests.push(JSON.parse(api.body));
    return JSON.stringify({
      code: 0,
      req_0: {
        code: 0,
        data: {
          sip: [
            'http://ws.stream.qqmusic.qq.com/',
            'https://dl.stream.qqmusic.qq.com/'
          ],
          midurlinfo: [
            { purl: 'M800song-midmedia-mid.mp3?vkey=test' },
            { purl: '' }
          ]
        }
      }
    });
  }
};

const provider = new TencentProvider(meting);
const result = JSON.parse(await provider.urlDecode(JSON.stringify({
  data: [{
    mid: 'song-mid',
    type: 7,
    file: {
      media_mid: 'media-mid',
      size_320mp3: 12345678,
      size_128mp3: 4567890
    }
  }]
})));

assert.equal(requests.length, 1);
assert.ok(requests[0].req_0);
assert.equal(requests[0].req_1, undefined);
assert.equal(requests[0].comm.ct, 19);
assert.equal(requests[0].comm.uin, '123456');
assert.equal(requests[0].comm.authst, 'test-music-key');
assert.deepEqual(requests[0].req_0.param.songtype, [0, 0]);
assert.deepEqual(requests[0].req_0.param.filename, [
  'M800song-midmedia-mid.mp3',
  'M500song-midmedia-mid.mp3'
]);
assert.equal(result.url, 'https://dl.stream.qqmusic.qq.com/M800song-midmedia-mid.mp3?vkey=test');
assert.equal(result.br, 320);
assert.equal(result.size, 12345678);

console.log('Tencent URL resolver unit test passed');
