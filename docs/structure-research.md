# CAMID B1 结构研究摘要

## 数据来源

- `CAD Output/Camera V3.STEP`
- `Rendering/exploded/9.jpg`
- `Rendering/5.jpg`、`6.jpg`、`7.jpg`
- `Rendering/web/6.jpeg`、`9.jpeg`、`11.jpeg`

STEP 为 SolidWorks 2025 导出的 AP214 文件，保留了产品节点、父子装配关系和实体几何，但没有提供 SolidWorks mates 或可直接播放的运动约束。

## 已确认的装配层级

根装配 `Camera V3` 包含 `Tank 6000`、`Shutter`、`Printer - FullAssembly`、`Tank case 7003`、`Film` 和压力按钮节点。

### Printer - FullAssembly

包含 `Roller`、`Roller2`、`CubicRoller`、`RollerGear`、`CubeRollerGearS`、`CubicRollerGearL`、多个 Roller Support、`SpringSupportUp/Down`、`Big gear`、`CrankShaft`、`CrankHandle`、`FilmExit`、`PrinterCase` 和锁件。

### Shutter

包含 `Shutter1`、`Shutter2`、`Shutter3`、`Trigger`、`Wheel^Shutter`、`Glass` 与外壳节点。

### Tank

包含 `front tank`、`back tank`、`lever`、`lever support`、`lever handle`、`Trap`、`Film dimensions` 和相关外壳节点。

## 页面使用的判断等级

| 等级 | 页面表达 | 依据 |
| --- | --- | --- |
| 已确认 | 节点名、父子装配、零件分组 | STEP 产品结构 |
| 工程图支持 | 外形、尺寸或局部位置 | Technical Drawings，需逐图核对 |
| 教学模型 | 曲柄、齿轮、辊筒、快门、Lever 的运动方向 | 基于节点关系的解释性动画 |
| 待补资料 | 齿数、转向、摩擦、限位、曝光时序 | STEP 未包含 mates；需要工程图或实机记录 |

## 当前不能直接声称的内容

- 不能把页面动画称为 SolidWorks 运动仿真。
- 不能从“拍立得”名称推断完整的常见相机光学链路。
- 不能确定真实的齿轮传动比、辊筒接触顺序和快门时间。
- 不能确定薄片在 Tank、Trap、FilmExit 之间的实机路径，除非补充工程图或拆装视频。

## 下一步验证

1. 从工程图逐项核对轴线、孔位、滚轮相对位置和 FilmExit 高度。
2. 获取 SolidWorks mates 或录制曲柄、Trigger、Lever 的实机运动。
3. 将已验证的零件节点导出为轻量 GLB，替换页面中的几何教学图。
