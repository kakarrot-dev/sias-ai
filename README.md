# 西亚斯师生服务平台 · Web 原型

高校师生前台与管理后台的可运行交互原型。基于 2026-09-17 本地最新工作区代码导入，包含当时尚未提交的原型修改。

## 目录

| 目录 | 内容 | 开发地址 |
| --- | --- | --- |
| `frontend/` | 助理聊天、专家市场、创建专家、个人中心与归档会话 | http://127.0.0.1:5173/ |
| `admin/` | 总览、智能体中心、能力中心、运行中心、用户中心与系统设置 | http://127.0.0.1:5180/ |

前台入口保留在 `frontend/prototypes/macos-client-v2/`；`frontend/src/renderer/`、`frontend/src/shared/` 保留原型依赖的组件、静态资源、契约和回归测试。管理后台入口为 `admin/src/admin/`；`admin/src/runtime/skill-packages/` 仅保留界面读取的 Skill 说明文本。保留原始内部目录，避免迁移时改写业务源码及导入关系。

## 本地运行

使用 Node.js 26.8.1 或以上的 26.x 版本、npm 11.19.0 或以上的 11.x 版本。

```sh
npm run setup
npm run dev:frontend
```

另开一个终端：

```sh
npm run dev:admin
```

端口占用时，可在各自目录使用 `npm run dev -- --port 端口号`。

## 验证与构建

```sh
npm run check
npm test
npm run build
```

前台构建产物为 `frontend/dist/`，后台为 `admin/dist/admin/`。分别进入对应目录运行 `npm run preview`，默认预览端口为 4173 和 4180。

## 原型边界

- 当前前台以单智能体聊天为主，专家团与事项场景未开放；会议相关旧组件和测试保留。
- 前后台各自使用演示数据。前台创建资料和会话主要保存在页面内存，后台配置与审计保存在浏览器 localStorage。两端尚未连接同一服务。
- 未接入真实模型、OIDC 登录、工具执行、Key 管理和业务系统；后台“发布”、模型同步及运行用量属于原型演示。
- 本仓库包含 Web 原型及必要依赖，不含 Electron 主进程、Python Worker、Keychain Helper、用户数据库、凭证、依赖目录或构建产物。

## 需求与来源

- [前台当前单智能体契约](frontend/prototypes/macos-client-v2/SINGLE_AGENT_V01.md)
- [前台需求](frontend/docs/PRD-digital-employee-frontend.md)
- [后台当前原型说明](admin/docs/web-admin-spec.md)
- [代码来源与导入清单](docs/import-manifest.json)
- [本次导入验证记录](docs/import-validation.md)

前台取自 `AI Employee OS` 工作区当前高校版本；后台取自 `AI Employee OS-web-admin` 工作区。`AI Employee OS-web` 工作区的旧会议服务版本未纳入此次导入。原有文档中历史验收记录和本机路径按来源保留，当前运行入口以本 README 为准。
