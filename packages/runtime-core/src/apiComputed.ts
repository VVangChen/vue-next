import {
  computed as _computed,
  ComputedRef,
  WritableComputedOptions,
  WritableComputedRef,
  ComputedGetter
} from '@vue/reactivity'
import { recordInstanceBoundEffect } from './component'

// 发现很多地方都像下面的代码一样，定义了很多遍，但只实现一次
// 这样会有什么好处？
export function computed<T>(getter: ComputedGetter<T>): ComputedRef<T>
export function computed<T>(
  options: WritableComputedOptions<T>
): WritableComputedRef<T>
// 创建 computed 对象
// 创建的参数就是函数或者包含 setter & getter 的对象
export function computed<T>(
  getterOrOptions: ComputedGetter<T> | WritableComputedOptions<T>
) {
  const c = _computed(getterOrOptions as any)
  // 记录当前组件实例的副作用
  // 有个疑问是，这行代码为什么会被放在这里？为什么不是被放在 reactivity 里？
  recordInstanceBoundEffect(c.effect)
  return c
}
