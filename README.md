# CAMID B1 · 机械成像实验室

CAMID B1 是一台基于真实装配结构设计的纯机械拍立得。本项目把它转化为一个适合“懂了鸭”青少儿 AI 科普平台的全屏互动 HTML：孩子可以查看真实 CAD 总装配、逐步装回 Printer、观察三片快门，再用零件分类挑战检验自己的理解。

页面运行时不依赖在线资源。Three.js、应用脚本和 CAD 模型都在本地，适合独立运行和打包；修改源码时需要安装构建依赖。

2026-10-11 材质更新：按设计者渲染参考重建厚重、紧凑的暗红 CAMID 字标，并扩大到 36 mm 可见宽度；上壳新增石墨饰面、缎面细带与低对比 B1 标识。片仓侧面和边缘补充分区，镜头环使用更清晰的暗红拉丝反射。原始 46 个零件实例及 CAD 几何保持不变。生成图素材与提示词保存在 `assets/branding/`；字标是参考重建，尚非原始矢量品牌文件。

同日背面与侧面更新：先以真实 CAD 对应视角生成两张材质效果图，再生成三张平面颜色贴图。上壳背面加入 CAMID B1 铭文与细边界，原 Trap 后盖加入横向细纹和低对比 B1 铭文，Tank 两侧加入线性纹理、暗红线和 B1 型号标识。三处使用各自原有外表面 UV，零件展开时贴图随本体移动。页面增加中性侧背光，让暗色纹理可读；这次材质更新保留了原相机几何、正面 CAMID 字标和当时的 12 秒揭幕结构。效果图、准确提示词与来源在 `references/finish-v4/`，PNG 贴图原稿在 `assets/branding/finish-v4/`。

## Blender 材质与棚灯

产品视觉使用真实 CAD 网格在 Blender 3.1 中生成。`scripts/style_blender.py` 导入 `assets/camera-v3.glb`，按零件路径分配炭灰细颗粒壳体、石墨喷砂面板、红色拉丝金属、钢制传动件和中性透明玻璃，保留原始 STEP 的分面法线，并用 Cycles 生成可编辑工程、证明图、空棚背景与本地 HDR 反射环境。`Box 4001` 的壳体、镜头环、标识侧面和边缘使用四个材质区。CAMID 区域按参考重做有明确矩形边界的石墨面板，独立控制颜色、金属度、粗糙度与细纹理；分界绘在原始 CAD 表面，保留几何、零件身份和爆开关系。二十三张表面贴图及 CAMID 透明贴图均嵌入 GLB，离线仍可显示；标识随外壳一起运动，不计入 CAD 零件数。新增三张不透明颜色贴图在 GLB 内使用 JPEG，PNG 原稿保留；法线与 ORM 参数图保持无损 PNG。

生成 Blender 资产：

```powershell
& 'D:\Program Files (x86)\Blender Foundation\Blender 3.1\blender.exe' --background --factory-startup --python scripts/style_blender.py -- --output-dir blender --samples 96
```

网页使用 `assets/camera-v3-studio.glb`、`assets/camid-studio.hdr` 和 `assets/studio-backdrop.jpg`。Blender 的 Cycles 灯光用于产品证明图；网页用同一 HDR 环境和实时补光保持可旋转、可拆解交互。背景只包含空棚灯光，产品始终是实时 CAD 网格。可编辑工程保存在 [`blender/CAMID-B1-studio.blend`](blender/CAMID-B1-studio.blend)，样张为 [`blender/camid-b1-studio.png`](blender/camid-b1-studio.png)。

![Blender Cycles product proof](blender/camid-b1-studio.png)

更新网页资产后运行 `node scripts/verify-studio.mjs`，核对 Blender 处理前后的实例路径、层级变换、几何包围盒和内嵌贴图。原始派生 GLB 保留作为结构基准。平面不焊接到圆角，也不统一平滑，以免产生错误的三角明暗。Cycles 的体积吸收与微表面节点没有完整的 glTF 等价表达，网页使用导出的 PBR 材质与实时镀膜参数近似。CAMID 字样根据参考重建，未取得原始字体或矢量标识文件。

## 快速运行

直接双击 `index.html` 即可打开，GLB 已内嵌在本地脚本中。也可以使用静态服务器：

```powershell
python -m http.server 4173
```

然后访问 <http://127.0.0.1:4173/>。

## 互动内容

- **整机 / 15 秒揭幕**：快速推进到极近特写 → 持续右摇掠过材质 → 先拉远、再接入左转 → 拉镜中开壳 → 同向绕行并抬升，光学与机构分层释放 → 减速落在左侧四分之三爆炸构图。支持暂停、继续、拖动时间轴、点击阶段定位、倒放合回、跳至全貌、Esc 退出及机械音效开关；结尾可以旋转观察并进入零件地图。默认静音，开启声音后才创建音频。
- **拆解**：按 `Printer`、`Shutter`、`Tank` 分组浏览真实零件，搜索、选中、单独观察并展开装配。
- **装回去**：依据 A4-5/A4-6 Printer 装配说明逐步显示支承件、方辊、三类齿轮、圆辊、出口件、锁件、外壳和曲柄。
- **快门叠层**：分开观察 CAD 中的 `Shutter 1/2/3`，对应 A4-8/A4-9 的叠层顺序；不把叠层动画冒充真实曝光时序。
- **零件侦探**：用真实 CAD 零件肖像判断它属于 Printer、Shutter 还是 Tank。

## 设计方向

视觉语言来自 CAMID B1 的产品渲染与网页参考：

- 炭灰细颗粒外壳与石墨喷砂面板
- 炭黑背景与内部机构
- 暗红拉丝镜头环与操作件、钢色传动件
- 中性透明镜片与白色软箱反射
- 全章节炭黑界面、石墨卡片、暗红操作焦点与顶部黑色胶囊导航
- 本地打包的 Chakra Petch 品牌字体与 Space Grotesk 界面字体
- 红色轮廓光、暗红棚景与中性软箱反射

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

STEP 保留了零件几何与静态装配位置，没有提供 SolidWorks mates、运动限位或摩擦接触约束。当前页面的爆炸展开、逐步显示和快门分层用于结构观察；传动方向、比例、送片路径和曝光时序尚未验证。

详细的结构判断、推测和待补资料见 [`docs/structure-research.md`](docs/structure-research.md)。视觉与交互设计说明见 [`docs/design.md`](docs/design.md)。

### 展示排除项

源 STEP 中存在节点 `2113 - Printer - Big gear`，设计确认它是误隐藏的辅助零件，不属于最终产品展示。源 STEP 未被改写；派生 GLB 在转换时按完整路径排除了该节点，并在 `assets/camera-v3.manifest.json` 的 `excludedPaths` / `omittedParts` 中保留了可追溯记录。

源 STEP 还包含两块相同的 `Trap 6001` 后盖。根据设计者对截图的确认，排除 `/Camera V3/Tank 6000_Défaut/Trap 6001_Défaut` 这一外侧悬浮副本，保留贴合机身的 `/Camera V3/Tank case 7003^Camera V3_Défaut/Trap 6001_Défaut`。Blender 场景、派生模型、零件目录和爆炸图均只包含一块后盖。

设计者还确认删除外侧 `lever handle 6008`，保留内侧 `Handle 2` 并装到 `lever support 6007` 上方孔位。派生资产依据 STEP 圆角长孔与外侧支承面的实际坐标修正这一个实例位置，保留其轮廓和方向。`scripts/assembly-corrections.json` 与 manifest 记录源/目标定位点和变换。当前几何没有圆形插销，修正为静态定位；完整运动配合仍需 CAD 约束。

## 页面截图

![Reference-aligned charcoal crimson interface](screenshots/25-material-v3-home.png)

![Bounded CAMID signature panel](screenshots/26-material-v3-signature.png)

![Unified assembly interface](screenshots/21-reference-assembly.png)

![Unified part detective cards](screenshots/21-reference-detective.png)

![Mobile charcoal crimson interface](screenshots/23-reference-mobile.png)

![Material zones and fine surface texture](screenshots/18-surface-closeup.png)

![Continuous CAD burst](screenshots/12-black-gold-burst.png)

![Charcoal crimson exploded CAD](screenshots/13-black-gold-exploded.png)

![Corrected single rear cover](screenshots/16-rear-cover-corrected.png)

![Retained handle aligned to upper slot](screenshots/19-handle-upper-slot.png)

![Mobile CAD product](screenshots/14-black-gold-mobile.png)

![Real CAD assembly](screenshots/05-real-cad-assembly.png)

![Printer assembly step 4](screenshots/06-printer-step-4.png)

![Shutter layers](screenshots/07-shutter-layers.png)

![Part detective](screenshots/08-part-detective.png)

## 产品视觉参考

以下图片来自本项目 `Rendering` 目录，用于记录产品和交互的视觉方向；可运行的互动页面本身位于仓库根目录的 `index.html`。

![Product hero](screenshots/01-product-hero.jpeg)

![Exploded assembly](screenshots/02-exploded-assembly.jpg)

![Creation steps](screenshots/03-creation-steps.jpeg)

![Copper mechanism detail](screenshots/04-copper-detail.jpg)

## 文件结构

```text
index.html                  独立运行的互动页面
assets/                     GLB、内嵌模型、应用脚本与本地图片
src/app.js                  Three.js 交互源码
src/reveal-timeline.js      15 秒镜头轨道、时间映射与分层展开
scripts/build.mjs           打包脚本
scripts/convert_step.py     保留装配层级的 STEP 转换脚本
screenshots/                实际页面截图与产品参考图
docs/design.md              设计系统与交互说明
docs/structure-research.md  CAD 结构证据边界
```

## 后续方向

1. 根据几何和工程图核对齿数、轴向约束和片材间隙。
2. 获取 SolidWorks mates 或实机录制，验证传动、快门时序和片材路径。
3. 将每个章节拆成懂了鸭平台可独立加载的内容单元。

## 修改与构建

```powershell
pnpm install
pnpm run build
```

构建脚本将 `src/app.js` 打包至 `assets/app.js`，并根据 `assets/camera-v3-studio.glb` 与 `assets/camid-studio.hdr` 生成 `assets/model-data.js`。预构建文件已包含在仓库中。

几何、法线和镜头验证：

```powershell
node scripts/verify-studio.mjs
node scripts/verify-assembly.mjs
node scripts/verify-reference.cjs
$env:CAMID_PORT='4173'
node scripts/verify-shot.cjs
$env:CAMID_URL='http://127.0.0.1:4173/#home'
node scripts/verify-reveal.cjs
node scripts/verify-reveal-cinema.cjs
node scripts/verify-rear-side.cjs
```

镜头检查需要本地 `playwright` 与 Chromium 浏览器；也可用 `CAMID_BROWSER` 指定 Edge/Chrome 的可执行路径。揭幕验证覆盖 1440 × 900、1024 × 768、390 × 844、360 × 640 与 844 × 390，以及暂停/继续、错峰展开、确定性拖动、阶段定位、倒放归零、声音开关、章节切换、减少动态效果与 `file://` 离线打开。截图前同时检查 WebGL 仍有可见像素，避免画布尺寸变化后出现透明帧。结果保存在 `screenshots/reveal/validation.json`。几何检查覆盖 46 个实例与 345 个大壳面三角形角点的法线，并确认仅保留贴合机身的后盖及上方孔位的内侧手柄。装配检查直接核对实际网格上的孔边、手柄定位点与接触面。

揭幕的阶段、零件位移采样、镜头轨道节点与时间映射位于 `src/reveal-timeline.js`，世界空间轨道构建与取景位于 `src/app.js`，音效位于 `src/reveal-audio.js`，首页样式覆盖位于 `assets/reveal.css`。所有动作由同一时间进度确定，反向与拖动不会积累位置误差。后台标签页自动暂停；开启系统“减少动态效果”时，使用约 1.6 秒的固定方向展开，不进行近景推进、绕行及灯光扫过。

历史记录：2026-10-11 的 12 秒运镜修订扩大了首屏模型与揭幕画布，开场推到镜头环 / CAMID 铭牌的大特写，再拉远到完整相机。通过压低环境补光、强化移动中性主光与红色轮廓增加材质反差；其他探索章节恢复原观察光。`verify-reveal-impact.cjs` 与 `references/reveal-impact/baseline` 保留为这一轮放大效果的历史比较，结果与前后对照图在 `screenshots/reveal-impact`；它不属于当前镜头的推荐验证入口。后续 12 秒贝塞尔节奏版的用户截图、基线与对照图保留在 `references/reveal-bezier` 和 `screenshots/reveal-bezier`。

2026-10-13 的当前版本将揭幕扩展为 15 秒，改用真实世界空间的三次贝塞尔轨道。轨道按弧长采样，再用单调三次贝塞尔时间映射控制行进速度；中间节点保留速度，构图变化连续穿过。约前 1 秒快速推进，1–3.3 秒在极近特写中持续右摇掠过；3.3 秒先拉远，约 4.2 秒才接入左转，约 5.1 秒开始开壳。7–11 秒继续向左绕行并抬升，光学组件与内部机构分层释放，第二段扫光同时增强，最后减速落到左侧四分之三爆炸构图。

轨道以固定整机尺寸作为取景参考，仅最终姿态按完整爆炸包围盒计算适配距离，避免逐帧自动缩放抵消零件展开的视觉冲击。镜片与快门组件先随镜头外壳移动，再按各自节奏释放；桌面全屏画布和手机竖向构图各有取景安排，所有可见零件保留近裁切安全距离。`verify-reveal-cinema.cjs` 是当前轨道检查入口，报告与截图输出到 `screenshots/reveal-cinema`；主交互回归仍使用 `verify-reveal.cjs`。旧的 `verify-reveal-ad.cjs`、`verify-reveal-flight.cjs` 与 `verify-reveal-bezier.cjs` 入口转到现行轨道检查。完整预览视频输出路径为 `previews/camid-reveal-cinema.webm`。

`node scripts/verify-materials.cjs` 检查九种带贴图的真实 WebGL 材质、壳体四个材质区、CAMID 边界贴图、玻璃中性透射及离线贴图解码，并通过关闭法线和边界贴图后的像素对比确认两者参与渲染。`node scripts/verify-reference.cjs` 检查全章节风格、手机宽度及离线字体，生成整机与标识区近照。`node scripts/verify-rear-side.cjs` 检查三处新增平面颜色贴图、法线和 ORM 的解码、0–1 UV 范围、ClampToEdgeWrapping、背面与侧面的像素效果以及揭幕时的零件绑定，输出 `screenshots/finish-v4/` 与 `references/finish-v4/validation.json`。
