## ADDED Requirements

### Requirement: 企业资料由 Console 管理
系统 SHALL 允许有管理权限的企业成员上传和维护 DOCX、PPTX 和文本型 PDF，并展示处理结果。

#### Scenario: 管理员上传企业文档
- **WHEN** 管理员在当前企业上传受支持的文档
- **THEN** 系统将原件与索引归属于该企业，并显示可检索或解析失败的结果

### Requirement: 两端聊天只检索可访问资料
Mac 和 Web 的会话 SHALL 支持显式选择企业资料。服务端 SHALL 按当前企业、成员权限和会话范围限制检索和来源访问。

#### Scenario: 使用资料问答
- **WHEN** 成员选择授权资料并提出可由资料回答的问题
- **THEN** 回答附可定位的资料出处

#### Scenario: 企业切换或成员权限被撤销
- **WHEN** 用户尝试检索或打开不再有权访问的资料
- **THEN** 系统拒绝返回受限内容
