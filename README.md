# dsh-market

DSH 生态插件合集。

| 插件 | 说明 |
| --- | --- |
| [plugins/dsh-market](plugins/dsh-market) | 技能专区与插件市场：浏览、安装、启用/停用、卸载 |

## 结构

```
plugins/
  dsh-market/     技能专区与插件市场
dist/             pnpm pack 产出的 tgz（gitignore）
```

## 本机开发约定

- **唯一真源**是本仓库。`~/Desktop/Yuze/dsh-market` 是指向 `plugins/dsh-market` 的软链，
  宿主构建和本地调试都走这个路径，改代码只改一处。
- 打包产物落在 `dist/`，desktop profile 的 `package.json` 里指向
  `file:~/Desktop/Yuze/dsh-market-repo/dist/dsh-market-<version>.tgz`。

## 开发

```bash
pnpm install
pnpm check
```

`pnpm check` 会对所有子包跑 build + typecheck + 冒烟套件。

打包并装进 desktop profile：

```bash
pnpm -C plugins/dsh-market pack --pack-destination ../../dist
cd ~/.dsh/profiles/desktop && pnpm install
```

## License

MIT
