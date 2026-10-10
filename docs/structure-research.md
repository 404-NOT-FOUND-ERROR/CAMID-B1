# CAMID B1 结构研究摘要

## 数据来源

- `CAD Output/Camera V3.STEP`
- `Assamble manual/A4 - 5.pdf` 至 `A4 - 10.pdf`
- `Construction Manual/Technical Drawings - CAMID B1` 中的辊、齿轮、曲柄、支承及壳体工程图
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
| 观察操作 | 爆炸展开、逐步显示、快门分层 | 只改变显示位置或可见性，不表示真实运动轨迹 |
| 待验证 | 齿数、转向、摩擦、限位、曝光时序 | STEP 未包含 mates；需要几何、工程图或实机记录继续核对 |

## 本轮结构检查

- 派生模型包含 47 个零件实例、52 个节点、41 个独立网格、68,798 个实例三角形；后盖复用同一网格，移除一个实例不改变独立网格数。实例数量包含片材参考实体，不等同于最终产品 BOM。
- Printer 保留 `RollerGear` ×2、`CubeRollerGearS` ×4、`CubicRollerGearL` ×2；只排除设计者指出的 `2113 - Printer - Big gear`。
- `RollerSupport1.2/2.2/3/4/5/6` 均保留。装配第 4 步同时显示 `RollerSupport2.2` 与 `RollerSupport5`。
- Shutter 保留三片不同轮廓的快门、触发件、光圈轮和镜片；说明中的弹簧、镜片支承和保护件不能仅凭当前节点清单逐一确认。
- Tank 保留前后部构件、Lever 及其支承和手柄。源 STEP 中 `Trap` 在两个分支中各出现一次；设计者已确认外侧悬浮后盖是重复导出，派生模型仅保留 Tank case 分支中贴合机身的一块。
- 工程图 `1110 - CubicRoller` 标注截面约 `6 × 6 mm`；STEP 对应零件局部几何包围盒为约 `5.5 × 5.5 × 100 mm`。两份资料存在版本差异，页面保留 STEP 几何，不能据此确认制造公差。
- 展示材质与灯光参考 Rendering 最新指定的 `(1).png`：炭灰细颗粒壳体、石墨喷砂面板、暗红拉丝操作件、钢色机构、中性透明镜片与红色轮廓光。表面纹理内嵌于派生模型；这些是可视化材质分区，不构成制造材料、模具分型线或光学处方的确认。

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

- **重复后盖确认**：设计者指出后侧悬浮的后盖是重复导出。位置与高亮检查确认该实例路径为 `/Camera V3/Tank 6000_Défaut/Trap 6001_Défaut`；它相对贴合机身的另一实例向后错开约 10.48 mm、向上错开约 23.29 mm。
- **后盖处理**：仅从派生资产排除上述悬浮实例，保留 `/Camera V3/Tank case 7003^Camera V3_Défaut/Trap 6001_Défaut` 的原始几何、层级和变换。Blender 可编辑场景、网页模型与零件统计使用同一份修正数据。

## 下一步验证

1. 从工程图逐项核对轴线、孔位、滚轮相对位置和 FilmExit 高度。
2. 获取 SolidWorks mates 或录制曲柄、Trigger、Lever 的实机运动。
3. 当前已使用真实 GLB；后续把验证过的轴线、约束和动作补进交互，而非重建替代零件。
