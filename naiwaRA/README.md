# naiwaRA · 奶蛙：午夜奶厂（完整存档）

> **备注（2026-11-18）**：本目录是 `naiwaRA` 项目的**完整存档**，独立放在团队仓库里，与仓库根目录的三个交付包互不干扰。
> 运行时只需要本目录根部的 `index.html` + `assets/` + `vendor/`；其余为开发过程留存。

## 运行

```bash
cd naiwaRA
python -m http.server 8899
# 浏览器打开 http://127.0.0.1:8899/index.html
```

启动页选一幕：ACT I 醒奶区 / ACT II 发酵区 / ACT III 主奶泵室。

## 目录

| 路径 | 说明 |
| --- | --- |
| `index.html` | 主场景，单文件承载三幕关卡、HUD、PS1 后处理与剧情判定 |
| `interaction_lab.html` | 道具交互实验台 |
| `motion_demo.html` | 角色运动演示（6 个 GLB + 状态切换 + 眼睛追踪） |
| `assets/` | 角色与道具 GLB、Blender 源文件、45 个 WAV 音效 |
| `assets/interaction.js` | 背包物品、门锁与交互判定 |
| `assets/paperbot/` | 纸片人角色：序列帧脚本与贴图 |
| `assets/milkfrog_halfbody.*` | 奶蛙半身模型（blend / glb）与骨架脚本 |
| `assets/audio/` | 音效库，含 `memes/` 梗音效与夜曲 piano |
| `output/playwright/` | 场景复查截图（工厂/厂区/夜驾坐标修订） |
| `cabinet_lab.html` | 躲藏柜单件测试场 |
| `paperbot_test.html` | 纸片人行为测试场 |
| `milkfrog_model.html` | 奶蛙 NO.13 角色建模检视 |
| `纸片人角色说明.md` | 纸片人设定与行为说明 |
| `vendor/` | three.js + GLTFLoader（本地化，不依赖 CDN） |
| `剧情小说与结局分章.md` | 三幕推进与七个结局的小说化文本 |
| `场景设计与提示词.md` | 场景设定与美术提示词 |
| `角色运动逻辑.md` | 动效层说明 |
| `gifcut/` | 人物抠图 GIF 管线：`key.py` 绿幕抠像 + `build_gif.py` 合成，成品见 `out_transparent.gif` / `out_white.gif` |
| `人物抠图GIF/` | 抠图成品：透明背景版、白底版 |
| `.build_*.py` / `.render_*.py` / `.probe_*.py` | 模型与音效的构建、渲染、量测脚本 |
| `_backup/` | 本地备份：旧版 index、serve 脚本、奶蛙精致版解压副本 |
| `frog-island-alert-team/` | 上游团队仓库的本地副本（含其交付 zip） |

## 说明

- `_backup/` 与 `frog-island-alert-team/` 是开发过程留存，不是运行必需。
- `gifcut/full`、`gifcut/rgba`（约 46MB 抽帧与中间图）未入库，可用 `key.py` + `build_gif.py` 从源视频重建。
- 上游仓库 `frog-island-alert-team` 根目录的「团队包」「场景源码包」已标注展示勿用，本目录不受影响。
