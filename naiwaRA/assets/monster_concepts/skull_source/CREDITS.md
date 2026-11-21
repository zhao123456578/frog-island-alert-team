# 头骨素材来源与授权

本怪物模型的头部使用了现成低模人头骨，替换了原手捏头部（用户反馈手捏头部不自然）。

## 来源
- **作品**：Human Skull (low resolution)
- **作者**：ulf
- **页面**：https://opengameart.org/node/31045
- **文件**：`human_skull_low_res.zip`（原包），本目录 `skull_aged.obj` 是从 `.blend` 里导出的 aged（做旧）版本，186 顶点 / 364 面
- **授权**：**CC-BY-SA 3.0**（署名 + 相同方式共享）

## 署名要求
使用该模型（含衍生作品）时请注明：
> Skull model "Human Skull" by ulf, licensed CC-BY-SA 3.0 (OpenGameArt). Modified (low-poly, recolored,眼球/下巴调整) for use in this project.

## 本项目的修改
- 从 `.blend` 导出 aged 版本为 OBJ
- 缩放、重新定位嵌到怪物颈部
- 面级腐烂骨色重着色（暗褐/黄疸/象牙斑驳）
- 眼窝内嵌入大眼白 + 针孔瞳孔
- 表面贴暗红血渍

## 附带文件
- `human_skull_low_res.zip`：原始下载包（含 blend + clean/aged 两套贴图）
- `human_skull/`：解压后的原始文件
- `skull_aged.obj`：主建模脚本 `.build_skeleton_monster.py` 实际读取的头骨几何
