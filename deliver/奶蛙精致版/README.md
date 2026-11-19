# 奶蛙：午夜奶厂 + 夜班回家路（完整源码）

独立作品。PS1 风格的三幕叙事恐怖游戏（工厂），以及第三幕之后"下班开车回家"的夜驾段。

> 运行只需要本目录的 `index.html` / `outdoor.html` + `assets/` + `vendor/`，其余为开发文档。

## 运行

```bash
# 在仓库根目录
node scripts/serve.mjs deliver/奶蛙精致版 8899
# 或任意静态服务器：npx serve deliver/奶蛙精致版
```

浏览器打开 `http://127.0.0.1:8899/index.html`：启动页选一幕（ACT I 醒奶区 / ACT II 发酵区 / ACT III 主奶泵室），
或点「直接体验 · 夜班回家路（跳过工厂）」直接进入夜驾。

## 夜班回家路（`outdoor.html`）

约 1.59 km 的夜路，固定座舱视角，1280×720。做完第三幕后从工厂东墙员工通道按 E 下班会带成绩转场进去
（`outdoor.html?from=factory&act=3`），也可以直接打开。

- 操作：`W` 油门 · `S` 刹车（停车区倒车）· `A/D` 变道 · 拖动环视 · `SPACE` 开窗 · `R` 雨刷 · `1-4` 电台 · `F` 咖啡 · 门口靠右按 `E` 停车。
- 调试：`?nochaser` 关闭"被追"机制；`?diff=normal` 标准难度；`assets/shift.js` 改下班时间（默认 02:47，工厂与夜路共用）。

## 目录

| 路径 | 说明 |
| --- | --- |
| `index.html` | 工厂主场景：三幕关卡、HUD、PS1 后处理与剧情判定 |
| `outdoor.html` | 夜班回家路：夜驾、天气、困意、后视镜与被追机制 |
| `interaction_lab.html` | 道具交互实验台 |
| `motion_demo.html` | 角色运动演示（GLB + 状态切换 + 眼睛追踪） |
| `assets/` | 角色与道具 GLB、Blender 源文件、音效、`interaction.js`（工厂交互）、`shift.js`（下班时间） |
| `vendor/` | three.js + GLTFLoader（本地化，不依赖 CDN） |
| `剧情小说与结局分章.md` | 三幕推进与七个结局的小说化文本 |
| `场景设计与提示词.md` | 场景设定与美术提示词 |
| `角色运动逻辑.md` | 动效层说明 |

## 说明

- 角色模型基于团队自建 Blender 工程导出；音效为程序化合成与录制后处理，仓库内不含下载的第三方美术资源。
- 本目录也是 `蛙岛警报-奶蛙午夜奶厂-20261117.zip` 的源码来源（zip 中不包含任何开发脚本或过程记录）。