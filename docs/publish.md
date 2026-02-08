# 发布流程（CLI NPM 包）

本文档说明如何把本仓库的 CLI 发布为可 `npm install -g` 的包。

## 重要说明
- `happy-coder` 包名已被官方占用，你没有维护权限时无法发布同名包。
- 推荐使用 scoped 包名，例如 `@changfenghu/happy-coder`。
- 需要 npm 账号并完成邮箱验证：`npm login`。

## 发布前准备
1) 选择包名（必须全局唯一）
```
npm view @your-scope/happy-coder
```
如果返回 404，说明名字可用。

2) 修改 `cli/package.json`
建议最少修改以下字段：
```json
{
  "name": "@your-scope/happy-coder",
  "version": "0.14.0-0",
  "repository": "https://github.com/ChangfengHU/happy-code"
}
```

3) 若是 scoped 包，确保发布为 public
```json
{
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org"
  }
}
```

## 构建与发布
在 `cli/` 目录执行：
```
corepack yarn install
corepack yarn build
npm login
npm publish --access public
```

## 验证安装
在另一台机器验证：
```
npm install -g @your-scope/happy-coder
happy --version
```

## 版本更新
每次发布必须提升版本号：
```
# 在 cli/package.json 中修改 version
npm publish --access public
```

## 常见问题
- 包名冲突：换成自己的 scope。
- 不能发布：确认 npm 账号已验证邮箱。
- 发布错版本：尽量不要 `unpublish`，优先发布修复版本。
