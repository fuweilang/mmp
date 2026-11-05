# deploy-octop-home

## Requirement: api 容器必须具备 Octop 数据目录

### Scenario: 合格部署可读模型目录

- **Given** 生产（或类生产）部署的 `mammoth-api` 容器
- **When** 调用依赖 Octop 模型目录 / pricing-config 的管理接口
- **Then** 容器环境含 `OCTOP_HOME`（约定 `/data/.octop`）
- **And** 只读挂载宿主机 `./data/octop` → `/data/.octop`
- **And** 能解析到超管配置的模型厂商目录（非空或明确空态，而非因路径缺失的假失败）

### Scenario: 无挂载视为部署不合格

- **Given** api 容器缺少 `OCTOP_HOME` 或缺少 `data/octop` 挂载
- **When** 发版 preflight / 部署验收执行
- **Then** 判定为不合格部署（非 0 / 阻断上线），不得当作「业务空目录」默默放过
