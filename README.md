# CAMID B1 · 机械成像实验室

CAMID B1 是一台基于真实装配结构设计的纯机械拍立得。本项目把它转化为一个适合“懂了鸭”青少儿 AI 科普平台的全屏互动 HTML：孩子可以先识别零件，再拨动传动模型、触发快门光路，最后追踪片材如何从 Tank 走向 FilmExit。

这是一个零依赖、可独立运行的内容原型。页面不依赖前端框架或在线资源，适合直接作为单个互动课件打包。

## 快速运行

直接双击 `index.html` 可以查看大部分内容。推荐使用本地静态服务器，以保证浏览器对本地资源的处理一致：

```powershell
python -m http.server 4173
```

然后访问 <http://127.0.0.1:4173/>。

## 互动内容

- **整机**：直接查看真实 CAD 总装配，拖动旋转、缩放和自动环绕。
- **拆解**：按 `Printer`、`Shutter`、`Tank` 分组浏览真实零件，搜索、选中、单独观察并展开装配。
- **装回去**：依据 A4-5/A4-6 Printer 装配说明逐步显示支承件、方辊、三类齿轮、圆辊、出口件、锁件、外壳和曲柄。
- **快门叠层**：分开观察 CAD 中的 `Shutter 1/2/3`，对应 A4-8/A4-9 的叠层顺序；不把叠层动画冒充真实曝光时序。
- **零件侦探**：用真实 CAD 零件肖像判断它属于 Printer、Shutter 还是 Tank。

## 设计方向

视觉语言来自 CAMID B1 的产品渲染与网页参考：

- 哑光白 / 浅灰外壳
- 炭黑背景与内部机构
- 铜色、橙色作为机械焦点
- 青绿色镜片高光
- 黑色胶囊导航和大字号几何标题
- 深蓝、酒红与冷蓝雾光作为章节氛围

页面使用不同的内容载体来避免“每章都是模型加文字”：实时 CAD 总装配、零件目录、装配进度条、快门叠层观察器和零件分类挑战分别承担不同的知识目标。

## 结构证据边界

STEP 文件确认了产品节点和父子装配关系，包括：

- 根装配 `Camera V3`
- `Printer - FullAssembly`
- `Shutter`
- `Tank`
- `CrankHandle`、`CrankShaft`
- `Roller`、`CubicRoller`、`FilmExit`
- `RollerGear`、`CubeRollerGearS`、`CubicRollerGearL`
- `Shutter1/2/3`、`Trigger`、`Wheel^Shutter`、`Glass`
- `Lever`、`Trap`、`Film dimensions`

STEP 没有保留 SolidWorks mates、齿轮齿数、运动限位和真实摩擦接触。因此页面中的曲柄、齿轮、快门和 Lever 动画明确标注为**基于结构关系的教学运动模型**，不是经过实机验证的运动仿真。

详细的结构判断、推测和待补资料见 [`docs/structure-research.md`](docs/structure-research.md)。视觉与交互设计说明见 [`docs/design.md`](docs/design.md)。

### 展示排除项

源 STEP 中存在节点 `2113 - Printer - Big gear`，设计确认它是误隐藏的辅助零件，不属于最终产品展示。源 STEP 未被改写；派生 GLB 在转换时按完整路径排除了该节点，并在 `assets/camera-v3.manifest.json` 的 `excludedPaths` / `omittedParts` 中保留了可追溯记录。

## 视觉参考 / Screenshots

以下图片来自本项目 `Rendering` 目录，用于记录产品和交互的视觉方向；可运行的互动页面本身位于仓库根目录的 `index.html`。

![Product hero](screenshots/01-product-hero.jpeg)

![Exploded assembly](screenshots/02-exploded-assembly.jpg)

![Creation steps](screenshots/03-creation-steps.jpeg)

![Copper mechanism detail](screenshots/04-copper-detail.jpg)

## 文件结构

```text
index.html                  独立运行的互动页面
assets/                     页面使用的本地产品渲染素材
screenshots/                README 展示用的视觉参考图
docs/design.md              设计系统与交互说明
docs/structure-research.md  CAD 结构证据边界
```

## 后续方向

1. 根据工程图补齐齿轮齿数、轴向约束、快门时序和片材间隙。
2. 获取 SolidWorks mates 或实机录制，用已验证的运动替换当前教学动作。
3. 将每个章节拆成懂了鸭平台可独立加载的内容单元。
