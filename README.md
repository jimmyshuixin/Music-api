<p align="center">
<img src="https://user-images.githubusercontent.com/2666735/30165599-36623bea-93a6-11e7-8956-1ddf99ce0e6f.png" alt="Meting">
</p>

# Music-api

> A Node.js music API framework upgraded from Meting, with unified music APIs and QR login support.

## Introduction

Music-api is a Node.js music API framework upgraded from [Meting](https://github.com/metowolf/Meting), designed to accelerate music-related development with unified APIs for multiple music platforms and QR login support.

### Features

- **🎵 Multi-Platform Support** - Supports NetEase Cloud Music, Tencent Music, KuGou, Baidu Music, and Kuwo
- **🚀 Lightweight & Fast** - Zero external dependencies, built with Node.js native modules only
- **📱 Modern Async/Await** - Promise-based APIs with full async/await support
- **🔄 Unified Interface** - Standardized data format across all music platforms
- **🔐 Built-in Encryption** - Platform-specific encryption and signing built-in
- **⚡ Chain-able API** - Fluent interface design for elegant code

## Requirements

- Node.js >= 12.0.0
- No external dependencies required

## Installation

Install dependencies:

```bash
npm install
```

Build from source:

```bash
npm run build
```

## Quick Start

### Basic Usage

```javascript
import Meting from 'music-api';

// Initialize with a music platform
const meting = new Meting('netease'); // 'netease', 'tencent', 'kugou', 'baidu', 'kuwo'

// Enable data formatting for consistent output
meting.format(true);

// Search for songs
try {
  const searchResult = await meting.search('Hello Adele', { page: 1, limit: 10 });
  const songs = JSON.parse(searchResult);
  console.log(songs);
} catch (error) {
  console.error('Search failed:', error);
}
```

### Comprehensive Example

```javascript
import Meting from 'music-api';

async function musicExample() {
  const meting = new Meting('netease');
  meting.format(true);
  
  try {
    // 1. Search for songs
    const searchResult = await meting.search('Hello Adele');
    const songs = JSON.parse(searchResult);
    
    if (songs.length > 0) {
      const song = songs[0];
      console.log(`Found: ${song.name} by ${song.artist.join(', ')}`);
      
      // 2. Get song details
      const details = await meting.song(song.id);
      console.log('Song details:', JSON.parse(details));
      
      // 3. Get streaming URL
      const urlInfo = await meting.url(song.url_id, 320); // 320kbps
      console.log('Streaming URL:', JSON.parse(urlInfo));
      
      // 4. Get lyrics
      const lyrics = await meting.lyric(song.lyric_id);
      console.log('Lyrics:', JSON.parse(lyrics));
      
      // 5. Get album cover
      const cover = await meting.pic(song.pic_id, 300); // 300x300
      console.log('Album cover:', JSON.parse(cover));
    }
    
    // Switch platform and search again
    meting.site('tencent');
    const tencentResult = await meting.search('周杰伦');
    console.log('Tencent results:', JSON.parse(tencentResult));
    
  } catch (error) {
    console.error('Error:', error);
  }
}

musicExample();
```

## API Documentation

### Constructor

```javascript
const meting = new Meting(server);
```

- `server` (string): Music platform ('netease', 'tencent', 'kugou', 'baidu', 'kuwo')

### Core Methods

#### Platform Management

```javascript
meting.site(server)    // Switch music platform
meting.cookie(cookie)  // Set platform-specific cookies
meting.format(enable)  // Enable/disable data formatting
```

#### QR Login

QR login is currently implemented for NetEase Cloud Music (`netease`), QQ Music (`tencent`), KuGou Music (`kugou`), and Kuwo Music (`kuwo`):

```javascript
const meting = new Meting('tencent');

// One-step helper for frontend QR rendering.
const qr = JSON.parse(await meting.loginQr());
// NetEase, KuGou, and Kuwo return qr.qrurl; QQ Music returns qr.qrimg.
// All platforms return qr.state for automatic platform detection.

// Frontend renders qr.qrurl or qr.qrimg, then polls with state:
const status = JSON.parse(await meting.loginQrCheck(qr.state));

if (status.code === 803) {
  // Login succeeded. Store this on your server side if possible.
  console.log(status.cookie);
}
```

The lower-level methods are also available:

```javascript
await meting.loginQrKey();        // Get a QR login key
await meting.loginQrCreate(key);  // Convert key to a QR URL or image
await meting.loginQrCheck(key);   // Poll status and return cookie on success
```

Unified QR status codes commonly used by the frontend flow:

| Code | Meaning |
|------|---------|
| `800` | QR code expired |
| `801` | Waiting for scan |
| `802` | Scanned, waiting for confirmation |
| `803` | Login succeeded; response includes `cookie` |

The `state` field is an opaque token that includes the target platform and QR key, so the check endpoint can identify the login platform automatically.

Kuwo's web login uses WeChat OAuth QR login, so render `qr.qrurl` and scan it with WeChat.

Run the bundled zero-dependency demo server:

```bash
npm run qr-login-server
```

Frontend endpoints:

```text
GET http://localhost:3000/login/qr?server=netease
GET http://localhost:3000/login/qr?server=tencent
GET http://localhost:3000/login/qr?server=kugou
GET http://localhost:3000/login/qr?server=kuwo
GET http://localhost:3000/login/qr/check?state=<state>
```

#### Search & Discovery

```javascript
// Search for songs, albums, or artists
await meting.search(keyword, {
  type: 1,
  page: 1,
  limit: 30,
});
```

#### Search Options

- `type` (number, optional) - Search category for providers that support it. NetEase uses `1` for songs (default), `10` for albums, `100` for artists, etc.
- `page` (number, optional) - Page number starting from 1. Defaults to `1`.
- `limit` (number, optional) - Number of results per page. Defaults to `30`.

#### Music Information

```javascript
await meting.song(id)           // Get song details
await meting.album(id)          // Get album information
await meting.artist(id, limit)  // Get artist's songs
await meting.playlist(id)       // Get playlist content
await meting.userPlaylists(uid) // Get Tencent user playlists; omit uid to use login cookie uin
```

#### Media Resources

```javascript
await meting.url(id, bitrate)   // Get streaming URL
await meting.lyric(id)          // Get song lyrics
await meting.pic(id, size)      // Get album artwork
```

### Supported Platforms

| Platform | Code | Search | Song | Album | Artist | Playlist | URL | Lyric | Picture |
|----------|------|--------|------|-------|--------|----------|-----|-------|---------|
| NetEase Cloud Music | `netease` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tencent Music | `tencent` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| KuGou Music | `kugou` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Baidu Music | `baidu` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Kuwo Music | `kuwo` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Data Format

When `format(true)` is enabled, all platforms return standardized JSON:

```javascript
{
  "id": "35847388",
  "name": "Hello",
  "artist": ["Adele"],
  "album": "Hello",
  "pic_id": "1407374890649284",
  "url_id": "35847388", 
  "lyric_id": "35847388",
  "source": "netease"
}
```

## Development

### Running Examples

```bash
# Install dependencies
npm install

# Run the example
npm start
# or
npm run example
```

### Running Tests

```bash
# Run tests for all platforms
npm test
```

### Build from Source

```bash
# Build the library
npm run build

# Development mode with file watching
npm run dev
```

## Error Handling

The library uses Promise-based error handling. Always wrap API calls in try-catch blocks:

```javascript
try {
  const result = await meting.search('keyword');
  // Handle success
} catch (error) {
  console.error('API Error:', error);
  
  // Try fallback platform
  meting.site('tencent');
  const fallback = await meting.search('keyword');
}
```

## Rate Limiting

To avoid being rate-limited by music platforms:

- Add delays between consecutive requests
- Don't make too many requests in a short time
- Consider implementing request queuing for heavy usage

```javascript
// Example: Add delay between requests
await new Promise(resolve => setTimeout(resolve, 2000));
```

## Important Notes

- **Copyright Compliance**: Respect music platform terms of service and copyright laws
- **Platform Changes**: Music platform APIs may change without notice
- **Availability**: Some features may be restricted based on geographical location
- **Rate Limits**: Each platform has different rate limiting policies

## Related Projects

- [Original PHP Meting](https://github.com/metowolf/Meting) - The original PHP version
- [MoePlayer/Hermit-X](https://github.com/MoePlayer/Hermit-X) - WordPress music player
- [mengkunsoft/MKOnlineMusicPlayer](https://github.com/mengkunsoft/MKOnlineMusicPlayer) - Online music player
- [injahow/meting-api](https://github.com/injahow/meting-api) - RESTful API wrapper
- [yiyungent/Meting4Net](https://github.com/yiyungent/Meting4Net) - .NET version

## Acknowledgements

Music-api is built on top of the excellent [Meting](https://github.com/metowolf/Meting) project by [metowolf](https://github.com/metowolf). Thanks to the original project for the unified music API design and platform integration foundation.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Original Project

**Music-api** is released under the [MIT](./LICENSE) License.

Original Meting links: Blog [@meto](https://i-meto.com), GitHub [@metowolf](https://github.com/metowolf), Twitter [@metowolf](https://twitter.com/metowolf)

---

<p align="center">
Made with ❤️ for the music community
</p>
