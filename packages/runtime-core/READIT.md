## 问题

- runtime-core 和 runtime-dom 的关系？
- runtime 和 reactivity 代码的界限在哪里？
- watch 是怎么被标记为被观察者的依赖方？
- vue 一共有哪些 hook？
- 什么时候需要用到 updated ？
- onErrorCaptured，这个 2.0 就有吗？
- 为什么没有 onCreated 和 onBeforeCreate 仔细思考下还需要它们倆 created 和 beforeCreate 吗？首先要确定在 2.0 create 阶段发生了什么？
- runtime-core 包含那几部分？用户能使用哪些 API？
- 什么时候 watch 的 source 是函数？

## 依赖

- vue/shared
- vue/reactivity

## 全局变量

__NODE_JS__：判断是否是 node 环境
__VERSION__：判断版本？

## 理解

- runtime-core 字面意思是指运行时逻辑没错，但更准确的可以理解为 DSL 的实现？也就是说所有对外接口的入口逻辑
