// 交互类型的纯数据表。world.mjs 和 score.mjs 都要读它，
// 单独放一个文件是为了让计分逻辑不依赖 three.js，能离线跑。
export const ACTION = {
  triangle: { label: '就近三角区', color: 0x2fbf71, correct: true },
  gas: { label: '关燃气', color: 0xf0902a, correct: true },
  power: { label: '断电', color: 0x3b82c4, correct: true },
  route: { label: '撤离路线', color: 0x2fbf71, correct: true },
  elevator: { label: '不要坐电梯', color: 0xd94b3b, correct: false },
};
