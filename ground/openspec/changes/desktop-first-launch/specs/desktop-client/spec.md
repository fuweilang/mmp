# desktop-client

## Requirement: 官网包包含已提交的启动修复

发给客户的安装包 SHALL 包含提交 `60859f3` 与 `499b428` 的运行时行为，或经用户确认的同等后续提交。

#### Scenario: 包是旧的

- GIVEN 官网下载地址上的包构建早于这两笔提交
- WHEN 核对包内容
- THEN 不得把该包继续当作已修复版本发给客户

## Requirement: 客户端启动不离开本机

正式客户端 SHALL 打开本机 Octop 页面。SHALL NOT 把 `https://www.mmai.vip/` 或 `https://www.mmai.vip/agent/chat` 当作客户端启动地址。

#### Scenario: 新客户第一次打开

- GIVEN 一台没有开发服务的电脑，刚装官网包
- WHEN 打开客户端
- THEN WebView 地址是本机 Octop
- AND 不出现无限 `#octop-boot`

#### Scenario: 脚本没挂上

- GIVEN 本机页面已画出蓝圈
- WHEN 脚本加载失败或超时
- THEN 蓝圈消失，并显示可阅读的错误
- AND 不得停在无文字的白屏

## Requirement: 客户端登录与注册停在本机

未登录的客户端 SHALL 在本机显示手机号和密码表单，并提供「密码登录」与「注册」两个页签，默认选中「密码登录」。

两个页签的选中项 SHALL 是蓝底 `#2563eb`、白字；未选中项 SHALL 是中性灰底深灰字。SHALL NOT 使用 Octop 原橙红色。

「注册」页签 SHALL 增加姓名、企业/主体名称字段并把密码标为「设置密码」。

该页 SHALL NOT 提供忘记密码和验证码。

提交登录 SHALL 调用中台现有登录接口；提交注册 SHALL 调用中台现有注册接口。两者成功 SHALL 在本机建立 Octop 会话并进入对话。

客户端 SHALL NOT 把 WebView 导航到中台 `/login` 或 OIDC 授权页。

SHALL NOT 在 Octop 保存产品密码。产品账号与密码只在中台；Octop 的 `users` SHALL 只是登录时生成的影子用户。

#### Scenario: 密码正确

- GIVEN 中台有该手机号
- WHEN 在客户端提交正确密码
- THEN 仍在本机地址
- AND 进入对话
- AND 不打开 `https://www.mmai.vip/login`

#### Scenario: 密码错误

- GIVEN 客户端停在登录表单
- WHEN 提交错误密码
- THEN 停在该表单并显示失败原因
- AND 不白屏，不跳官网

#### Scenario: 注册成功

- GIVEN 客户端停在登录表单
- WHEN 切到「注册」并提交未注册的手机号、姓名、企业/主体名称和密码
- THEN 中台创建产品账号
- AND 客户端仍在本机地址
- AND 进入对话
- AND 中台用户管理里能看到该用户

#### Scenario: 手机号已注册

- GIVEN 客户端停在「注册」页签
- WHEN 提交一个已在中台注册的手机号
- THEN 停在该表单并提示手机号已注册
- AND 不跳官网

#### Scenario: 注册或登录链路失败

- GIVEN 客户端停在登录表单
- WHEN 中台注册成功但本机未建立 Octop 会话，或接口报错
- THEN 停在本机并显示可读的失败原因
- AND 不白屏，不跳官网

## Requirement: 中台账号是唯一账号

产品账号 SHALL 只在中台维护，入口是 `/admin/users`。客户端注册与浏览器注册 SHALL 走同一套中台现有接口，不新增账号接口或字段。

客户端注册的用户 SHALL 在中台和 Octop 两侧的用户管理里都能看到：中台是产品账号，Octop 是登录后生成的影子用户。

#### Scenario: 两边都能看到

- GIVEN 用户在客户端完成注册
- WHEN 打开中台 `/admin/users`
- THEN 列表里有该手机号
- AND 该用户登录客户端后，Octop 侧也生成了对应影子用户

## Requirement: 浏览器登录不变

浏览器访问官网时，登录页 SHALL 仍是中台 `/login`。本 change SHALL NOT 要求浏览器改用 Octop 登录页。

#### Scenario: 浏览器打开官网

- GIVEN 用户在 Chrome 打开 `https://www.mmai.vip/login`
- WHEN 登录成功
- THEN 行为与本 change 之前的中台登录一致

## Requirement: 企业控制台用票打开 Chrome

已登录客户端点击企业控制台 SHALL 用系统浏览器打开带一次性 `sso` 票的中台地址。中台验票成功后 SHALL 种下 `www.mmai.vip` 的 Cookie，Chrome SHALL NOT 再要求输入密码。

票 SHALL 短时有效且不可重复使用。客户端 SHALL NOT 把 Chrome 的 Cookie 写回 WebView。

#### Scenario: 从客户端进控制台

- GIVEN 客户端已登录
- WHEN 点击企业控制台
- THEN 系统浏览器打开中台
- AND 进入 `/console/` 或平台管理员的 `/admin`
- AND 不出现密码框

#### Scenario: 票失效

- GIVEN 票已用过或已过期
- WHEN Chrome 打开该链接
- THEN 中台拒绝该票
- AND 用户可在浏览器登录页重新登录

## Requirement: 安装替换过期运行时

安装或启动新包时，若本机运行时版本相同但包内容不同，SHALL 自动替换运行时。SHALL NOT 要求用户删除 `~/.octop` 或卸载旧客户端。

本 change SHALL NOT 修改 `OCTOP_HOME` 路径。

#### Scenario: 有旧运行时

- GIVEN 本机已有同版本号的旧运行时
- WHEN 打开含新运行时的客户端
- THEN 自动换上新运行时
- AND 用户无删除文件步骤

#### Scenario: 全新电脑

- GIVEN 没有旧运行时
- WHEN 第一次打开
- THEN 使用包内运行时
- AND 能到达本机登录表单或对话
