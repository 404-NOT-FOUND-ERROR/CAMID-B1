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

- **结构总览**：以爆炸装配渲染图为入口，点击外壳、Shutter、Printer、Tank 热点。
- **传动实验**：用曲柄、CrankShaft、RollerGear、方辊齿轮、Roller 和 FilmExit 组成“手部输入 → 输出”的教学模型。
- **光路实验**：点击 Trigger，观察 Glass、Shutter 1/2/3 的遮挡与通光变化。
- **载片路径**：拨动 Lever，观察 Film、Trap、FilmExit 的相对运动关系。
- **学习路线**：将体验拆成 Look、Transfer、Time、Output 四个可独立包装的课堂入口。

## 设计方向

视觉语言来自 CAMID B1 的产品渲染与网页参考：

- 哑光白 / 浅灰外壳
- 炭黑背景与内部机构
- 铜色、橙色作为机械焦点
- 青绿色镜片高光
- 黑色胶囊导航和大字号几何标题
- 深蓝、酒红与冷蓝雾光作为章节氛围

页面使用不同的内容载体来避免“每章都是模型加文字”：产品渲染、爆炸图热点、机构运动图、光路圆盘、片材侧剖视和路线卡片分别承担不同的知识目标。

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
2. 增加面向课堂的任务模式，例如“找出下一只会动的零件”和“预测 FilmExit 的方向”。
3. 将每个章节拆成懂了鸭平台可独立加载的内容单元。
