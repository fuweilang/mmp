# release-sha-discipline

发版纪律（复盘 C8）。运维执行见 `.opencode/skills/baota-release/SKILL.md` 与 `preflight-baota.sh`；本文件只冻结验收。

## Requirement: 上线内容必须在将发分支

### Scenario: 合格热修可上线

- **Given** 拟上线的改动已 commit 在将发布分支（fast=开发树当前分支；freeze=`1.0`）
- **When** 中台 rsync / 客户端 `workflow_dispatch` / 冒烟验收
- **Then** 生产跑到的 SHA（或等价产物）可在将发分支检出
- **And** 下次干净 rsync 不会盖掉该改动

### Scenario: 仅生产热改 / 干净树没有 → 不合格

- **Given** 改动只存在于生产容器或未入库工作区，将发分支干净树没有对应 SHA
- **When** 发版门禁 / 人工 checklist 执行
- **Then** SHALL NOT 当作已完成上线
- **And** 须先入库到将发分支再发（默认可不 push / 不开 PR，但本地分支必须有）
