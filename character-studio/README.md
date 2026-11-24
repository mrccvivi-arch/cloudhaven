# Character Studio

月的独立 3D 造型实验室。AC（软云幼崽）和 BD（浮云幼灵）各有三个可编辑预设。

## 打开编辑器

在本目录运行以下命令，打开 Vite 输出的地址。局域网内的 iPad 可以使用开发机器的局域网地址和端口。

```sh
npm ci
npm run dev
```

需要可独立打开的文件时，运行 `npm run build:offline`，用支持 WebGL 2 的浏览器打开 `dist/character-studio-offline.html`。文件模式下的本地存储取决于浏览器，JSON 可用于跨设备保存。

`npm run build` 生成供静态主机使用的 `dist/`。资源路径是相对路径，支持 GitHub Pages 子路径。此分支没有发布到 Cloudhaven 当前的 Pages 站点。

## 使用

1. 选择 AC1–AC3 或 BD1–BD3。拖动预览可以旋转，双指或鼠标滚轮可以缩放。键盘可用方向键及加减键。
2. 在参数面板切换分类并实时调整。可分别恢复各分类默认值，也可恢复整套基础预设。
3. 在「方案与对比」选择两个方案，或从基础预设中选择一对。两个角色共享观察角度和缩放。
4. 「保存方案」把当前参数复制为有名称的快照。当前编辑进度和已保存方案使用浏览器的 localStorage。
5. 「导出当前 JSON」保存可重新导入的参数；「导出 GLB」保存当前编辑角色的静态网格、材质和五官纹理；相机按钮保存预览区 PNG。关闭地面和背景可以生成透明背景 PNG。

## 角色生成器

`src/moon-model.js` 的 `createMoonModel(parameters)` 返回 `root`、`setParameters`、`update`、`play`、`getBounds` 和 `dispose`。生成器依赖 Three.js 和浏览器的 Canvas 2D。造型参数控制单个连续网格上的肩部起伏、顶部凸起、脚掌和云尾。五官纹理投射到取样后的身体表面。轮廓变化时重建网格，动画主要变换整个角色的比例和位置。宿主应用提供渲染器、相机、灯光和帧更新。
