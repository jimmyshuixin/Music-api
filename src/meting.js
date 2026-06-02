/**
 * Meting music framework - Node.js version (重构版本)
 * https://i-meto.com
 * https://github.com/metowolf/Meting
 *
 * Copyright 2019, METO Sheel <i@i-meto.com>
 * Released under the MIT license
 */

import { URLSearchParams } from 'url';
import ProviderFactory from './providers/index.js';

class Meting {
  constructor(server = 'netease') {
    this.VERSION = '__VERSION__'; // 在构建时由 rollup 替换为实际版本号
    this.raw = null;
    this.info = null;
    this.error = null;
    this.status = null;
    this.temp = {};

    this.server = null;
    this.provider = null;
    this.isFormat = false;
    this.header = {};

    this.site(server);
  }

  // 设置音乐平台
  site(server) {
    if (!ProviderFactory.isSupported(server)) {
      server = 'netease'; // 默认使用网易云音乐
    }

    this.server = server;
    this.provider = ProviderFactory.create(server, this);
    this.header = this.provider.getHeaders();

    return this;
  }

  // 设置 Cookie
  cookie(cookie) {
    this.header['Cookie'] = cookie;
    return this;
  }

  // 设置数据格式化
  format(format = true) {
    this.isFormat = format;
    return this;
  }

  // 执行 API 请求的主方法
  async _exec(api) {
    // 让 Provider 自己处理完整的请求流程
    return await this.provider.executeRequest(api, this);
  }

  // HTTP 请求方法 - 使用 fetch API
  async _curl(url, payload = null, headerOnly = false) {
    const requestOptions = {
      method: payload ? 'POST' : 'GET',
      headers: { ...this.header }
    };

    // 处理请求体
    if (payload) {
      if (typeof payload === 'object' && !Buffer.isBuffer(payload) && typeof payload !== 'string') {
        payload = new URLSearchParams(payload).toString();
        requestOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
      requestOptions.body = payload;
    }

    // 添加超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    requestOptions.signal = controller.signal;

    let retries = 3;
    const makeRequest = async () => {
      try {
        const response = await fetch(url, requestOptions);
        
        clearTimeout(timeoutId);
        
        // 存储响应信息
        let setCookie = [];
        if (typeof response.headers.getSetCookie === 'function') {
          setCookie = response.headers.getSetCookie();
        } else if (typeof response.headers.raw === 'function') {
          setCookie = response.headers.raw()['set-cookie'] || [];
        } else {
          const cookieHeader = response.headers.get('set-cookie');
          if (cookieHeader) {
            setCookie = [cookieHeader];
          }
        }

        this.info = {
          statusCode: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          setCookie
        };

        // 获取响应数据
        const data = await response.text();
        this.raw = data;
        this.error = null;
        this.status = '';
        
        return this;
      } catch (err) {
        clearTimeout(timeoutId);
        
        // 处理错误
        if (err.name === 'AbortError') {
          this.error = 'TIMEOUT';
          this.status = 'Request timeout';
        } else {
          this.error = err.code || err.name;
          this.status = err.message;
        }
        
        // 重试机制
        if (retries > 0) {
          retries--;
          await new Promise(resolve => setTimeout(resolve, 1000));
          return makeRequest();
        } else {
          return this;
        }
      }
    };

    return await makeRequest();
  }


  // ========== 公共 API 方法 ==========

  // 搜索功能
  async search(keyword, option = {}) {
    const api = this.provider.search(keyword, option);
    return await this._exec(api);
  }

  // 获取歌曲详情
  async song(id) {
    const api = this.provider.song(id);
    return await this._exec(api);
  }

  // 获取专辑信息
  async album(id) {
    const api = this.provider.album(id);
    return await this._exec(api);
  }

  // 获取艺术家作品
  async artist(id, limit = 50) {
    const api = this.provider.artist(id, limit);
    return await this._exec(api);
  }

  // 获取播放列表
  async playlist(id) {
    const api = this.provider.playlist(id);
    return await this._exec(api);
  }

  async userPlaylists(userId = null, option = {}) {
    const api = this.provider.userPlaylists(userId, option);
    return await this._exec(api);
  }

  // 获取音频播放链接
  async url(id, br = 320) {
    this.temp.br = br;
    const api = this.provider.url(id, br);
    return await this._exec(api);
  }

  // 获取歌词
  async lyric(id) {
    const api = this.provider.lyric(id);
    return await this._exec(api);
  }

  // 获取封面图片
  async pic(id, size = 300) {
    return await this.provider.pic(id, size);
  }

  // ========== Login API methods ==========

  // Create a QR login challenge for the current or requested provider.
  async loginQr(option = {}) {
    return await this._withLoginProvider(option, async () => {
      const keyResult = JSON.parse(await this.loginQrKey(option) || 'null') || {};
      const key = keyResult.key ||
        keyResult.unikey ||
        keyResult.qrsig ||
        keyResult.ticket ||
        (keyResult.data && keyResult.data.unikey);

      if (!key) {
        return JSON.stringify({
          code: keyResult.code || -1,
          server: this.server,
          platform: this.server,
          message: keyResult.message || this.status || 'Failed to create QR login key'
        });
      }

      const result = JSON.parse(await this.loginQrCreate(key, {
        ...option,
        loginQrKey: keyResult
      }) || 'null') || {};

      result.server = result.server || this.server;
      result.platform = result.platform || this.server;
      result.key = result.key || key;
      result.mid = result.mid || keyResult.mid;
      result.dfid = result.dfid || keyResult.dfid;
      result.state = result.state || this._encodeLoginState({
        server: this.server,
        key,
        unikey: result.unikey || keyResult.unikey,
        qrsig: result.qrsig || keyResult.qrsig,
        ptqrtoken: result.ptqrtoken || keyResult.ptqrtoken,
        qrcode: result.qrcode || keyResult.qrcode,
        ticket: result.ticket || keyResult.ticket,
        wxState: result.wxState || keyResult.wxState,
        redirectUri: result.redirectUri || keyResult.redirectUri,
        mid: result.mid || keyResult.mid,
        dfid: result.dfid || keyResult.dfid
      });

      return JSON.stringify(result);
    });
  }

  // Create a QR login key.
  async loginQrKey(option = {}) {
    if (typeof this.provider.fetchLoginQrKey === 'function') {
      return await this.provider.fetchLoginQrKey(option, this);
    }

    const api = this.provider.loginQrKey(option);
    return await this._exec(api);
  }

  // Convert a QR login key to a scannable login URL.
  async loginQrCreate(key, option = {}) {
    return await this.provider.loginQrCreate(key, option);
  }

  // Poll QR login status. A successful response includes a cookie field.
  async loginQrCheck(key, option = {}) {
    const state = option.state || this._decodeLoginState(key);

    if (state) {
      return await this._withLoginProvider({ server: state.server }, async () => {
        const stateKey = state.key || state.unikey || state.qrsig || state.qrcode || state.ticket;
        return await this.loginQrCheck(stateKey, {
          ...option,
          state: null,
          loginState: state
        });
      });
    }

    if (typeof this.provider.fetchLoginQrCheck === 'function') {
      return await this.provider.fetchLoginQrCheck(key, option, this);
    }

    const api = this.provider.loginQrCheck(key, option);
    const raw = await this._exec(api);

    if (typeof this.provider.formatLoginQrCheck === 'function') {
      return this.provider.formatLoginQrCheck(raw, this.info, this);
    }

    return raw;
  }

  async _withLoginProvider(option, callback) {
    const server = option.server || option.platform;
    if (!server || server === this.server) {
      return await callback();
    }

    const originalServer = this.server;
    const originalProvider = this.provider;
    const originalHeader = this.header;

    this.site(server);
    try {
      return await callback();
    } finally {
      this.server = originalServer;
      this.provider = originalProvider;
      this.header = originalHeader;
    }
  }

  _encodeLoginState(payload) {
    const json = JSON.stringify(payload);
    const encoded = Buffer.from(json, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

    return `meting-login.${encoded}`;
  }

  _decodeLoginState(value) {
    if (!value || typeof value !== 'string' || !value.startsWith('meting-login.')) {
      return null;
    }

    try {
      let encoded = value.slice('meting-login.'.length)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

      while (encoded.length % 4) {
        encoded += '=';
      }

      const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
      return decoded && decoded.server ? decoded : null;
    } catch (error) {
      return null;
    }
  }

  // ========== 静态方法 ==========

  // 获取支持的平台列表
  static getSupportedPlatforms() {
    return ProviderFactory.getSupportedPlatforms();
  }

  // 检查平台是否支持
  static isSupported(platform) {
    return ProviderFactory.isSupported(platform);
  }
}

export default Meting;
