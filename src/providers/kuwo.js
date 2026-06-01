import crypto from 'crypto';
import BaseProvider from './base.js';

const KUWO_WX_APPID = 'wx41c1275bb3e28427';
const KUWO_CALLBACK_URL = 'https://www.kuwo.cn/callback';
const KUWO_WX_REDIRECT_BASE = 'http://i.kuwo.cn/US/platform/WeixinCallback.jsp';

/**
 * 酷我音乐平台提供者
 */
export default class KuwoProvider extends BaseProvider {
  constructor(meting) {
    super(meting);
    this.name = 'kuwo';
  }

  /**
   * 获取酷我音乐的请求头配置
   */
  getHeaders() {
    return {
      'Cookie': 'Hm_lvt_cdb524f42f0ce19b169a8071123a4797=1623339177,1623339183; _ga=GA1.2.1195980605.1579367081; Hm_lpvt_cdb524f42f0ce19b169a8071123a4797=1623339982; kw_token=3E7JFQ7MRPL; _gid=GA1.2.747985028.1623339179; _gat=1',
      'csrf': '3E7JFQ7MRPL',
      'Host': 'www.kuwo.cn',
      'Referer': 'http://www.kuwo.cn/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Safari/537.36'
    };
  }

  async fetchLoginQrKey(option = {}) {
    const callbackUrl = option.callbackUrl || KUWO_CALLBACK_URL;
    const wxState = this._randomState();
    const redirectUri = `${KUWO_WX_REDIRECT_BASE}?f=web&callbackUrl=${encodeURIComponent(callbackUrl)}`;
    const authUrl = 'https://open.weixin.qq.com/connect/qrconnect?' + new URLSearchParams({
      appid: KUWO_WX_APPID,
      response_type: 'code',
      scope: 'snsapi_login',
      redirect_uri: redirectUri,
      state: wxState
    }).toString();

    const response = await fetch(`${authUrl}#wechat_redirect`, {
      headers: this._getWebHeaders()
    });
    const html = await response.text();
    const ticket = this._parseWeChatQrPage(html);

    if (!ticket) {
      return JSON.stringify({
        code: -1,
        server: 'kuwo',
        platform: 'kuwo',
        type: 'wechat',
        scanApp: 'WeChat',
        message: 'Failed to create Kuwo WeChat QR login ticket',
        raw: html.slice(0, 1000)
      });
    }

    return JSON.stringify({
      code: 200,
      server: 'kuwo',
      platform: 'kuwo',
      type: 'wechat',
      scanApp: 'WeChat',
      key: ticket,
      ticket,
      wxState,
      redirectUri,
      qrurl: `https://open.weixin.qq.com/connect/qrcode/${ticket}`
    });
  }

  async loginQrCreate(key, option = {}) {
    if (!key) {
      throw new Error('QR login key is required');
    }

    const keyResult = option.loginQrKey || {};
    const ticket = keyResult.ticket || key;

    return JSON.stringify({
      code: 200,
      server: 'kuwo',
      platform: 'kuwo',
      type: 'wechat',
      scanApp: 'WeChat',
      key: ticket,
      ticket,
      wxState: keyResult.wxState,
      redirectUri: keyResult.redirectUri,
      qrurl: `https://open.weixin.qq.com/connect/qrcode/${ticket}`
    });
  }

  async fetchLoginQrCheck(key, option = {}) {
    const state = option.loginState || {};
    const ticket = state.ticket || key;

    if (!ticket) {
      return JSON.stringify({
        code: 400,
        server: 'kuwo',
        platform: 'kuwo',
        type: 'wechat',
        scanApp: 'WeChat',
        message: 'Missing WeChat QR ticket'
      });
    }

    const pollUrl = 'https://long.open.weixin.qq.com/connect/l/qrconnect?' + new URLSearchParams({
      uuid: ticket,
      _: String(Date.now())
    }).toString();
    const pollResponse = await fetch(pollUrl, {
      headers: this._getWebHeaders()
    });
    const raw = await pollResponse.text();
    const poll = this._parseWeChatPoll(raw);
    const result = {
      code: this._normalizeWeChatCode(poll.wxCode),
      wxCode: poll.wxCode,
      server: 'kuwo',
      platform: 'kuwo',
      type: 'wechat',
      scanApp: 'WeChat',
      message: this._getWeChatMessage(poll.wxCode),
      raw
    };

    if (result.code !== 803) {
      return JSON.stringify(result);
    }

    const redirectUri = state.redirectUri || `${KUWO_WX_REDIRECT_BASE}?f=web&callbackUrl=${encodeURIComponent(KUWO_CALLBACK_URL)}`;
    const callbackUrl = `${redirectUri}${redirectUri.includes('?') ? '&' : '?'}code=${encodeURIComponent(poll.code || '')}&state=${encodeURIComponent(state.wxState || '')}`;
    const callback = await this._fetchKuwoCallback(callbackUrl);

    result.callbackStatus = callback.statusCode;
    result.location = callback.location;

    if (callback.cookie) {
      result.cookie = callback.cookie;
      result.cookieHeader = this._mergeCookieHeaders(this.meting.header.Cookie, callback.cookie);
      this.meting.cookie(result.cookieHeader);

      const cookie = this.parseCookie(result.cookieHeader);
      if (cookie.kw_token) {
        this.meting.header.csrf = cookie.kw_token;
      }
    }

    return JSON.stringify(result);
  }

  /**
   * 搜索歌曲
   */
  search(keyword, option = {}) {
    return {
      method: 'GET',
      url: 'http://www.kuwo.cn/api/www/search/searchMusicBykeyWord',
      body: {
        key: keyword,
        pn: option.page || 1,
        rn: option.limit || 30,
        httpsStatus: 1
      },
      format: 'data.list'
    };
  }

  /**
   * 获取歌曲详情
   */
  song(id) {
    return {
      method: 'GET',
      url: 'http://www.kuwo.cn/api/www/music/musicInfo',
      body: {
        mid: id,
        httpsStatus: 1
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
      url: 'http://www.kuwo.cn/api/www/album/albumInfo',
      body: {
        albumId: id,
        pn: 1,
        rn: 1000,
        httpsStatus: 1
      },
      format: 'data.musicList'
    };
  }

  /**
   * 获取艺术家作品
   */
  artist(id, limit = 50) {
    return {
      method: 'GET',
      url: 'http://www.kuwo.cn/api/www/artist/artistMusic',
      body: {
        artistid: id,
        pn: 1,
        rn: limit,
        httpsStatus: 1
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
      url: 'http://www.kuwo.cn/api/www/playlist/playListInfo',
      body: {
        pid: id,
        pn: 1,
        rn: 1000,
        httpsStatus: 1
      },
      format: 'data.musicList'
    };
  }

  /**
   * 获取音频播放链接
   */
  url(id, br = 320) {
    return {
      method: 'GET',
      url: 'http://www.kuwo.cn/api/v1/www/music/playUrl',
      body: {
        mid: id,
        type: 'music',
        httpsStatus: 1
      },
      decode: 'kuwo_url'
    };
  }

  /**
   * 获取歌词
   */
  lyric(id) {
    return {
      method: 'GET',
      url: 'http://m.kuwo.cn/newh5/singles/songinfoandlrc',
      body: {
        musicId: id,
        httpsStatus: 1
      },
      decode: 'kuwo_lyric'
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
    const url = songData.data.pic || songData.data.albumpic;
    return JSON.stringify({ url: url });
  }

  /**
   * 格式化酷我音乐数据
   */
  format(data) {
    return {
      id: data.rid,
      name: data.name,
      artist: data.artist ? data.artist.split('&') : [],
      album: data.album || '',
      pic_id: data.rid,
      url_id: data.rid,
      lyric_id: data.rid,
      source: 'kuwo'
    };
  }

  parseCookie(cookieStr) {
    const cookies = {};
    if (!cookieStr) {
      return cookies;
    }

    String(cookieStr).split(';').forEach(pair => {
      const index = pair.indexOf('=');
      if (index <= 0) {
        return;
      }

      cookies[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
    });

    return cookies;
  }

  /**
   * 处理酷我音乐的解码逻辑
   */
  async handleDecode(decodeType, data) {
    if (decodeType === 'kuwo_url') {
      return this.urlDecode(data);
    } else if (decodeType === 'kuwo_lyric') {
      return this.lyricDecode(data);
    }
    return data;
  }

  /**
   * 酷我音乐 URL 解码
   */
  urlDecode(result) {
    const data = JSON.parse(result);
    
    let url;
    if (data.code === 200 && data.data && data.data.url) {
      url = {
        url: data.data.url,
        br: 128
      };
    } else {
      url = {
        url: '',
        br: -1
      };
    }
    
    return JSON.stringify(url);
  }

  /**
   * 酷我音乐歌词解码
   */
  lyricDecode(result) {
    const data = JSON.parse(result);
    
    let lyric = '';
    if (data.data && data.data.lrclist && data.data.lrclist.length > 0) {
      data.data.lrclist.forEach(item => {
        const time = parseFloat(item.time);
        const min = Math.floor(time / 60).toString().padStart(2, '0');
        const sec = Math.floor(time % 60).toString().padStart(2, '0');
        const msec = ((time % 1) * 100).toFixed(0).padStart(2, '0');
        
        lyric += `[${min}:${sec}.${msec}]${item.lineLyric}\n`;
      });
    }
    
    const lyricData = {
      lyric: lyric,
      tlyric: ''
    };
    
    return JSON.stringify(lyricData);
  }

  async _fetchKuwoCallback(url) {
    let currentUrl = url;
    let cookies = [];
    let statusCode = 0;
    let location = '';

    for (let i = 0; i < 5 && currentUrl; i++) {
      const cookieHeader = this._mergeCookieHeaders(
        this.meting.header.Cookie,
        this._dedupeCookiePairs(cookies).join('; ')
      );
      const response = await fetch(currentUrl, {
        redirect: 'manual',
        headers: this._getWebHeaders(cookieHeader)
      });

      statusCode = response.status;
      cookies = cookies.concat(this._cookiePairs(this._getSetCookie(response)));
      location = response.headers.get('location') || '';

      if (!location || statusCode < 300 || statusCode >= 400) {
        break;
      }

      currentUrl = new URL(location, currentUrl).toString();
    }

    return {
      statusCode,
      location,
      cookie: this._dedupeCookiePairs(cookies).join('; ')
    };
  }

  _getWebHeaders(cookie = '') {
    return {
      'Referer': 'https://www.kuwo.cn/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      ...(cookie ? { 'Cookie': cookie } : {})
    };
  }

  _parseWeChatQrPage(html) {
    const match = String(html).match(/\/connect\/qrcode\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : '';
  }

  _parseWeChatPoll(raw) {
    const errcode = String(raw).match(/window\.wx_errcode=(\d+)/);
    const code = String(raw).match(/window\.wx_code='([^']+)'/);

    return {
      wxCode: errcode ? errcode[1] : '',
      code: code ? code[1] : ''
    };
  }

  _normalizeWeChatCode(wxCode) {
    const codeMap = {
      '402': 800,
      '408': 801,
      '404': 802,
      '405': 803,
      '403': 403
    };

    return codeMap[wxCode] || Number(wxCode) || -1;
  }

  _getWeChatMessage(wxCode) {
    const messageMap = {
      '402': 'QR code expired',
      '408': 'Waiting for scan',
      '404': 'Scanned, waiting for confirmation',
      '405': 'Login succeeded',
      '403': 'Login cancelled'
    };

    return messageMap[wxCode] || 'Kuwo WeChat QR login status unknown';
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

  _randomState() {
    return crypto.randomBytes(16).toString('hex');
  }
}
