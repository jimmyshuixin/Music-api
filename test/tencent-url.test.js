import assert from 'node:assert/strict';
import TencentProvider from '../src/providers/tencent.js';

const requests = [];
const meting = {
  header: {
    Cookie: 'qqmusic_uin=123456; qqmusic_key=test-music-key; p_skey=test-skey; pgv_pvid=987654321'
  },
  temp: { br: 320 },
  async _exec(api) {
    const payload = api.method === 'GET'
      ? JSON.parse(api.body.data)
      : JSON.parse(api.body);
    requests.push({ api, payload });
    const requestKey = payload.req_1 ? 'req_1' : 'req_0';
    return JSON.stringify({
      code: 0,
      [requestKey]: {
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
assert.equal(requests[0].api.method, 'POST');
assert.ok(requests[0].payload.req_1);
assert.equal(requests[0].payload.req_0, undefined);
assert.equal(requests[0].payload.req_1.module, 'music.vkey.GetVkey');
assert.equal(requests[0].payload.req_1.method, 'UrlGetVkey');
assert.match(requests[0].api.headers['X-Forwarded-For'], /^\d+\.\d+\.\d+\.\d+$/);
assert.equal(requests[0].api.headers['X-Real-IP'], requests[0].api.headers['X-Forwarded-For']);
assert.deepEqual(requests[0].payload.req_1.param.songtype, [0, 0]);
assert.deepEqual(requests[0].payload.req_1.param.filename, [
  'M800song-midsong-mid.mp3',
  'M500song-midsong-mid.mp3'
]);
assert.equal(result.url, 'https://dl.stream.qqmusic.qq.com/M800song-midmedia-mid.mp3?vkey=test');
assert.equal(result.br, 320);
assert.equal(result.size, 12345678);

const loginMeting = {
  header: { Cookie: '' },
  temp: { br: 320 }
};
const loginProvider = new TencentProvider(loginMeting);
const normalizedCookies = loginProvider._normalizeQQMusicCookiePairs([
  'ptui_loginuin=123456',
  'p_uin=o123456',
  'p_skey=test-p-skey'
]);
loginMeting.header.Cookie = normalizedCookies.join('; ');

assert.ok(normalizedCookies.includes('qqmusic_uin=123456'));
assert.ok(normalizedCookies.includes('qqmusic_key=test-p-skey'));
assert.ok(normalizedCookies.includes('qm_keyst=test-p-skey'));
assert.equal(loginProvider._getLoginUin(), '123456');
assert.equal(loginProvider._getMusicKey(), 'test-p-skey');

console.log('Tencent URL resolver unit test passed');
