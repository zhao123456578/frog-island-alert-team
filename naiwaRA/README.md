# naiwaRA · 奶蛙：午夜奶厂（完整存档）

> **备注（2026-11-18）**：本目录是 `naiwaRA` 项目的**完整存档**，独立放在团队仓库里，与仓库根目录的三个交付包互不干扰。
> 运行时只需要本目录根部的 `index.html` + `assets/` + `vendor/`；其余为开发过程留存。

## 运行

```bash
cd naiwaRA
python -m http.server 8899
# 浏览器打开 http://127.0.0.1:8899/index.html
```

## 内容要点

- `index.html`：主场景（三幕关卡 + HUD + PS1 后处理 + 剧情判定）
- `assets/`：角色/道具模型、纸片人序列帧、鼠类模型、音效库
- `assets/ps1_chase_assets/`：PS1 追逐游戏场景建模素材库（9 套，详见其 `素材清单.md`）
- `assets/monster_concepts/`：怪物概念模型与 PSX 恐怖概念图
- `试玩demo/`：自包含可玩发布包；`vendor/`：本地化 three.js
- `_backup/`：开发过程备份，非运行必需

## 说明

- `gifcut/full`、`gifcut/rgba` 为可复算的抽帧中间图，未入库。
- `assets/ps1_vehicles`（51MB）已在仓库根以 `ps1-vehicles/` 专属文件夹入库，此处不重复。
- `frog-island-alert-team/` 为上游仓库本地副本，未入库。
