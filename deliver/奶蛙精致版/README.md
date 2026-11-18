# 蛙岛警报 · 奶蛙：午夜奶厂（源码包）

《奶蛙：午夜奶厂》MILK FROG: Last Drop —— PS1 粗糙画质 · 怪诞恐怖黑色幽默 · 多结局叙事游戏。
Three.js 网页端，**双击 `index.html` 即可离线运行**，无需构建、无需联网。

## 运行入口

| 文件 | 说明 |
| --- | --- |
| `index.html` | 主游戏（PS1 BUILD · 三幕场景，含启动遮罩与开发者模式） |
| `motion_demo.html` | 角色运动演示（独立场景） |
| `assets/audio/音效试听.html` | 音效试听页（读取 `manifest.js`） |

## 目录结构

```
蛙岛警报-奶蛙午夜奶厂-20261117/
├── index.html               主游戏单文件（程序化 canvas 贴图，无外部图片依赖）
├── motion_demo.html         角色运动演示
├── vendor/                   Three.js r149 UMD + GLTFLoader（本地存放，file:// 可直开）
├── assets/
│   ├── *.glb                 角色模型 8 个（奶蛙 No.13 / 奶蛙群像 / 奶龙 / 奶龙低模 / 奶龙史莱姆 / 蛙神 / 奶牛售货机 / 鸽子）
│   ├── *.blend / *.blend1    Blender 源文件（角色建模用）
│   ├── audio/                42 个音效 WAV + 1 个 m4a + manifest.js + 试听页
│   ├── char_motion.js        角色动作数据
│   ├── nailong_data.js       奶龙模型数据
│   └── README.md             奶龙模型 Blender 导入教程（面向新手）
├── 场景设计与提示词.md         PS1 美术规格书：12 场景 × 8 维度 + 渲染管线 + 贴图规范 + 结局画面规范
├── 剧情小说与结局分章.md       小说化叙事：序章 + 三幕 + 7 结局 + 1 彩蛋
├── 角色运动逻辑.md             角色运动规则
├── *.py                      资产构建脚本（音效合成 / 角色建模 / 渲染出图 / 探针）
└── .workbuddy/memory/         开发过程记录
```

## 美术规格

- **三幕色板**：醒奶区（病奶白 `#E6E2CF` / 锈红 `#8C3B2E` / 荧光绿 `#86C24B`）、发酵区（霉绿 `#7E8B3A` / 奶酪黄 `#D9B84A`）、主奶泵室（母液粉 `#E06B9E` / 警示黄 `#E8C02A`）
- **PS1 渲染管线**：320×240 RenderTarget + NearestFilter 放大、顶点抖动、6 级色阶 + Bayer Dither、CRT 桶形畸变 / 扫描线 / 噪点 / 暗角、FogExp2 浓雾
- **结局**：溜了溜了（普通）/ 断奶（真）/ 草莓奶昔 S 级（搞笑）/ 新厂长（坏）/ 蛙神降临（隐藏）/ 三分钟下班（速通）/ 售货机新货（彩蛋）

## 资产构建

- **音效**：`.build_sfx.py` 纯标准库合成（振荡器 / 噪声 / 滤波 / 包络 / 延迟混响，固定随机种子可复现），输出 WAV + `manifest.js`
- **角色**：`.build_milkfrog.py`、`.rot_cast.py`、`.shape_asym.py` 等 Blender 脚本生成 `.blend` 再导出 `.glb`
- **第三方模型**：奶龙（Nailoong）模型来自 GitHub `bigdiu/naiwa-nailoong-blender-model`，**非商用授权**，`assets/README.md` 附手把手导入教程

## 使用提示

- 完全离线：`vendor/` 本地 Three.js，贴图程序化生成，无任何外部网络请求
- 在 iframe 预览面板里演示时，用左下角方向键按钮操控（不依赖键盘焦点）；WASD 需先点击画面获取焦点
- 音效保留原始 WAV 未压缩，便于二次处理
