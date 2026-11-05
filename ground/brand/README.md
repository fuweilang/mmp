# 品牌资产（单一来源）

`mengma-mark.png` 是唯一的品牌源图（蓝底 `#4A53A3` + 白圆标猛犸 M）。控制台/管理端用到的位图图标都由它导出，不要再手工放别的图。

```bash
./export.sh          # 生成到 brand/out/
```

导出的文件会随仓库提交；`apps/frontend/public` 里的 `logo-icon.png` / `favicon.png` / `favicon.ico` / `mengma-logo.png` 需与源图一致。

| 文件 | 尺寸 | 用在哪 |
| --- | --- | --- |
| `brand-mark.png` | 128 | 侧栏品牌标 |
| `logo-icon.png` | 512 | 站点 icon / 侧栏 |
| `apple-touch-icon.png` | 180 | iOS 添加到主屏 |
| `pwa-192.png` / `pwa-512.png` | 192 / 512 | PWA manifest 图标 |
| `favicon.png` | 48 | 浏览器标签页 |

`favicon.ico` 是多尺寸 ico，换标时用同一张源图重新导出。

本目录自包含，可随 ground 独立提交。与 mammoth-agent 的品牌原图各自保存，构建不依赖仓库外的 branding 或 logo-assets 目录。
