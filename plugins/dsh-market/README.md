# dsh-market — 技能专区与插件市场

Yuze Harness（DSH）插件：浏览技能市场的技能包、安装与管理 DSH 插件。

两个面板：

- **技能专区** — 浏览技能市场、查看已安装技能、启用/停用、删除。
- **插件市场** — 浏览插件市场、安装（npm / 本地目录 / tgz）、启用/停用、刷新、卸载。

## 安装

### macOS / Linux

```bash
# 1. 构建
pnpm install
pnpm build

# 2. 打包
pnpm pack

# 3. 装进桌面 profile
pnpm add <路径>/dsh-market-0.1.0.tgz
```

### Windows

同上，路径写法换成 PowerShell：

```powershell
pnpm install
pnpm build
pnpm pack
pnpm add "C:\path\to\dsh-market-0.1.0.tgz"
```

手动安装插件时，Windows 本地目录用 `C:\dir\pkg` 或 `C:/dir/pkg` 均可识别为路径（不会被当成 npm 包名）。

安装完成后重启 Yuze Harness：Node 侧的路由改动必须重启才生效。

## 使用

插件以侧边栏图标形式注入。侧边栏里点「技能专区」或「插件市场」图标进入。

- **插件市场**分三个页签：`插件市场` / `已安装` / `手动安装`。
  - 手动安装支持三种来源：本地目录（走宿主原生目录选择器）、npm 包名、`.tgz` 文件。
  - 已安装的插件卡片带启用开关、刷新按钮、卸载按钮。
- **技能专区**分两个页签：`精选` / `已安装`。
  - 已安装的技能卡片带启用开关和删除按钮。
  - 停用的技能目录会被移到 `~/.dsh/skills/.disabled/`，源文件不改动，可随时恢复。

> 启用/停用、删除之后都需要重启 Harness 才真正生效，界面会给出提示。

## 技能启停的实现方式

宿主没有提供技能启停 API，所以停用采用「目录搬移」：

| 操作 | 行为 |
| --- | --- |
| 停用 | `~/.dsh/skills/<name>` → `~/.dsh/skills/.disabled/<name>` |
| 启用 | `~/.dsh/skills/.disabled/<name>` → `~/.dsh/skills/<name>` |
| 删除 | 先移到 `~/.dsh/skills/trash/`，再按调用方要求清除 |

策略状态记录在 `~/.dsh/skills/skills-policy.json`。

## 已安装插件的启用判定

宿主 profile 的 `package.json` 里有两个字段：

- `dependencies` — 实际装了的包
- `dsh.profile.bundles` — 宿主启动时加载的包集合

**在 `dependencies` 里但不在 `bundles` 里 = 已安装但被禁用**。所以开关操作改的是 `dsh.profile.bundles`。

`dsh-base` 与 `dsh-web-app` 是宿主自带包，不允许被本插件停用。

## 配置

插件通过 `apply(ctx, config)` 接受配置项：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `apiBaseUrl` | `https://llm.rrzu.com` | 市场后端地址，Windows 内网部署可换成自己的 |
| `dshHome` | `~/.dsh` | DSH 主目录 |
| `profileDir` | 宿主当前 profile 目录 | 插件安装目标 |
| `registry` | pnpm 默认源 | npm registry 覆盖 |

宿主侧通过 `cordis.patch.yml` 插入 profile 的 layer stack；`id` 不能与宿主自有的
`community-market` / `dsh-market` 冲突，`name` 必须等于 `package.json` 的 `name`。

## HTTP 接口

所有接口挂在 `/api/dsh-market` 下，POST 均校验同源。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/skill/categories` | 技能分类 |
| GET | `/skill/list` | 技能列表 |
| GET | `/plugin/categories` | 插件分类 |
| GET | `/plugin/list` | 插件列表 |
| GET | `/diagnostics` | 诊断信息 |
| GET | `/installed/skills` | 已安装技能 |
| GET | `/installed/plugins` | 已安装插件 |
| POST | `/skill/install` | 安装技能 |
| POST | `/skill/enabled` | 启用/停用技能 |
| POST | `/skill/uninstall` | 删除技能 |
| POST | `/plugin/install` | 安装插件（npm） |
| POST | `/plugin/install-from-source` | 安装插件（本地目录） |
| POST | `/plugin/install-tarball` | 安装插件（tgz） |
| POST | `/plugin/enabled` | 启用/停用插件 |
| POST | `/plugin/uninstall` | 卸载插件 |

## 开发

```bash
pnpm install
pnpm check      # build + typecheck + 5 个冒烟套件
```

单独跑某个套件：

```bash
pnpm smoke:client   # 客户端 SSR 冒烟
pnpm smoke:dom      # 插件市场 DOM 交互
pnpm smoke:skills   # 技能专区 DOM 交互
pnpm smoke:loader   # 客户端 loader
pnpm smoke:node     # Node 侧逻辑单测
```

## 依赖

- 运行时：`tar`、`yauzl`、`zod`
- peer：`@deepseek-ai/cordis`、`react@18.3.1`
- 宿主侧注入：`dsh-api-remotes`、`dsh-client-locale`、`dsh-client-ui-layout`、`dsh-client-ui-renderer`、`dsh-client-ui-sidebar`

## License

MIT
