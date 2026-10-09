# CAMID B1 结构研究摘要

## 数据来源

- `CAD Output/Camera V3.STEP`
- `Rendering/exploded/9.jpg`
- `Rendering/5.jpg`、`6.jpg`、`7.jpg`
- `Rendering/web/6.jpeg`、`9.jpeg`、`11.jpeg`

STEP 为 SolidWorks 2025 导出的 AP214 文件，保留了产品节点、父子装配关系和实体几何，但没有提供 SolidWorks mates 或可直接播放的运动约束。

装配说明交叉核对结果：A4-5/A4-6 的 Printer Manual 明确列出 2 根方辊、4 个小方辊齿轮、2 个大方辊齿轮、2 根圆辊、6 个支承件、2 个出片口件、锁件和曲柄；A4-8/A4-9 的 Shutter Manual 明确列出 Aperture wheel、Lens、Trigger、Shutter 1/2/3 和弹簧；A4-7 的 Tank Case Manual 列出前后壳、Lever、Lever handle 和 Trap。页面按这些资料组织装配教学。

## 已确认的装配层级

根装配 `Camera V3` 包含 `Tank 6000`、`Shutter`、`Printer - FullAssembly`、`Tank case 7003`、`Film` 和压力按钮节点。

### Printer - FullAssembly

包含 `Roller`、`Roller2`、`CubicRoller`、`RollerGear`、`CubeRollerGearS`、`CubicRollerGearL`、多个 Roller Support、`SpringSupportUp/Down`、`CrankShaft`、`CrankHandle`、`FilmExit`、`PrinterCase` 和锁件。源 STEP 还带有 `2113 - Printer - Big gear`，但设计确认它是误隐藏的辅助零件；教学派生资产按完整节点路径排除，不把它当作真实产品传动件。

### Shutter

包含 `Shutter1`、`Shutter2`、`Shutter3`、`Trigger`、`Wheel^Shutter`、`Glass` 与外壳节点。

### Tank

包含 `front tank`、`back tank`、`lever`、`lever support`、`lever handle`、`Trap`、`Film dimensions` 和相关外壳节点。

## 页面使用的判断等级

| 等级 | 页面表达 | 依据 |
| --- | --- | --- |
| 已确认 | 节点名、父子装配、零件分组 | STEP 产品结构 |
| 工程图支持 | 外形、尺寸或局部位置 | Technical Drawings；已核对 Roller1/2、RollerGear、CubeRollerGearS、CubicRollerGearL、CubicRoller、CrankHandle、PrinterCase、ShutterCase、TankFront/Back、LeverArm/Handle |
| 教学模型 | 曲柄、齿轮、辊筒、快门、Lever 的运动方向 | 基于节点关系的解释性动画 |
| 待补资料 | 齿数、转向、摩擦、限位、曝光时序 | STEP 未包含 mates；需要工程图或实机记录 |

## 当前不能直接声称的内容

- 不能把页面动画称为 SolidWorks 运动仿真。
- 不能从“拍立得”名称推断完整的常见相机光学链路。
- 不能确定真实的齿轮传动比、辊筒接触顺序和快门时间。
- 不能确定薄片在 Tank、Trap、FilmExit 之间的实机路径，除非补充工程图或拆装视频。

## 展示排除的证据边界

- **源文件确认**：`2113 - Printer - Big gear` 确实存在于 `Camera V3.STEP` 的 `Printer - FullAssembly` 节点下。
- **设计确认**：用户确认该齿轮是忘记隐藏的辅助零件，不应出现在最终产品展示。
- **派生资产处理**：源 STEP 保持原样；`convert_step.py` 仅在生成 GLB 时按完整路径排除，并把路径、名称和原因写入 manifest。
- **未做的推断**：没有据此删除其他 `RollerGear`、`CubeRollerGearS` 或 `CubicRollerGearL`，这些节点仍由 STEP 和装配资料支持。

## 下一步验证

1. 从工程图逐项核对轴线、孔位、滚轮相对位置和 FilmExit 高度。
2. 获取 SolidWorks mates 或录制曲柄、Trigger、Lever 的实机运动。
3. 将已验证的零件节点导出为轻量 GLB，替换页面中的几何教学图。
