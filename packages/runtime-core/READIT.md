## 问题

- runtime-core 和 runtime-dom 的关系？
- runtime 和 reactivity 代码的界限在哪里？

## 依赖

- vue/shared
- vue/reactivity

## 全局变量

__NODE_JS__：判断是否是 node 环境
__VERSION__：判断版本？

## 理解

- runtime-core 字面意思是指运行时逻辑没错，但更准确的可以理解为 DSL 的实现？也就是说所有对外接口的入口逻辑
