# 并行快发（墙上时钟最短路径）

> 规程 SSOT：`.opencode/skills/baota-release/SKILL.md`（本页只做半页索引）。

## 为什么快

慢是因为：人手填 **`all`**、中台与 Actions **串行**、大包全下全传、preflight 漏挂载。
对策：**拆单 + 默认三平台 + T0 并行 + 分层优先**。

## 要点

| 点 | 做法 |
|----|------|
| 拆单 | `fast-release` **默认 --no-client**；要客户端才 `--dispatch` |
| 热修 CI | `desktop-hotfix.yml`（矩阵写死三平台，默认不挂 Release） |
| 分层 | `mammoth-dashboard-release` / `mammoth-release --dashboard|--code` 优先于大包 |
| T1 | `publish-desktop-baota.sh`（默认 dry-run；覆盖前 bak） |
| 门禁 | dispatch 前 CI/本地门禁绿 |
| 密保 | 禁 rsync 源码到宝塔；本地 linux/amd64 镜像 save/load |
| smoke | `release-baota-mid` 末尾必跑；latest 用 `assert-latest-json.sh` |

## 并行图

```
T0  门禁绿
T0  ├─ A 中台：preflight → 本地 build+save/load → web dist → up → smoke（禁宝塔源码/build）
T0  └─ B 客户端（可选）：desktop-hotfix / octop-desktop
T1  B 完：publish-desktop-baota.sh
```

墙上时间约 **max(中台, CI+上传)**。

## 照抄

```bash
cd ~/Documents/code/mmPlatform/ground/infra/baota
./fast-release.sh --mid octop              # 默认只要中台
./fast-release.sh --mid octop --dispatch   # 热修 desktop-hotfix
# 另窗中台三命令；CI 完：
./publish-desktop-baota.sh --run-id <id> --version <ver>         # dry-run
./publish-desktop-baota.sh --run-id <id> --version <ver> --apply
```
