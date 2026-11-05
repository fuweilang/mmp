# design

## 两个入口

| 入口 | 登录页 | 会话 |
|---|---|---|
| 浏览器打开 `https://www.mmai.vip` | 中台 Vue `/login`，不改 | `www.mmai.vip` 的 Cookie |
| 正式客户端 | Octop 本机薄表单（密码登录 / 注册） | 本机 Octop token。不跳官网 `/login` |

`127.0.0.1` 和 `www.mmai.vip` 不能共用 Cookie。不要为了「长得一样」复制 Vue 页面。

## 客户端登录与注册

1. 正式包启动本机 Octop，WebView 只开本机地址。不把 `https://www.mmai.vip/agent/chat` 当启动地址。
2. 未登录时显示本机薄表单，两个页签：**密码登录 / 注册**，默认选中密码登录，选中项蓝底 `#2563eb`。字段和文案对齐中台 `apps/frontend/src/views/Login.vue`：登录要手机号、密码；注册加姓名、企业/主体名称，密码标为「设置密码」；两页都有协议勾选。没有忘记密码、验证码。提交失败停在这一页，并写出原因。
3. 登录提交调用现有 `POST /console/api/auth/login`，注册提交调用现有 `POST /console/api/auth/register`（生产是 `https://www.mmai.vip/console/api/auth/*`）。请求体沿用中台字段 `phone` / `password` / `name` / `enterpriseName`。账号校验与落库仍只在中台。
4. 两条链路成功都回到同一步：本机 Octop 拿中台 Cookie 走完现有 OIDC，建立本机会话再进对话。禁止 `window.location` 到中台 `/login` 或 IdP 授权页。
5. 中台响应若无法换成 Octop 会话，停手问用户。不在本 change 里加登录/注册字段，不写 Octop 用户表。

产品账号与密码只在中台；Octop 侧的 `users` 仍是登录时生成的影子用户，登录后在中台和 Octop 的用户管理里都能看到，不构成第二套产品账号。

本地开发仍走网关 `http://127.0.0.1:5201`。生产客户端的中台地址是 `https://www.mmai.vip`。不要把生产地址写死进网页开发。

## 企业控制台

不新做。沿用 `openEnterpriseConsoleFromClient`：

1. 用本机 token 换一次性票（`browser-sso`，约 60 秒，用过即废）。
2. 系统浏览器打开 `https://www.mmai.vip/login?sso=票&next=/console/`。
3. 中台验票后种 Cookie。Chrome 不再要密码。
4. 票换失败时打开官网 `/login`，不要在客户端 WebView 里打开。

## 安装与蓝圈

- `#octop-boot` 只在脚本还没挂上时出现。超时或脚本失败必须换成错误文案，不能一直转。
- 同版本但包内容变了，用已有 `.bundle-sha256` 替换本机运行时。不要求用户删 `~/.octop`。
- 本 change 不改 `OCTOP_HOME`。

## 数据

无 Prisma 迁移。无新表。不改 Octop `users` 的产品含义：仍是影子用户。
