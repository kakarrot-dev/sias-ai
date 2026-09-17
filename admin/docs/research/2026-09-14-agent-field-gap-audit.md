# Agent 与多 Agent 业务场景：配置字段对照审查

调研日期：2026-09-14。对象：`web-admin` 分支当前纯前端原型。

本次只交付研究与字段建议，不修改原型、不创建后端。文中的“已有”仅表示原型类型、表单或本地状态中存在，不表示生产执行已实现。

## 结论

有遗漏。基础角色描述和成员配置已经具备，优先缺口是：输入输出契约、资源授权、业务入口、节点数据映射、人工审批、异常恢复与评测。增加一段更长的总 Prompt 无法代替这些配置。

同时有三个需要修正的建模限制：目前把业务节点和 Agent 成员绑定为一对一，强制所有串行流程存在协调 Agent，并把全部成员的最大预算之和当作组预算的硬性最低值。这些是首版原型的简化，不是跨框架通用要求。

以下优先级是结合本项目的产品判断，不是各厂商要求：

- P0：下一轮可评审原型应补齐的业务闭环。
- P1：按实际场景启用，或收进高级配置。
- P2：暂不加入，避免把 SDK 参数全集变成后台表单。

## 样本与适用边界

选择了五组具有官方产品或工程文档的代表性系统，覆盖可视化搭建、专家团队、状态编排和企业治理。它们处在不同层次，不能当作五个完全等价、全部功能均已稳定的后台产品。

| 系统 | 本次参考内容 | 对本原型的价值与边界 |
|---|---|---|
| Dify | Agent、用户输入、知识检索、人工输入节点 | 适合参考表单和节点交互。Agent 文档区分 Classic 与 New；New 标有 beta，本次核心建议不依赖 beta 特性。[D1–D4] |
| CrewAI | Agent / Task / Crew 三层配置 | 最贴近专家组的职责、任务、依赖、输出检查与协作方式。文档本次跳转到 v1.15.21；字段表中个别弃用描述与章节存在不一致，不建议直接照搬全部 SDK 字段。[C1–C3] |
| LangChain / LangGraph | Agent 输出结构、多 Agent 模式、图状态、持久化 | 适合参考节点、状态、路由、检查点及恢复；是工程编排框架，很多能力需要代码或平台封装。[L1–L4] |
| Microsoft Agent Framework | Agent / Workflow 分离、人工请求与恢复 | 官方明确其承接 AutoGen / Semantic Kernel。不同语言和能力成熟度不同，Go 仍标为 public preview；本次参考概念和人工交互契约。[M1–M2] |
| Amazon Bedrock AgentCore；Agents Classic 对照 | AgentCore 工具调用边界策略；Classic Agent 和协作者 API | AgentCore 用于企业治理参考。Classic 官方已注明不向新客户开放，只把其字段作为已有产品设计案例，不推荐新选型沿用 Classic。[A1–A3] |

获取方式：agent-reach 的 Exa 搜索、Jina 网页阅读，并用官方页面交叉核对。微软一个旧编排地址返回 404，已改用可读取的 Overview / HITL 文档；未把失败页面作为证据。未使用社区文章代替字段定义。

## 当前原型事实

- [AgentConfig / GroupConfig](</Users/kakarrot/Dev/AI Employee OS-web-admin/src/admin/shared.ts:5>)：Agent 复用员工输入契约，增加用途、责任人、输出要求、步骤与超时。
- [员工基础字段](</Users/kakarrot/Dev/AI Employee OS-web-admin/src/shared/employee-contract.ts:21>)：名称、职责、说明、System Prompt、模型、能力版本、记忆范围。基础类型有可选头像，但当前后台未提供编辑入口，解析也未保留它；头像是低优先级展示项。
- [GroupStep](</Users/kakarrot/Dev/AI Employee OS-web-admin/src/admin/shared.ts:12>)：只有节点 ID、Agent ID、任务、输入描述、输出描述。输入输出均为字符串。
- [原型校验](</Users/kakarrot/Dev/AI Employee OS-web-admin/src/admin/prototype-store.ts:85>)：校验必填、成员用途、已发布状态、重复引用和组预算。没有模型评测或任务运行。
- [编辑界面](</Users/kakarrot/Dev/AI Employee OS-web-admin/src/admin/EntityEditor.tsx:1>)：已有草稿、预检、发布、回退、启停及本地审计；发布组保存成员版本快照。
- 权限页的成员授权、模型设置和运行记录是独立示例交互，尚未绑定到 Agent / 场景的资源策略。不能据此判定相关配置已齐全。

## 单 Agent 字段矩阵

新增键名均为本项目建议，不冒充框架原生字段。涉及模型服务、知识库、工具连接和治理策略时，优先引用统一资源，避免重复配置。

| 配置域 | 当前状态 | 建议字段与可点击交互 | 优先级 / 依据 |
|---|---|---|---|
| 基础身份 | 已有名称、职责、说明、责任人 | 保留；分类、标签、头像按目录规模补充 | 已有；展示增强 P2 |
| 行为说明 | 已有 System Prompt；目标、边界可写入正文 | 明确适用任务、禁止事项、缺失信息处理、输出要求。可提供结构化辅助编辑，但只有一个权威 Prompt / 行为配置来源 | 部分已有；P0 可读性，不必再造三份提示词。C1、D1 |
| 使用方式 | 固定 expert / coordinator / business | 将是否可独立使用与组内角色区分；是否拆成两个字段由具体复用场景决定，不必立即扩大实体模型 | P1；M1、C2 |
| 输入契约 | 缺少 | `inputSchema`：键、显示名、类型、必填、默认值、示例、枚举、长度/数量限制；文件类型与数量；输入不足时补问或结束 | P0；D2 |
| 输出契约 | 只有 `output` 自然语言说明 | `outputSchema`、`outputFormat`、`artifactTypes`；结构字段及必填、引用要求、示例输出和校验失败展示 | P0；C2、L1 |
| 模型绑定 | 只有固定枚举 `modelId` | `modelServiceId + modelId`，显示服务与模型能力兼容性；服务凭据由模型服务统一管理 | P0；D1。服务标识拆分为项目设计建议 |
| 模型高级参数 | 缺少 | `modelSettings`：响应长度、可选 temperature / topP、支持时的 reasoning 设置；按模型能力展示，提供继承默认值 | P1；A2。不要求所有模型都支持相同参数 |
| 知识绑定 | 缺少专门知识配置 | `knowledgeBindings`：知识源、版本/更新策略、查询变量、检索范围；高级项 Top K、阈值、重排、无结果处理 | P0 绑定 / P1 检索调优；D3 |
| 工具与连接 | 有 `capabilityVersionIds`，能力目录能展示关联 Tool / MCP | 补 `toolBindings` 的参数来源、固定参数、连接引用、执行身份、可调用操作、允许资源、写入前确认。能力详情中的权限需求不等于授权结果 | P0；D1、A1 |
| 使用可见范围 | 缺少对象级绑定 | `accessPolicyRef`：哪些部门/用户可发现、调用、管理；管理权与使用权分开，身份从统一目录引用 | P0；企业产品要求，治理边界参考 A1，不声称每个 SDK 内置完整 RBAC |
| 上下文与记忆 | 只有 task / employee / global 范围勾选 | `memoryPolicyRef`：读写权限、隔离主体、保留时长；`contextPolicy`：历史条数/Token 预算、压缩或截断策略 | P1；C1、D1、A2。工作区共享不应默认等于跨用户共享 |
| 调用和委派方式 | 缺少独立策略 | `executionMode`、`delegationPolicy`：允许调用的子 Agent、深度、次数；不开放无限委派 | P1；C1、L3 |
| 运行约束 | 已有步骤与超时 | 保留；补调用重试策略、上下文/输出预算。限流、并发和总成本优先引用工作区配额，可在对象上收紧 | P1；C1、C3；成本硬限额为本项目治理建议 |
| 结果检查与人工审批 | `output` 可描述标准，但没有策略引用 | `guardrailPolicyRef`、`approvalPolicyRef`；区分输出格式校验、内容质量评价、工具写入审批 | P0；C2、M2、A1 |
| 评测与发布 | 已有结构预检、版本和审计；缺少行为测试 | `evaluationSuiteRef`、`releaseGateRef`，覆盖正例、缺输入、越权请求、无知识结果、工具失败；预检和试运行各自显示结论 | P0；本项目发布要求，输出检查机制参考 C2 / L1 |
| 日志与数据保留 | 有浏览器配置操作记录 | `observabilityPolicyRef`、脱敏与保留策略；调用明细和执行耗时是运行结果，不由管理员填写 | P1；M1、A1 |

## 多 Agent 业务场景字段矩阵

“专家团成员”描述可用人选，“业务节点”描述一次具体工作，“业务场景”还应描述何时启动、收什么输入、交付什么结果。不能只增加一个团队总 Prompt 就认为覆盖完整。

| 配置域 | 当前状态 | 建议字段与交互 | 优先级 / 依据 |
|---|---|---|---|
| 场景定义 | 有名称、业务目标、责任人 | 补适用情形、不适用情形、业务类别；业务目标继续保留 | P0；项目产品要求 |
| 入口与触发 | 缺少 | `entryMode`：对话/表单/事件等；对话识别用正反例和必需信息，事件与定时按需启用；不能仅靠关键词识别 | P0 对话/表单，P1 外部触发；D2 |
| 场景输入 | 缺少 | `inputSchema`、`missingInputPolicy`，展示真实业务表单，例如主题、材料、时间范围 | P0；D2 |
| 场景交付 | 仅 `completion` 一段文字 | `outputSchema`、`deliverableSpec`、`resultMappings`、交付位置；完成判据、部分完成与失败输出分开 | P0；C2、L1 |
| 使用与数据权限 | 缺少 | 场景 `accessPolicyRef`、业务数据范围、连接身份；节点可继承或收紧，不允许通过组配置放大工具权限 | P0；A1，权限求交规则是本项目建议 |
| 编排模式 | 硬编码 `sequential` | 模式至少区分固定流程与协调者动态分派。并行会审、条件分支和循环等作为模式内选项逐步补齐 | P0 模式概念，P1 复杂模式；C3、L3、L4 |
| 协调者 | 必填，且用途必须 coordinator | 固定流程可以没有协调者；动态模式才配置调度说明、可选成员、委派限制、汇总与终止规则 | P0 规则修正；C3、M1 |
| 成员与节点 | 每个 Agent 最多一个业务节点 | 保留独立 `nodeId`；节点引用 `agentVersionRef`，同一 Agent 可在多节点复用。节点有自己的名称和责任，如“初稿”“修订稿”可用同一撰写员 | P0 规则修正；C2、L4 |
| 节点类型 | 只有 Agent 节点 | `nodeType`：Agent、人工处理、条件、工具/数据处理、输出；表单按节点类型显示相关配置 | P0 人工/输出，P1 其余；D4、M1 |
| 节点任务 | 已有 `task` | 保留场景内任务说明，与 Agent 的长期工作规则分离；允许引用已定义变量 | 已有但需变量能力；D1、C2 |
| 节点输入输出 | 已有两段自由文本，无数据绑定 | `inputMappings`、`outputSchema`：从起始输入或某节点某字段取值；展示变量选择器、类型、空值和缺失引用提示 | P0；D2、L1、L4 |
| 路径与分支 | 只有数组顺序 | `edges`、条件表达式、默认分支、节点结果依赖；并行需定义等待全部/部分结果和合并方式 | P0 条件语义，P1 并行；L4 |
| 上下文共享 | 只有上一节点 / 全部已完成结果 | `contextBindings` 指定每个节点可见的变量、资料与历史；避免“传全部历史”隐含泄露其他业务数据 | P0 明确共享对象，P1 调优；L4、A3 |
| 人工处理 | 只有失败时 human_review 枚举 | `humanTask`：触发位置、处理角色、展示材料、可编辑字段、同意/退回/拒绝动作、截止时间、超时分支和恢复节点 | P0；D4、M2 |
| 失败与恢复 | 只有停止 / 交责任人，无处理人或恢复路径 | `retryPolicy`、`onFailure`、`resumePolicy`；区别缺输入、审批等待、工具失败、结果未知；外部写入未知时先核查回执 | P0 基本分支；L2、M2。外部写入核查是项目工程要求 |
| 步骤/时间预算 | 已有组级步骤/超时；必须不小于成员最大值之和 | 区分组硬限额与节点最大值；提供预算分配方式。并行超时按关键路径理解，动态调度还需计入协调轮次与重试 | P0 语义修正 / P1 详细预算；项目推导，不作为厂商默认规则 |
| 结束与汇总 | 固定协调者汇总 + 自然语言完成条件 | `terminationPolicy`、`aggregationPolicy`；固定流程按终点和输出判定，动态模式才配置最大轮次、达标条件与无进展终止 | P0；C3、L3、L4 |
| 发布与依赖 | 已有 Agent 版本快照、历史与启停影响 | 保留；补完整依赖展示（模型服务、工具、知识、策略）。资源权限以运行时有效授权约束，版本快照不能恢复撤销的权限 | P0 展示 / P1 完整治理；项目要求，边界参考 A1 |
| 场景评测 | 只有结构检查 | 绑定业务案例、样例输入、预期路径、交付检查、等待与失败案例；模拟运行和真实执行明确区分 | P0 原型试运行；项目产品要求 |

## 三处应先调整的模型假设

### 节点不等于 Agent

当前 `GroupStep` 已有独立 ID，这是正确基础，但校验又禁止重复 `agentId`。以“撰写初稿 → 质量审阅 → 原撰写员修订”为例，需要两个不同节点引用同一个 Agent。应检查节点 ID 唯一、引用和依赖合法；不应普遍禁止 Agent 复用。初稿与修订的输入、上下文、输出和任务指令应分别保存。[C2][L4]

### 固定流程不必有协调 Agent

CrewAI 把顺序与层级过程区分，Microsoft 也把明确执行路径放在 Workflow 层。这说明人工定义好的“研究 → 撰写 → 审阅”可以由流程本身调度。只有动态选择专家、分派工作、协商和汇总需要模型介入时，才需要相应协调职责。[C3][M1]

本原型可以保留“专家团”这一业务称呼；底层先明确它采用固定流程还是动态协作，按模式显示字段，无须立即新增一级菜单。

### 组预算不是成员最大值的简单相加

假设两节点各最多 10 步，组上限 12 步：如果组上限用于控制实际累计消耗，这是一项有意设置的约束，并不天然非法。如果业务要求为每个节点预留完整预算，才需要满足分配总额。并行时限、协调者多轮调用、重试和人工等待也不能混用同一个相加公式。

建议原型明确“全局硬限额 / 预分配预算”及达到限制后的行为；人工等待时长与模型执行时长分开。这是根据现有代码推导的问题，不是从官方资料复制的结论。

## 推荐的后台组织方式

不把所有参数平铺在一张超长表单中，也不为同一事实维护 Prompt、字段、配置文件三份互相可编辑的副本。

| 页面 | 建议内容 |
|---|---|
| Agent 基本信息 | 名称、职责、适用范围、责任人、独立使用方式 |
| Agent 工作规则 | 权威指令、输入字段、输出结构、缺信息处理 |
| Agent 能力与资源 | 模型服务、知识、Skill/Tool、连接和数据范围 |
| Agent 运行与审批 | 上下文、重试与预算、动作审批；高级参数折叠 |
| Agent 测试与发布 | 样例测试、配置预检、版本差异、发布与回退 |
| 场景基本信息 | 场景目标、适用入口、用户范围、责任人 |
| 场景输入与交付 | 表单、变量定义、结果字段和交付物 |
| 场景协作编排 | 模式、成员、节点、任务、数据绑定、条件与汇总 |
| 场景人工与异常 | 人工处理、退回、超时、失败与恢复路径 |
| 场景测试与发布 | 预演样例、预期路径、完成标准和版本依赖 |

模型服务配置、知识源配置、企业身份、工具凭据、审批策略、配额均应在对应资源模块维护。Agent / 场景引用资源并配置局部约束。最终运行权限建议取企业授权、调用者身份、Agent 许可及节点约束的交集。

当前能力已用版本化引用，不需要为了“补全字段”把 Skills / Tool / MCP 三份全局定义复制进每个 Agent。

## 下一轮纯前端原型的最小补齐范围

1. 输入字段编辑器与输出结构编辑器；变量选择器可从场景输入和已存在节点结果选取。
2. 模型服务、知识与工具连接的引用面板；对象使用范围与写入确认策略。
3. 固定流程/动态协作的分型展示；协调者条件必填；同一 Agent 多节点复用。
4. 人工审批节点：处理角色、表单、同意/退回/拒绝、超时与恢复路径。
5. 场景结果与完成条件；失败、缺输入、等待人工等状态可预演。
6. 测试与发布页增加代表性样例；保留配置预检，把样例模拟明确标注为模拟。

这六项即可显著补足业务评审所需的信息。并行会审、投票、动态重规划、复杂记忆、模型自动切换和全套运维参数列入后续，按真实业务场景逐项启用。

## 建议的原型验收样例

| 样例 | 需要观察的结果 |
|---|---|
| 新建报告场景，主题必填、材料为文件列表 | 缺主题时提示；下游可选择结构化输入变量 |
| 研究节点返回事实数组，撰写节点引用它 | 类型相符可绑定；误把文件列表映射成布尔字段时提示 |
| 初稿、审阅、修订三节点 | 初稿与修订可引用同一 Agent，节点配置独立 |
| 固定三节点流程 | 可不配置协调者；切换动态模式后出现协调规则 |
| 文档定稿前人工审批 | 同意输出结果；退回到修订节点；超时走配置分支 |
| 成员调用无权限工具 | 模拟显示授权阻断；不因 Prompt 中允许调用而放行 |
| 工具提交后回执未知 | 显示待核查，不能直接演示再次提交成功 |
| 修改输出结构或成员版本 | 旧测试结果失效，发布前提示依赖变化 |

## 官方来源

以下内容均于 2026-09-14 访问。动态文档可能变化，实施时仍应锁定具体依赖版本。

- [C1 · CrewAI Agents](https://docs.crewai.com/v1.15.21/en/concepts/agents)：角色、目标、工具、委派、上下文与执行限制。
- [C2 · CrewAI Tasks](https://docs.crewai.com/v1.15.21/en/concepts/tasks)：任务归属、依赖 context、结构化输出、人工检查及结果校验。
- [C3 · CrewAI Crews](https://docs.crewai.com/v1.15.21/en/concepts/crews)：团队、任务与过程配置。
- [D1 · Dify Agent](https://docs.dify.ai/en/cloud/use-dify/nodes/agent)：Agent 策略、模型、工具参数与上下文。
- [D2 · Dify User Input](https://docs.dify.ai/en/cloud/use-dify/nodes/user-input)：文本、结构化字段、文件及变量引用。
- [D3 · Dify Knowledge Retrieval](https://docs.dify.ai/en/cloud/use-dify/nodes/knowledge-retrieval)：知识源、检索配置与输出引用。
- [D4 · Dify Human Input](https://docs.dify.ai/en/cloud/use-dify/nodes/human-input)：人工表单、动作分支、超时路径。
- [L1 · LangChain Structured Output](https://docs.langchain.com/oss/python/langchain/structured-output)：输出 schema 与校验。
- [L2 · LangGraph Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)：运行状态、检查点和恢复。
- [L3 · LangChain Multi-agent](https://docs.langchain.com/oss/python/langchain/multi-agent)：子 Agent、交接和路由模式。
- [L4 · LangGraph Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api)：节点、边、状态 schema 与合并。
- [M1 · Microsoft Agent Framework Overview](https://learn.microsoft.com/en-us/agent-framework/overview/)：Agent / Workflow 及 AutoGen、Semantic Kernel 承接关系。
- [M2 · Microsoft Agent Framework HITL](https://learn.microsoft.com/en-us/agent-framework/workflows/human-in-the-loop)：请求、等待、响应路由与工具审批。
- [A1 · AgentCore Policy](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy.html)：工具调用边界的外部策略执行。
- [A2 · Bedrock Agents Classic CreateAgent](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent_CreateAgent.html)：模型、会话、记忆、护栏与生命周期提示；仅作历史产品对照。
- [A3 · Bedrock AssociateAgentCollaborator](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent_AssociateAgentCollaborator.html)：协作者引用、协作说明与会话传递；仅作历史产品对照。
