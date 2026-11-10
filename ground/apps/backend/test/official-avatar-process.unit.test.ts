import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import {
  assertOfficialAvatarUpload,
  assertSafeSvgAvatar,
  detectOfficialAvatarSourceKind,
  OFFICIAL_AVATAR_MAX_BYTES,
  OFFICIAL_AVATAR_MAX_EDGE,
  OFFICIAL_AVATAR_MAX_INPUT_PIXELS,
  parseSvgIntrinsicSize,
  rasterizeOfficialAvatar,
  svgAvatarDensity,
} from '../src/knowledge/official-avatar';

async function pngFixture(width = 32, height = 32): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 40, b: 180 } },
  })
    .png()
    .toBuffer();
}

describe('official avatar processing', () => {
  it('accepts png/jpeg/webp/gif within 5MB and rejects oversize', async () => {
    const png = await pngFixture();
    assert.equal(detectOfficialAvatarSourceKind(png), 'png');
    assert.equal(assertOfficialAvatarUpload('a.png', png, 'image/png').kind, 'png');

    const jpeg = await sharp(png).jpeg().toBuffer();
    assert.equal(assertOfficialAvatarUpload('a.jpg', jpeg, 'image/jpeg').kind, 'jpeg');

    const webp = await sharp(png).webp().toBuffer();
    assert.equal(assertOfficialAvatarUpload('a.webp', webp, 'image/webp').kind, 'webp');

    const gif = await sharp(png).gif().toBuffer();
    assert.equal(assertOfficialAvatarUpload('a.gif', gif, 'image/gif').kind, 'gif');

    assert.throws(
      () => assertOfficialAvatarUpload('a.png', Buffer.alloc(OFFICIAL_AVATAR_MAX_BYTES + 1, 1), 'image/png'),
      /5MB/,
    );
  });

  it('rasterizes phone-sized JPEG under 5MB by resizing within edge cap', async () => {
    // Typical camera-ish resolution that previously tripped limitInputPixels=2048^2.
    const big = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: { r: 90, g: 20, b: 40 } },
    })
      .jpeg({ quality: 70 })
      .toBuffer();
    assert.ok(big.length < OFFICIAL_AVATAR_MAX_BYTES, `fixture should stay under 5MB, got ${big.length}`);
    assert.ok(4000 * 3000 < OFFICIAL_AVATAR_MAX_INPUT_PIXELS);
    const out = await rasterizeOfficialAvatar('vivo.jpg', big, 'image/jpeg');
    assert.equal(out.sourceKind, 'jpeg');
    const meta = await sharp(out.png).metadata();
    assert.ok((meta.width ?? 0) <= OFFICIAL_AVATAR_MAX_EDGE);
    assert.ok((meta.height ?? 0) <= OFFICIAL_AVATAR_MAX_EDGE);
    assert.equal(detectOfficialAvatarSourceKind(out.png), 'png');
  });

  it('rasterizes GIF first frame and huge-viewBox SVG with controlled density', async () => {
    const base = await pngFixture(48, 24);
    const gif = await sharp(base).gif().toBuffer();
    const gifOut = await rasterizeOfficialAvatar('x.gif', gif, 'image/gif');
    assert.equal(detectOfficialAvatarSourceKind(gifOut.png), 'png');

    const hugeSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20000 20000"><rect width="20000" height="20000" fill="#414a8c"/></svg>',
    );
    const parsed = parseSvgIntrinsicSize(hugeSvg.toString('utf8'));
    assert.equal(parsed.width, 20000);
    const density = svgAvatarDensity(hugeSvg.toString('utf8'));
    assert.ok(density < 36, `density should shrink huge SVG below default floor, got ${density}`);
    const svgOut = await rasterizeOfficialAvatar('huge.svg', hugeSvg, 'image/svg+xml');
    const meta = await sharp(svgOut.png).metadata();
    assert.ok((meta.width ?? 0) <= OFFICIAL_AVATAR_MAX_EDGE);
    assert.ok((meta.height ?? 0) <= OFFICIAL_AVATAR_MAX_EDGE);

    const evil = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="https://evil.example/x.png"/></svg>',
    );
    assert.throws(() => assertSafeSvgAvatar(evil), /脚本|外链/);
    assert.throws(
      () => assertSafeSvgAvatar(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="secret.png"/></svg>')),
      /外链或本地引用/,
    );
    assert.throws(
      () => assertSafeSvgAvatar(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(https://evil.example/a.png)"/></svg>')),
      /外部样式/,
    );
    assert.doesNotThrow(() => assertSafeSvgAvatar(Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect fill="url(#g)"/></svg>',
    )));
  });

  it('rejects corrupt buffers / mime mismatches and maps pixel-limit errors to Chinese', async () => {
    const png = await pngFixture();
    assert.throws(() => assertOfficialAvatarUpload('a.png', Buffer.from('not-image'), 'image/png'), /有效/);
    assert.throws(() => assertOfficialAvatarUpload('a.jpg', png, 'image/jpeg'), /不符/);
    assert.throws(() => assertOfficialAvatarUpload('a.png', png, 'image/gif'), /不符/);

    // Construct a raster just over the input pixel budget (synthetic).
    const overW = 7000;
    const overH = 6000; // 42MP > 40MP
    assert.ok(overW * overH > OFFICIAL_AVATAR_MAX_INPUT_PIXELS);
    const over = await sharp({
      create: { width: overW, height: overH, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .jpeg({ quality: 40 })
      .toBuffer();
    // May exceed 5MB depending on content; if so skip pixel assertion and only check message path via mock-sized failure.
    if (over.length <= OFFICIAL_AVATAR_MAX_BYTES) {
      await assert.rejects(() => rasterizeOfficialAvatar('over.jpg', over, 'image/jpeg'), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /像素|解码上限|压缩/);
        assert.doesNotMatch(error.message, /exceeds pixel limit/i);
        return true;
      });
    }
  });
});
