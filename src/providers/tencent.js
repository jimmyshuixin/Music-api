import BaseProvider from './base.js';

const QQ_LOGIN_APPID = '716027609';
const QQ_LOGIN_DAID = '383';
const QQ_LOGIN_3RD_AID = '100497308';
const QQ_LOGIN_U1 = 'https://graph.qq.com/oauth2.0/login_jump';
const QQ_LOGIN_JS_VER = '23111510';
const QQ_LOGIN_PT_JS_VER = 'v1.48.1';

/**
 * 腾讯音乐平台提供者
 */
export default class TencentProvider extends BaseProvider {
  constructor(meting) {
    super(meting);
    this.name = 'tencent';
  }

  /**
   * 获取腾讯音乐的请求头配置
   */
  getHeaders() {
    return {
      'Referer': 'http://y.qq.com',
      'Cookie': 'pgv_pvi=22038528; pgv_si=s3156287488; pgv_pvid=5535248600; yplayer_open=1; ts_last=y.qq.com/portal/player.html; ts_uid=4847550686; yq_index=0; qqmusic_fromtag=66; player_exist=1',
      'User-Agent': 'QQ%E9%9F%B3%E4%B9%90/54409 CFNetwork/901.1 Darwin/17.6.0 (x86_64)',
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.8,gl;q=0.6,zh-TW;q=0.4',
      'Connection': 'keep-alive',
      'Content-Type': 'application/x-www-form-urlencoded'
    };
  }

  async fetchLoginQrKey() {
    const url = 'https://ssl.ptlogin2.qq.com/ptqrshow?' + new URLSearchParams({
      appid: QQ_LOGIN_APPID,
      e: '2',
      l: 'M',
      s: '3',
      d: '72',
      v: '4',
      t: String(Math.random()),
      daid: QQ_LOGIN_DAID,
      pt_3rd_aid: QQ_LOGIN_3RD_AID,
      u1: QQ_LOGIN_U1
    }).toString();

    const response = await fetch(url, {
      headers: {
        'Referer': 'https://y.qq.com/',
        'User-Agent': this.getHeaders()['User-Agent'],
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });

    const setCookie = this._getSetCookie(response);
    const qrsig = this._getCookieValue(setCookie, 'qrsig');
    const image = Buffer.from(await response.arrayBuffer()).toString('base64');

    if (!qrsig) {
      return JSON.stringify({
        code: -1,
        server: 'tencent',
        platform: 'tencent',
        message: 'Failed to create QQ Music QR login key'
      });
    }

    return JSON.stringify({
      code: 200,
      server: 'tencent',
      platform: 'tencent',
      type: 'qq',
      scanApp: 'QQ',
      key: qrsig,
      qrsig,
      ptqrtoken: this._hash33(qrsig),
      qrimg: `data:image/png;base64,${image}`
    });
  }

  async loginQrCreate(key, option = {}) {
    const keyResult = option.loginQrKey || {};
    const qrsig = keyResult.qrsig || key;

    return JSON.stringify({
      code: 200,
      server: 'tencent',
      platform: 'tencent',
      type: 'qq',
      scanApp: 'QQ',
      key: qrsig,
      qrsig,
      ptqrtoken: keyResult.ptqrtoken || this._hash33(qrsig),
      qrimg: keyResult.qrimg || '',
      qrurl: ''
    });
  }

  async fetchLoginQrCheck(key, option = {}) {
    const state = option.loginState || {};
    const qrsig = state.qrsig || key;
    const ptqrtoken = state.ptqrtoken || this._hash33(qrsig);

    if (!qrsig) {
      return JSON.stringify({
        code: 400,
        server: 'tencent',
        platform: 'tencent',
        message: 'Missing qrsig'
      });
    }

    const url = 'https://ssl.ptlogin2.qq.com/ptqrlogin?' + new URLSearchParams({
      u1: QQ_LOGIN_U1,
      ptqrtoken: String(ptqrtoken),
      ptredirect: '0',
      h: '1',
      t: '1',
      g: '1',
      from_ui: '1',
      ptlang: '2052',
      action: `0-0-${Date.now()}`,
      js_ver: QQ_LOGIN_JS_VER,
      js_type: '1',
      login_sig: '',
      pt_uistyle: '40',
      aid: QQ_LOGIN_APPID,
      daid: QQ_LOGIN_DAID,
      pt_3rd_aid: QQ_LOGIN_3RD_AID,
      pt_js_version: QQ_LOGIN_PT_JS_VER
    }).toString();

    const response = await fetch(url, {
      redirect: 'manual',
      headers: {
        'Cookie': `qrsig=${qrsig}`,
        'Referer': 'https://xui.ptlogin2.qq.com/',
        'User-Agent': this.getHeaders()['User-Agent'],
        'Accept': '*/*'
      }
    });

    const raw = await response.text();
    const args = this._parsePtuiCallback(raw);
    const qqCode = args[0] || '';
    const message = args[4] || this._getLoginMessage(qqCode);

    const result = {
      code: this._normalizeLoginCode(qqCode),
      qqCode,
      server: 'tencent',
      platform: 'tencent',
      type: 'qq',
      message,
      raw
    };

    if (result.code !== 803) {
      return JSON.stringify(result);
    }

    const redirectUrl = args[2] || '';
    let cookies = this._cookiePairs(this._getSetCookie(response));

    if (redirectUrl) {
      const checkSigResponse = await fetch(redirectUrl, {
        redirect: 'manual',
        headers: {
          'Cookie': this._mergeCookieHeaders(`qrsig=${qrsig}`, cookies.join('; ')),
          'Referer': 'https://ssl.ptlogin2.qq.com/',
          'User-Agent': this.getHeaders()['User-Agent'],
          'Accept': '*/*'
        }
      });

      cookies = cookies.concat(this._cookiePairs(this._getSetCookie(checkSigResponse)));
      const musicCookies = await this._fetchMusicCookies(cookies);
      cookies = cookies.concat(musicCookies);
    }

    const cookie = this._dedupeCookiePairs(cookies).join('; ');
    if (cookie) {
      result.cookie = cookie;
      result.cookieHeader = this._mergeCookieHeaders(this.meting.header.Cookie, cookie);
      this.meting.cookie(result.cookieHeader);
    }

    return JSON.stringify(result);
  }

  /**
   * 搜索歌曲
   */
  search(keyword, option = {}) {
    return {
      method: 'GET',
      url: 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp',
      body: {
        format: 'json',
        p: option.page || 1,
        n: option.limit || 30,
        w: keyword,
        aggr: 1,
        lossless: 1,
        cr: 1,
        new_json: 1
      },
      format: 'data.song.list'
    };
  }

  /**
   * 获取歌曲详情
   */
  song(id) {
    return {
      method: 'GET',
      url: 'https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg',
      body: {
        songmid: id,
        platform: 'yqq',
        format: 'json'
      },
      format: 'data'
    };
  }

  /**
   * 获取专辑信息
   */
  album(id) {
    return {
      method: 'GET',
      url: 'https://c.y.qq.com/v8/fcg-bin/fcg_v8_album_detail_cp.fcg',
      body: {
        albummid: id,
        platform: 'mac',
        format: 'json',
        newsong: 1
      },
      format: 'data.getSongInfo'
    };
  }

  /**
   * 获取艺术家作品
   */
  artist(id, limit = 50) {
    return {
      method: 'GET',
      url: 'https://c.y.qq.com/v8/fcg-bin/fcg_v8_singer_track_cp.fcg',
      body: {
        singermid: id,
        begin: 0,
        num: limit,
        order: 'listen',
        platform: 'mac',
        newsong: 1
      },
      format: 'data.list'
    };
  }

  /**
   * 获取播放列表
   */
  playlist(id) {
    return {
      method: 'GET',
      url: 'https://c.y.qq.com/v8/fcg-bin/fcg_v8_playlist_cp.fcg',
      body: {
        id: id,
        format: 'json',
        newsong: 1,
        platform: 'jqspaframe.json'
      },
      format: 'data.cdlist.0.songlist'
    };
  }

  /**
   * 获取音频播放链接
   */
  url(id, br = 320) {
    return {
      method: 'GET',
      url: 'https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg',
      body: {
        songmid: id,
        platform: 'yqq',
        format: 'json'
      },
      decode: 'tencent_url'
    };
  }

  /**
   * 获取歌词
   */
  lyric(id) {
    return {
      method: 'GET',
      url: 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg',
      body: {
        songmid: id,
        g_tk: '5381'
      },
      decode: 'tencent_lyric'
    };
  }

  /**
   * 获取封面图片
   */
  async pic(id, size = 300) {
    const url = `https://y.gtimg.cn/music/photo_new/T002R${size}x${size}M000${id}.jpg?max_age=2592000`;
    return JSON.stringify({ url: url });
  }

  /**
   * 格式化腾讯音乐数据
   */
  format(data) {
    if (data.musicData) {
      data = data.musicData;
    }
    
    const result = {
      id: data.mid,
      name: data.name,
      artist: [],
      album: data.album.title.trim(),
      pic_id: data.album.mid,
      url_id: data.mid,
      lyric_id: data.mid,
      source: 'tencent'
    };
    
    data.singer.forEach(singer => {
      result.artist.push(singer.name);
    });
    
    return result;
  }

  /**
   * 处理腾讯音乐的解码逻辑
   */
  async handleDecode(decodeType, data) {
    if (decodeType === 'tencent_url') {
      return this.urlDecode(data);
    } else if (decodeType === 'tencent_lyric') {
      return this.lyricDecode(data);
    }
    return data;
  }

  /**
   * 腾讯音乐 URL 解码
   */
  async urlDecode(result) {
    const data = JSON.parse(result);
    const song = data.data && data.data[0];
    if (!song || !song.file) {
      return JSON.stringify({
        url: '',
        size: 0,
        br: -1,
        message: 'QQ Music did not return song metadata'
      });
    }

    const guid = Math.floor(Math.random() * 10000000000);
    
    const qualityMap = [
      ['size_flac', 999, 'F000', 'flac'],
      ['size_320mp3', 320, 'M800', 'mp3'],
      ['size_192aac', 192, 'C600', 'm4a'],
      ['size_128mp3', 128, 'M500', 'mp3'],
      ['size_96aac', 96, 'C400', 'm4a'],
      ['size_48aac', 48, 'C200', 'm4a'],
      ['size_24aac', 24, 'C100', 'm4a']
    ];
    
    const uin = this._getLoginUin();
    const gtk = this._getGtk();
    const candidates = [];

    qualityMap.forEach(([sizeKey, br, prefix, ext]) => {
      if (!song.file[sizeKey] || br > this.meting.temp.br) {
        return;
      }

      const filenames = new Set([
        `${prefix}${song.file.media_mid || song.mid}.${ext}`,
        `${prefix}${song.mid}${song.mid}.${ext}`,
        `${prefix}${song.mid}.${ext}`
      ]);

      filenames.forEach(filename => {
        candidates.push({
          filename,
          songmid: song.mid,
          songtype: song.type || 0,
          size: song.file[sizeKey],
          br
        });
      });
    });

    if (!candidates.length) {
      return JSON.stringify({
        url: '',
        size: 0,
        br: -1,
        message: 'QQ Music has no matching file for the requested bitrate'
      });
    }

    const payload = {
      req_1: {
        module: 'vkey.GetVkeyServer',
        method: 'CgiGetVkey',
        param: {
          guid: String(guid),
          songmid: candidates.map(candidate => candidate.songmid),
          filename: candidates.map(candidate => candidate.filename),
          songtype: candidates.map(candidate => candidate.songtype),
          uin: uin,
          loginflag: 1,
          platform: '20'
        }
      },
      loginUin: uin,
      comm: {
        uin,
        format: 'json',
        ct: 24,
        cv: 0
      }
    };

    if (gtk) {
      payload.comm.g_tk = gtk;
    }
    
    const api = {
      method: 'POST',
      url: 'https://u.y.qq.com/cgi-bin/musicu.fcg',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://y.qq.com',
        'Referer': 'https://y.qq.com/'
      }
    };
    
    const response = JSON.parse(await this.meting._exec(api));
    const vkeys = response.req_1 && response.req_1.data ? response.req_1.data.midurlinfo || [] : [];
    const sip = response.req_1 && response.req_1.data && response.req_1.data.sip ? response.req_1.data.sip[0] : '';
    
    let url = null;
    for (let i = 0; i < candidates.length; i++) {
      const vkey = vkeys[i] || {};
      if (vkey.purl) {
        const purl = vkey.purl || '';
        url = {
          url: /^https?:\/\//i.test(purl) ? purl : `${sip}${purl}`,
          size: candidates[i].size,
          br: candidates[i].br
        };
        break;
      }
    }
    
    if (!url) {
      url = {
        url: '',
        size: 0,
        br: -1,
        code: response.req_1 ? response.req_1.code : response.code,
        message: response.req_1 && response.req_1.msg
          ? response.req_1.msg
          : 'QQ Music did not return a playable URL for this track'
      };
    }
    
    return JSON.stringify(url);
  }

  /**
   * 解码HTML实体编码
   */
  decodeHtmlEntities(text) {
    if (!text) return text;

    // 常见HTML实体编码映射
    const entityMap = {
      '&apos;': "'",
      '&quot;': '"',
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&nbsp;': ' '
    };

    // 替换命名实体
    let decoded = text;
    for (const [entity, char] of Object.entries(entityMap)) {
      decoded = decoded.replace(new RegExp(entity, 'g'), char);
    }

    // 替换数字实体（如 &#39; &#34; 等）
    decoded = decoded.replace(/&#(\d+);/g, (match, dec) => {
      return String.fromCharCode(parseInt(dec, 10));
    });

    // 替换十六进制实体（如 &#x27; 等）
    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });

    return decoded;
  }

  /**
   * 腾讯音乐歌词解码
   */
  lyricDecode(result) {
    const jsonStr = result.substring(18, result.length - 1);
    const data = JSON.parse(jsonStr);

    const lyricData = {
      lyric: data.lyric ? this.decodeHtmlEntities(Buffer.from(data.lyric, 'base64').toString()) : '',
      tlyric: data.trans ? this.decodeHtmlEntities(Buffer.from(data.trans, 'base64').toString()) : ''
    };

    return JSON.stringify(lyricData);
  }

  async _fetchMusicCookies(cookies) {
    try {
      const response = await fetch('https://y.qq.com/portal/profile.html', {
        redirect: 'manual',
        headers: {
          'Cookie': this._dedupeCookiePairs(cookies).join('; '),
          'Referer': 'https://y.qq.com/',
          'User-Agent': this.getHeaders()['User-Agent'],
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      return this._cookiePairs(this._getSetCookie(response));
    } catch (error) {
      return [];
    }
  }

  _getLoginUin() {
    const cookieUin =
      this._getCookieHeaderValue('uin') ||
      this._getCookieHeaderValue('p_uin') ||
      this._getCookieHeaderValue('pt2gguin') ||
      '';

    const normalized = String(cookieUin).replace(/^o/, '').replace(/\D/g, '');
    return normalized || '0';
  }

  _getGtk() {
    const skey = this._getCookieHeaderValue('p_skey') || this._getCookieHeaderValue('skey') || '';
    if (!skey) {
      return 0;
    }

    let hash = 5381;
    for (let i = 0; i < skey.length; i++) {
      hash += (hash << 5) + skey.charCodeAt(i);
    }
    return hash & 0x7fffffff;
  }

  _getCookieHeaderValue(name) {
    const cookie = this.meting.header.Cookie || '';
    const found = String(cookie)
      .split(';')
      .map(item => item.trim())
      .find(item => item.startsWith(`${name}=`));

    return found ? found.slice(name.length + 1) : '';
  }

  _hash33(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash += (hash << 5) + value.charCodeAt(i);
      hash &= 0x7fffffff;
    }
    return hash & 0x7fffffff;
  }

  _parsePtuiCallback(raw) {
    const match = String(raw).match(/ptuiCB\((.*)\)/);
    if (!match) {
      return [];
    }

    const args = [];
    const pattern = /'([^']*)'/g;
    let part;
    while ((part = pattern.exec(match[1])) !== null) {
      args.push(part[1]);
    }
    return args;
  }

  _normalizeLoginCode(qqCode) {
    const codeMap = {
      '0': 803,
      '65': 800,
      '66': 801,
      '67': 802
    };

    return codeMap[qqCode] || Number(qqCode) || -1;
  }

  _getLoginMessage(qqCode) {
    const messageMap = {
      '0': '登录成功',
      '65': '二维码已失效',
      '66': '等待扫码',
      '67': '已扫码，等待确认'
    };

    return messageMap[qqCode] || 'QQ Music QR login status unknown';
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

  _getCookieValue(setCookie, name) {
    const pair = this._cookiePairs(setCookie)
      .find(cookie => cookie.startsWith(`${name}=`));

    return pair ? pair.slice(name.length + 1) : '';
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
