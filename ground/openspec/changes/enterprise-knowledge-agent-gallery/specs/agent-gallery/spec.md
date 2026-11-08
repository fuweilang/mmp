## ADDED Requirements

### Requirement: Mac 和 Web 提供原生广场
系统 SHALL 在试点企业的 Mac 客户端和 Web 提供统一广场，支持浏览、搜索、查看简介和开场问题。

#### Scenario: 点击官方智能体开聊
- **WHEN** 有权成员选择已发布且已开通的智能体或开场问题
- **THEN** 系统在当前终端创建绑定发布版本的会话

### Requirement: 资料型智能体使用企业授权范围
资料型智能体 SHALL 只检索企业为其授权且当前成员可以读取的资料。

#### Scenario: 智能体未配置资料范围
- **WHEN** 有权成员使用未绑定资料的智能体
- **THEN** 系统不检索企业知识库
