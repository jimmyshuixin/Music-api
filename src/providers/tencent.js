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
      const redirectCookies = await this._followCookieRedirects(
        redirectUrl,
        [`qrsig=${qrsig}`, ...cookies],
        'https://ssl.ptlogin2.qq.com/'
      );

      cookies = cookies.concat(redirectCookies);
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

  userPlaylists(userId = null, option = {}) {
    const uin = userId || option.uin || this._getLoginUin();
    const gtk = this._getGtk() || 5381;

    return {
      method: 'GET',
      url: 'https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss',
      body: {
        hostUin: 0,
        hostuin: uin,
        sin: option.offset || 0,
        size: option.limit || 200,
        g_tk: gtk,
        loginUin: uin,
        format: 'json',
        inCharset: 'utf8',
        outCharset: 'utf-8',
        notice: 0,
        platform: 'yqq.json',
        needNewCode: 0
      },
      headers: {
        'Referer': 'https://y.qq.com/portal/profile.html'
      },
      decode: 'tencent_user_playlists'
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

    const album = data.album || {};
    const singers = Array.isArray(data.singer)
      ? data.singer
      : (Array.isArray(data.singers) ? data.singers : []);
    const id = data.mid || data.songmid || (data.file && data.file.media_mid) || '';

    if (!id) {
      return null;
    }

    const result = {
      id,
      name: data.name || data.title || data.songname || '',
      artist: [],
      album: String(album.title || album.name || data.albumname || '').trim(),
      pic_id: album.mid || album.pmid || data.albummid || '',
      url_id: id,
      lyric_id: id,
      source: 'tencent'
    };

    singers.forEach(singer => {
      const name = singer.name || singer.title || singer.singername;
      if (name) {
        result.artist.push(name);
      }
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
    } else if (decodeType === 'tencent_user_playlists') {
      return this.userPlaylistsDecode(data);
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

    const guid = this._getGuid();
    
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
    const gtk = this._getGtk() || 5381;
    const musicKey = this._getMusicKey();
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

    payload.comm.g_tk = gtk;
    if (musicKey) {
      payload.comm.authst = musicKey;
    }

    const query = new URLSearchParams({
      '-': `getplaysongvkey${Date.now()}`,
      g_tk: String(gtk),
      loginUin: String(uin),
      hostUin: '0',
      format: 'json',
      inCharset: 'utf8',
      outCharset: 'utf-8',
      notice: '0',
      platform: 'yqq.json',
      needNewCode: '0'
    });
    
    const api = {
      method: 'POST',
      url: `https://u.y.qq.com/cgi-bin/musicu.fcg?${query.toString()}`,
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
    const data = this._parseJsonPayload(result);

    const lyricData = {
      lyric: data.lyric ? this.decodeHtmlEntities(Buffer.from(data.lyric, 'base64').toString()) : '',
      tlyric: data.trans ? this.decodeHtmlEntities(Buffer.from(data.trans, 'base64').toString()) : ''
    };

    return JSON.stringify(lyricData);
  }

  userPlaylistsDecode(result) {
    const payload = this._parseJsonPayload(result);
    const data = payload && payload.data ? payload.data : {};
    const list = Array.isArray(data.disslist) ? data.disslist : [];

    return JSON.stringify({
      code: payload && typeof payload.code === 'number' ? payload.code : 0,
      server: 'tencent',
      platform: 'tencent',
      user: {
        uin: this._getLoginUin(),
        hostuin: data.hostuin ? String(data.hostuin) : '',
        encrypt_uin: data.encrypt_uin || '',
        name: data.hostname || ''
      },
      playlists: list.map(item => ({
        id: String(item.tid || item.disstid || item.dissid || item.dirid || ''),
        dirid: item.dirid || null,
        dissid: item.dissid || item.tid || null,
        name: item.diss_name || item.dissname || item.dirname || '',
        pic: item.diss_cover || item.diss_pic || item.logo || '',
        song_count: item.song_cnt || item.songnum || item.cur_song_num || 0,
        listen_count: item.listen_num || item.visitnum || 0,
        public: item.dir_show !== 0,
        source: 'tencent'
      })).filter(item => item.id)
    });
  }

  async _fetchMusicCookies(cookies) {
    try {
      return await this._followCookieRedirects(
        'https://y.qq.com/portal/profile.html',
        cookies,
        'https://y.qq.com/'
      );
    } catch (error) {
      return [];
    }
  }

  async _followCookieRedirects(url, cookies, referer = 'https://y.qq.com/', maxRedirects = 5) {
    const collected = [];
    let currentUrl = url;
    let currentReferer = referer;
    let cookieJar = this._dedupeCookiePairs(cookies);

    for (let i = 0; i <= maxRedirects && currentUrl; i++) {
      const response = await fetch(currentUrl, {
        redirect: 'manual',
        headers: {
          'Cookie': cookieJar.join('; '),
          'Referer': currentReferer,
          'User-Agent': this.getHeaders()['User-Agent'],
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      const nextCookies = this._cookiePairs(this._getSetCookie(response));
      collected.push(...nextCookies);
      cookieJar = this._dedupeCookiePairs([...cookieJar, ...nextCookies]);

      const location = response.headers.get('location');
      if (!location || response.status < 300 || response.status >= 400) {
        break;
      }

      currentReferer = currentUrl;
      currentUrl = new URL(location, currentUrl).toString();
    }

    return this._dedupeCookiePairs(collected);
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

  _getMusicKey() {
    return this._getCookieHeaderValue('qqmusic_key') ||
      this._getCookieHeaderValue('qm_keyst') ||
      this._getCookieHeaderValue('musickey') ||
      '';
  }

  _getGuid() {
    const guid = this._getCookieHeaderValue('pgv_pvid') ||
      this._getCookieHeaderValue('pgv_pvi') ||
      String(Math.floor(Math.random() * 10000000000));

    return String(guid).replace(/\D/g, '') || String(Math.floor(Math.random() * 10000000000));
  }

  _parseJsonPayload(result) {
    const text = String(result || '').trim();

    try {
      return JSON.parse(text);
    } catch (error) {
      const match = text.match(/^[^(]*\(([\s\S]*)\)\s*;?$/);
      if (!match) {
        throw error;
      }
      return JSON.parse(match[1]);
    }
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
