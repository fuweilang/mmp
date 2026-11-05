# 宝塔发版检查清单（www.mmai.vip）

> 入口：[`baota-release` Skill](../../../.opencode/skills/baota-release/SKILL.md)
> 本清单用于发版时逐项勾选，不需要理解全文。

## A. 发版前

- [ ] 确认只有**一个会话/一个主操**在发版
- [ ] 优先使用一键脚本：`./ground/infra/production/release.sh --dry-run` 看过计划
- [ ] `./ground/infra/production/doctor.sh` 无 FAIL（WARN 可继续）
- [ ] 拿到服务器锁 `/www/mmp-prod/.release.lock`（已存在则停）
- [ ] `pnpm --dir ground run version:check` 通过
- [ ] `release/` 目录名、镜像 tag、state 使用同一个 `RELEASE_ID`
- [ ] 服务器磁盘 ≥ 30G
- [ ] 明确本轮范围：只发中台，不发客户端 / 不发 Octop
- [ ] 确认不碰 `/www/mammoth` 和宝塔其他站点

## B. 构建

- [ ] 前端 dist 构建完成，`middle-web.tar.gz` 存在
- [ ] 确认本轮所有下载都走国内源（Electron / npm / apt / Docker）
- [ ] 所有下载命令带超时，且已校验实际字节/镜像（非只看 HTTP 200）
- [ ] api 镜像构建完成，`require.resolve('express')` 通过
- [ ] web 镜像在**服务器**构建完成（不是本机模拟 x86）
- [ ] 源码同步包含 `scripts/release/`、`packages/*/lib`
- [ ] `.dockerignore` 未排除 `**/lib`

## C. 部署

- [ ] `production.env` 已备份，未被覆盖
- [ ] `middle-web` 已备份后替换
- [ ] api 镜像已 `docker load`
- [ ] `.env` 中 api/web 镜像 tag 已切换
- [ ] `docker compose up -d` 成功，三容器 Up
- [ ] api 日志：migrate 完成 + `Nest application successfully started`
- [ ] api 日志无 `Cannot find module`
- [ ] web 日志无 `No usable native binding` / `failed to map segment`

## D. nginx

- [ ] 原 `www.mmai.vip.conf` 和 `mammoth.conf` 已备份
- [ ] 配置含 `/console/api/` 和 `/admin/api/` 两个 location
- [ ] `nginx -t` 通过
- [ ] 只执行 `nginx -s reload`，未 restart

## E. 验收

- [ ] `/` → 303 → `/login`，页面含“猛犸”
- [ ] `/agent` → 410
- [ ] `/login` `/console/` `/admin/` → 200
- [ ] `/api/health` → 200
- [ ] `/api/version` → 200，版本与 `version.json` 一致
- [ ] `/admin/api/users`（带 cookie）→ 200 JSON
- [ ] `/console/api/version` → 200 JSON
- [ ] 超管真实登录成功
- [ ] `docker compose ps` RestartCount=0
- [ ] `smoke.sh` 通过
- [ ] 下载页无包时提示正常，不 500

## F. 收尾

- [ ] 释放 `/www/mmp-prod/.release.lock`
- [ ] 清理 `/tmp/mmp-web-build*`、`/tmp/mmp-release`
- [ ] 列出历史镜像，确认保留当前 + 上一版
- [ ] 更新 `release/<id>/state.json` 为 done
- [ ] 汇报：版本、镜像 tag、验收结果、回滚方式、遗留项

## G. 回滚（任一项失败时）

优先用脚本：

```bash
./ground/infra/production/rollback.sh --list
./ground/infra/production/rollback.sh --release-id <ID> --yes
# 静态包也要回滚时加 --restore-web
```

手工兜底：

```bash
# nginx
ssh root@124.223.179.250 'cp -a /www/server/panel/vhost/nginx/extension/www.mmai.vip/mammoth.conf.bak-<ts> \
  /www/server/panel/vhost/nginx/extension/www.mmai.vip/mammoth.conf && nginx -t && nginx -s reload'

# 镜像
ssh root@124.223.179.250 'cd /www/mmp-prod && cp .env.bak-<ts> .env && docker compose up -d'

# 静态包
ssh root@124.223.179.250 'cd /www/mmp-prod && rm -rf middle-web && cp -a middle-web.bak-<ts> middle-web'
```

数据库迁移不自动回滚；恢复数据前必须让用户确认。