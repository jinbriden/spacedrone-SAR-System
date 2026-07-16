# 桌面打包可行性验证

验证日期：2026-07-15，环境：Windows、Node.js v24.16.0、npm 11.13.0。

## 当前结论

当前前端适合以 Electron 作为第一条桌面打包路径。`npm run build` 已能生成完全静态的 `dist/`、Cesium 资源和独立 Web Worker，浏览器文件保存/加载也只依赖标准 Web API；Electron 可直接加载这些产物，并可在后续用主进程文件对话框替换隐藏的 `<input type="file">`。

Tauri 同样适合该架构，但本机尚未安装 `cargo` 和 `rustc`，因此当前不能完成本机编译验证。安装 Rust stable 与 Windows C++ Build Tools 后可再创建最小 `src-tauri` 壳进行验证。

## 已验证证据

- `node --version`：`v24.16.0`。
- `npm --version`：`11.13.0`。
- `npm run build`：成功生成 `dist/index.html`、主应用资源、Cesium 静态资源和 `simulation.worker-*.js`。
- `cargo` / `rustc`：当前环境未安装。
- 应用不依赖服务端接口、Node 内建模块或动态远程瓦片，可离线加载当前网格地球。

## Electron 最小接入方案

1. 增加 `electron` 与打包工具作为开发依赖。
2. 主进程开发态加载 Vite 地址，生产态加载 `dist/index.html`。
3. 保持 `contextIsolation: true`、`nodeIntegration: false`。
4. 仅通过 preload 暴露受限的打开/保存文件对话框，不向渲染进程暴露任意文件系统能力。
5. 在 Windows 打包测试中复核 Cesium `Assets/`、`Workers/` 和应用 Web Worker 的相对路径。

## 暂不直接加入桌面依赖的原因

技术文档要求的是可行性验证，而不是在 MVP 中锁定桌面框架。现在加入 Electron 会显著增加安装体积和安全更新责任；加入 Tauri 又会使当前机器构建立即依赖缺失的 Rust 工具链。先保持 Web 应用可验证，待发布目标、签名和自动更新策略明确后再选型。
