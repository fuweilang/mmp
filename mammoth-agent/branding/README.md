# 猛犸品牌资源

- `mammoth-logo.png`：3000×3000 品牌原图，与 ground 的 `brand/mengma-mark.png` 内容相同；每个仓库独立保存，不依赖相邻目录。
- `desktop-logo-source.png`：2048×2048 桌面图标原图，从原 Kimi 临时附件永久保存。
- `reference/`：旧脚本不能重新生成的欢迎页、安装器品牌图片，保留作设计源参考。
- `generate-assets.py`：生成通用品牌资源到 `generated/`，不自动覆盖应用资源。
- `generate-desktop-icons.py`：生成桌面图标及预览到 `generated/desktop/`；加 `--apply` 才会替换 `apps/desktop/resources/` 的图标。

依赖 Python 3、Pillow，以及 macOS 自带的 iconutil。

```sh
python3 -m pip install Pillow
python3 branding/generate-assets.py
python3 branding/generate-desktop-icons.py
# 仅在确认更换桌面图标时执行：
python3 branding/generate-desktop-icons.py --apply
```

应用实际使用的图片仍在各自原位置，包括 `apps/desktop/resources/`。这些文件随代码提交，不要按尺寸去重删除。`generated/` 是可重新生成的预览文件，不提交。

原 mmp 顶层的 branding、logo-assets 已合并到本目录。此次整理没有替换任何应用正在使用的图片。
