/**
 * 这个文件包括 provide 和 inject 的实现
 * 除了可以学习到 provide 和 inject 怎么实现的之外，有三个地方值得学习：
 *
 * 1. provides 向上查找的实现（通过原型链
 * 2. TS 不允许 symbol 作为索引类型
 * 3. 只有在 setup 或者函数式组件中能调用 inject
 */
import { currentInstance } from './component'
import { currentRenderingInstance } from './componentRenderUtils'
import { warn } from './warning'

export interface InjectionKey<T> extends Symbol {}

export function provide<T>(key: InjectionKey<T> | string, value: T) {
  if (!currentInstance) {
    if (__DEV__) {
      warn(`provide() can only be used inside setup().`)
    }
  } else {
    let provides = currentInstance.provides
    // by default an instance inherits its parent's provides object
    // but when it needs to provide values of its own, it creates its
    // own provides object using parent provides object as prototype.
    // this way in `inject` we can simply look up injections from direct
    // parent and let the prototype chain do the work.
    // 默认，inject 使用父级实例的 provides，如果要给实例设置自己的 provides
    // 会将父级实例的 provides 作为原型来创建自己的 provides
    // 这样 inject 的时候，就会自动通过原型链来完成向上查找的工作
    // 聪明啊！hhh
    const parentProvides =
      currentInstance.parent && currentInstance.parent.provides
    if (parentProvides === provides) {
      provides = currentInstance.provides = Object.create(parentProvides)
    }
    // TS doesn't allow symbol as index type
    // TS 不允许 symbol 作为索引类型，why？
    provides[key as string] = value
  }
}

export function inject<T>(key: InjectionKey<T> | string): T | undefined
export function inject<T>(key: InjectionKey<T> | string, defaultValue: T): T
export function inject(
  key: InjectionKey<any> | string,
  defaultValue?: unknown
) {
  // fallback to `currentRenderingInstance` so that this can be called in
  // a functional component
  // 没太懂，意思是函数式组件不会作为 currentInstance 的值，但是 currentRenderingInstance 会吗？
  const instance = currentInstance || currentRenderingInstance
  // 直接在 provides 以及其原型链中查找 key
  // 如果没找到返回传入的 defaultValue
  if (instance) {
    const provides = instance.provides
    if (key in provides) {
      // TS doesn't allow symbol as index type
      return provides[key as string]
    } else if (defaultValue !== undefined) {
      return defaultValue
    } else if (__DEV__) {
      warn(`injection "${String(key)}" not found.`)
    }
  } else if (__DEV__) {
    // 同样的，只有在 setup 或者函数式组件中能调用 inject
    warn(`inject() can only be used inside setup() or functional components.`)
  }
}
