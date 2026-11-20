# 孙笑川追逐者素材

该目录把 `naiwaRA/assets/paperbot/` 中已经完成的人物纸片动画接入室外夜驾。

- `sunxiaochuan_sheet_0.png`、`sunxiaochuan_sheet_1.png`：两页透明 PNG，共 110 帧，10×6 网格。
- `sunxiaochuan_roar.wav`：首次追逐提示音。
- `sunxiaochuan_attitude.wav`：追到车尾时的反馈音。
- `sunxiaochuan_sheet.js`：原始 dataURL 图集备份；正常运行时读取两张 PNG，不加载这个较大的备份文件。

室外场景在第三人称模式显示独立后视监控；驾驶舱模式继续使用车内后视镜。
如果以后提供更高精度的追逐角色 GLB，可通过 `?chaserglb=assets/chaser/文件名.glb` 覆盖纸片人。
