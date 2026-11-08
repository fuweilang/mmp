## ADDED Requirements

### Requirement: Super administrators create equivalent skills by ZIP or form
系统 SHALL 提供 ZIP 与表单两条超管技能创建入口。ZIP SHALL 支持包根最小 manifest、必需 `SKILL.md` 和可选引用资源；表单 SHALL 生成同一规范包。Admin SHALL NOT 要求配置工具注册或运行沙箱声明，且 SHALL 在启用前验证 key 唯一、路径安全、大小与文件类型限制。

#### Scenario: Invalid ZIP cannot become enabled
- **GIVEN** 一个缺少 `SKILL.md` 或含越界路径的 ZIP
- **WHEN** 超管提交 ZIP 或尝试启用
- **THEN** 返回明确错误且不产生可公开读取的启用包

### Requirement: Stop controls public availability without rewriting history
超管或授权管理员 SHALL 能启停专家与技能、为专家关联技能和知识引用。停用 SHALL 从公共新会话入口移除内容并阻止未开始的新会话，已存在会话 SHALL 保持原冻结内容；删除未被引用草稿需确认，被引用内容只可停用。

#### Scenario: An associated skill is edited and unpublished
- **GIVEN** 一个已被启用专家关联的技能与既有会话
- **WHEN** 管理员修改或停用该技能
- **THEN** 新专家 session 使用新关联集，旧 session 保留 revision 与来源记录，不出现跨企业知识访问
