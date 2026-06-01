import crypto from 'crypto';
import BaseProvider from './base.js';

const KUGOU_APP_ID = 1005;
const KUGOU_QR_APP_ID = 1001;
const KUGOU_WEB_QR_APP_ID = 1014;
const KUGOU_SRC_APP_ID = 2919;
const KUGOU_CLIENT_VERSION = 20489;
const KUGOU_WEB_SIGNATURE_KEY = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt';

/**
 * 酷狗音乐平台提供者
 */
export default class KugouProvider extends BaseProvider {
  constructor(meting) {
    super(meting);
    this.name = 'kugou';
  }

  /**
   * 获取酷狗音乐的请求头配置
   */
  getHeaders() {
    return {
      'User-Agent': 'IPhone-8990-searchSong',
      'UNI-UserAgent': 'iOS11.4-Phone8990-1009-0-WiFi'
    };
  }

  async fetchLoginQrKey(option = {}) {
    const cookie = this.parseCookie(this.meting.header.Cookie || '');
    const params = this._withWebSignature({
      appid: option.type === 'web' ? KUGOU_WEB_QR_APP_ID : KUGOU_QR_APP_ID,
      type: 1,
      plat: 4,
      qrcode_txt: `https://h5.kugou.com/apps/loginQRCode/html/index.html?appid=${KUGOU_APP_ID}&`,
      srcappid: KUGOU_SRC_APP_ID
    }, cookie);

    const result = await this._kugouLoginRequest('/v2/qrcode', params, cookie);
    const body = result.body || {};
    const data = body.data || body;
    const qrcode = data.qrcode || data.qrcode_txt || data.key || data.code;

    if (!qrcode) {
      return JSON.stringify({
        code: body.code || body.status || -1,
        server: 'kugou',
        platform: 'kugou',
        message: body.error || body.errmsg || body.message || 'Failed to create KuGou QR login key',
        raw: body
      });
    }

    return JSON.stringify({
      code: 200,
      server: 'kugou',
      platform: 'kugou',
      scanApp: 'KuGou',
      key: qrcode,
      qrcode,
      mid: params.mid,
      dfid: params.dfid,
      raw: body
    });
  }

  async loginQrCreate(key, option = {}) {
    if (!key) {
      throw new Error('QR login key is required');
    }

    const qrurl = `https://h5.kugou.com/apps/loginQRCode/html/index.html?qrcode=${encodeURIComponent(key)}`;
    const result = {
      code: 200,
      server: 'kugou',
      platform: 'kugou',
      scanApp: 'KuGou',
      key,
      qrcode: key,
      qrurl
    };

    if (option.includeQrImage) {
      result.qrimg = null;
      result.message = 'QR image generation is not bundled. Render qrurl on the frontend.';
    }

    return JSON.stringify(result);
  }

  async fetchLoginQrCheck(key, option = {}) {
    if (!key) {
      return JSON.stringify({
        code: 400,
        server: 'kugou',
        platform: 'kugou',
        message: 'Missing qrcode key'
      });
    }

    const state = option.loginState || {};
    const cookie = {
      ...this.parseCookie(this.meting.header.Cookie || ''),
      KUGOU_API_MID: state.mid,
      dfid: state.dfid
    };
    const params = this._withWebSignature({
      plat: 4,
      appid: KUGOU_APP_ID,
      srcappid: KUGOU_SRC_APP_ID,
      qrcode: key
    }, cookie);

    const result = await this._kugouLoginRequest('/v2/get_userinfo_qrcode', params, cookie);
    const body = result.body || {};
    const data = body.data || {};
    const kugouStatus = Number(data.status ?? body.status);
    const response = {
      code: this._normalizeLoginCode(kugouStatus),
      kugouStatus,
      server: 'kugou',
      platform: 'kugou',
      scanApp: 'KuGou',
      message: this._getLoginMessage(kugouStatus, body),
      raw: body
    };

    if (kugouStatus === 4) {
      const token = data.token || body.token || '';
      const userid = data.userid || body.userid || '';
      const cookies = this._dedupeCookiePairs([
        ...result.cookies,
        state.mid ? `KUGOU_API_MID=${state.mid}` : '',
        state.mid ? `mid=${state.mid}` : '',
        state.dfid ? `dfid=${state.dfid}` : '',
        token ? `token=${token}` : '',
        userid ? `userid=${userid}` : '',
        token ? `t=${token}` : '',
        userid ? `KugooID=${userid}` : ''
      ]);
      const cookieHeader = cookies.join('; ');

      if (cookieHeader) {
        response.cookie = cookieHeader;
        response.cookieHeader = this._mergeCookieHeaders(this.meting.header.Cookie, cookieHeader);
        this.meting.cookie(response.cookieHeader);
      }
    }

    return JSON.stringify(response);
  }

  /**
   * 搜索歌曲
   */
  search(keyword, option = {}) {
    return {
      method: 'GET',
      url: 'http://mobilecdn.kugou.com/api/v3/search/song',
      body: {
        api_ver: 1,
        area_code: 1,
        correct: 1,
        pagesize: option.limit || 30,
        plat: 2,
        tag: 1,
        sver: 5,
        showtype: 10,
        page: option.page || 1,
        keyword: keyword,
        version: 8990
      },
      format: 'data.info'
    };
  }

  /**
   * 获取歌曲详情
   */
  song(id) {
    return {
      method: 'POST',
      url: 'http://m.kugou.com/app/i/getSongInfo.php',
      body: {
        cmd: 'playInfo',
        hash: id,
        from: 'mkugou'
      },
      format: ''
    };
  }

  /**
   * 获取专辑信息
   */
  album(id) {
    return {
      method: 'GET',
      url: 'http://mobilecdn.kugou.com/api/v3/album/song',
      body: {
        albumid: id,
        area_code: 1,
        plat: 2,
        page: 1,
        pagesize: -1,
        version: 8990
      },
      format: 'data.info'
    };
  }

  /**
   * 获取艺术家作品
   */
  artist(id, limit = 50) {
    return {
      method: 'GET',
      url: 'http://mobilecdn.kugou.com/api/v3/singer/song',
      body: {
        singerid: id,
        area_code: 1,
        page: 1,
        plat: 0,
        pagesize: limit,
        version: 8990
      },
      format: 'data.info'
    };
  }

  /**
   * 获取播放列表
   */
  playlist(id) {
    return {
      method: 'GET',
      url: 'http://mobilecdn.kugou.com/api/v3/special/song',
      body: {
        specialid: id,
        area_code: 1,
        page: 1,
        plat: 2,
        pagesize: -1,
        version: 8990
      },
      format: 'data.info'
    };
  }

  /**
   * 获取音频播放链接
   * 有 cookie 时走新接口（songinfo + 签名），无 cookie 走老接口
   */
  url(id, br = 320) {
    const cookie = this.parseCookie(this.meting.header['Cookie'] || '');
    const hasToken = !!((cookie.t || cookie.token) && (cookie.KugooID || cookie.userid));

    if (hasToken) {
      const now = Date.now();
      const params = {
        srcappid: '2919',
        clientver: '20000',
        clienttime: String(now),
        mid: cookie.mid || cookie.kg_mid || '',
        uuid: cookie.uuid || cookie.mid || cookie.kg_mid || '',
        dfid: cookie.dfid || cookie.kg_dfid || '',
        appid: '1014',
        platid: '4',
        hash: id,
        token: cookie.t || cookie.token || '',
        userid: cookie.KugooID || cookie.userid || ''
      };

      return {
        method: 'GET',
        url: this.buildSonginfoUrl(params),
        body: null,
        decode: 'kugou_url_new'
      };
    }

    // 老接口，无需 cookie
    return {
      method: 'POST',
      url: 'http://media.store.kugou.com/v1/get_res_privilege',
      body: JSON.stringify({
        relate: 1,
        userid: '0',
        vip: 0,
        appid: 1000,
        token: '',
        behavior: 'download',
        area_code: '1',
        clientver: '8990',
        resource: [{
          id: 0,
          type: 'audio',
          hash: id
        }]
      }),
      decode: 'kugou_url_legacy'
    };
  }

  /**
   * 获取歌词
   */
  lyric(id) {
    return {
      method: 'GET',
      url: 'http://krcs.kugou.com/search',
      body: {
        keyword: '%20-%20',
        ver: 1,
        hash: id,
        client: 'mobi',
        man: 'yes'
      },
      decode: 'kugou_lyric'
    };
  }

  /**
   * 获取封面图片
   */
  async pic(id, size = 300) {
    const format = this.meting.isFormat;
    const data = await this.meting.format(false).song(id);
    this.meting.isFormat = format;
    const songData = JSON.parse(data);
    let url = songData.imgUrl;
    url = url.replace('{size}', '400');
    return JSON.stringify({ url: url });
  }

  /**
   * 格式化酷狗音乐数据
   */
  format(data) {
    const filename = data.filename || data.fileName;
    const result = {
      id: data.hash,
      name: data.songName || filename,
      artist: [],
      album: data.album_name || '',
      url_id: data.encode_album_audio_id || data.hash,
      pic_id: data.hash,
      lyric_id: data.hash,
      source: 'kugou'
    };

    if (data.authors && Array.isArray(data.authors)) {
      result.artist = data.authors.map(a => a.author_name);
    } else if (filename) {
      const parts = filename.split(' - ');
      if (parts.length >= 2) {
        result.artist = parts[0].split('、');
        result.name = parts[1];
      }
    }

    return result;
  }

  /**
   * 解析 Cookie 字符串为对象
   */
  parseCookie(cookieStr) {
    const cookies = {};
    if (!cookieStr) return cookies;
    cookieStr.split(';').forEach(pair => {
      const idx = pair.indexOf('=');
      if (idx > 0) {
        const key = pair.substring(0, idx).trim();
        const val = pair.substring(idx + 1).trim();
        cookies[key] = val;
      }
    });
    return cookies;
  }

  /**
   * 生成酷狗 API 签名
   */
  getSignature(params) {
    const MD5_KEY = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt';
    const paramStr = Object.entries(params)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const sorted = paramStr.split('&').sort().join('');
    return crypto.createHash('md5').update(`${MD5_KEY}${sorted}${MD5_KEY}`).digest('hex');
  }

  /**
   * 处理酷狗音乐的解码逻辑
   */
  async handleDecode(decodeType, data) {
    if (decodeType === 'kugou_url_new') {
      return this.urlDecodeNew(data);
    } else if (decodeType === 'kugou_url_legacy') {
      return this.urlDecodeLegacy(data);
    } else if (decodeType === 'kugou_lyric') {
      return this.lyricDecode(data);
    }
    return data;
  }

  /**
   * 构建带签名的 songinfo 请求 URL
   */
  buildSonginfoUrl(params) {
    const signature = this.getSignature(params);
    const queryString = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
    return `https://wwwapi.kugou.com/play/songinfo?${queryString}&signature=${signature}`;
  }

  /**
   * 酷狗音乐 URL 解码（新接口，需要 cookie）
   * 第一步用 hash 查询获取 encode_album_audio_id，
   * 第二步用 encode_album_audio_id 查询获取播放链接
   */
  async urlDecodeNew(result) {
    try {
      const json = JSON.parse(result);
      const data = json.data;
      if (!data || !data.encode_album_audio_id) {
        return JSON.stringify({ url: '', size: 0, br: -1 });
      }

      // 第二步：用 encode_album_audio_id 重新查询
      const cookie = this.parseCookie(this.meting.header['Cookie'] || '');
      const now = Date.now();
      const params = {
        srcappid: '2919',
        clientver: '20000',
        clienttime: String(now),
        mid: cookie.mid || cookie.kg_mid || '',
        uuid: cookie.uuid || cookie.mid || cookie.kg_mid || '',
        dfid: cookie.dfid || cookie.kg_dfid || '',
        appid: '1014',
        platid: '4',
        encode_album_audio_id: data.encode_album_audio_id,
        token: cookie.t || cookie.token || '',
        userid: cookie.KugooID || cookie.userid || ''
      };

      const api = {
        method: 'GET',
        url: this.buildSonginfoUrl(params),
        body: null
      };
      const response = JSON.parse(await this.meting._exec(api));
      const detail = response.data;
      if (detail) {
        const url = detail.play_url || detail.play_backup_url || '';
        return JSON.stringify({
          url: url,
          size: detail.filesize || 0,
          br: detail.bitrate || -1
        });
      }
    } catch (e) {
      // parse error
    }
    return JSON.stringify({ url: '', size: 0, br: -1 });
  }

  /**
   * 酷狗音乐 URL 解码（老接口，无需 cookie）
   */
  async urlDecodeLegacy(result) {
    try {
      const data = JSON.parse(result);

      let maxBr = 0;
      let url;

      for (const item of data.data[0].relate_goods) {
        if (item.info.bitrate <= this.meting.temp.br && item.info.bitrate > maxBr) {
          const api = {
            method: 'GET',
            url: 'http://trackercdn.kugou.com/i/v2/',
            body: {
              hash: item.hash,
              key: crypto.createHash('md5').update(item.hash + 'kgcloudv2').digest('hex'),
              pid: 3,
              behavior: 'play',
              cmd: '25',
              version: 8990
            }
          };

          const response = JSON.parse(await this.meting._exec(api));
          if (response.url) {
            maxBr = response.bitRate / 1000;
            url = {
              url: Array.isArray(response.url) ? response.url[0] : response.url,
              size: response.fileSize,
              br: response.bitRate / 1000
            };
          }
        }
      }

      if (url) {
        return JSON.stringify(url);
      }
    } catch (e) {
      // parse error
    }
    return JSON.stringify({ url: '', size: 0, br: -1 });
  }

  /**
   * 酷狗音乐歌词解码
   */
  async lyricDecode(result) {
    const data = JSON.parse(result);
    
    if (!data.candidates || data.candidates.length === 0) {
      return JSON.stringify({ lyric: '', tlyric: '' });
    }
    
    const api = {
      method: 'GET',
      url: 'http://lyrics.kugou.com/download',
      body: {
        charset: 'utf8',
        accesskey: data.candidates[0].accesskey,
        id: data.candidates[0].id,
        client: 'mobi',
        fmt: 'lrc',
        ver: 1
      }
    };
    
    const response = JSON.parse(await this.meting._exec(api));
    const lyricData = {
      lyric: Buffer.from(response.content, 'base64').toString(),
      tlyric: ''
    };
    
    return JSON.stringify(lyricData);
  }

  async _kugouLoginRequest(path, params, cookie = {}) {
    const url = `https://login-user.kugou.com${path}?${new URLSearchParams(params).toString()}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi',
        'Accept': '*/*',
        'dfid': params.dfid,
        'clienttime': String(params.clienttime),
        'mid': params.mid,
        'kg-rc': '1',
        'kg-thash': '5d816a0',
        'kg-rec': '1',
        'kg-rf': 'B9EDA08A64250DEFFBCADDEE00F8F25F',
        'Cookie': this._cookieObjectToHeader(cookie)
      }
    });

    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch (error) {
      body = { raw: text };
    }

    return {
      body,
      cookies: this._cookiePairs(this._getSetCookie(response)),
      headers: Object.fromEntries(response.headers.entries())
    };
  }

  _withWebSignature(params, cookie = {}) {
    const requestParams = {
      dfid: cookie.dfid || cookie.kg_dfid || '-',
      mid: String(cookie.KUGOU_API_MID || cookie.mid || cookie.kg_mid || this._getRandomHex(32)),
      uuid: cookie.uuid || '-',
      appid: KUGOU_APP_ID,
      clientver: KUGOU_CLIENT_VERSION,
      clienttime: Math.floor(Date.now() / 1000),
      ...params
    };

    requestParams.signature = this._signatureWebParams(requestParams);
    return requestParams;
  }

  _signatureWebParams(params) {
    const paramsString = Object.keys(params)
      .map(key => `${key}=${params[key]}`)
      .sort()
      .join('');

    return crypto
      .createHash('md5')
      .update(`${KUGOU_WEB_SIGNATURE_KEY}${paramsString}${KUGOU_WEB_SIGNATURE_KEY}`)
      .digest('hex');
  }

  _getRandomHex(length) {
    return crypto.randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .slice(0, length);
  }

  _normalizeLoginCode(status) {
    const statusMap = {
      0: 800,
      1: 801,
      2: 802,
      4: 803
    };

    return statusMap[status] || -1;
  }

  _getLoginMessage(status, body = {}) {
    const messageMap = {
      0: '二维码已过期',
      1: '等待扫码',
      2: '已扫码，等待确认',
      4: '登录成功'
    };

    return body.error || body.errmsg || body.message || messageMap[status] || 'KuGou QR login status unknown';
  }

  _cookieObjectToHeader(cookie = {}) {
    return Object.entries(cookie)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }

  _getSetCookie(response) {
    if (!response || !response.headers) {
      return [];
    }

    if (typeof response.headers.getSetCookie === 'function') {
      return response.headers.getSetCookie();
    }

    if (typeof response.headers.raw === 'function') {
      return response.headers.raw()['set-cookie'] || [];
    }

    const cookie = response.headers.get('set-cookie');
    return cookie ? [cookie] : [];
  }

  _cookiePairs(setCookie) {
    const values = Array.isArray(setCookie) ? setCookie : [setCookie];

    return values
      .flatMap(value => this._splitSetCookieHeader(value))
      .map(cookie => cookie.split(';')[0].trim())
      .filter(cookie => cookie && cookie.includes('=') && !cookie.endsWith('='));
  }

  _splitSetCookieHeader(header) {
    if (!header) {
      return [];
    }

    return String(header).split(/,(?=\s*[^;,=\s]+=)/);
  }

  _dedupeCookiePairs(cookies) {
    const map = new Map();
    cookies
      .filter(Boolean)
      .forEach(cookie => {
        const index = cookie.indexOf('=');
        if (index <= 0) {
          return;
        }
        map.set(cookie.slice(0, index), cookie.slice(index + 1));
      });

    return Array.from(map.entries()).map(([key, value]) => `${key}=${value}`);
  }

  _mergeCookieHeaders(baseCookie = '', nextCookie = '') {
    return this._dedupeCookiePairs([
      ...String(baseCookie).split(';').map(item => item.trim()),
      ...String(nextCookie).split(';').map(item => item.trim())
    ]).join('; ');
  }
}
