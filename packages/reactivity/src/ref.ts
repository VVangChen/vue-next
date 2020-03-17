/**
 * ref，首先它不是 vue 2.0 中的 ref
 * ref 的介绍：https://vue-composition-api-rfc.netlify.com/#overhead-of-introducing-refs
 * ref 和 reactive 的区别：https://vue-composition-api-rfc.netlify.com/#ref-vs-reactive
 *
 * 这个文件包含 ref 类型的定义和创建 ref 相关的方法
 * 暴露的接口有：
 * - 创建两种 ref
 *   - 普通
 *   - shallow
 * - 类型判断函数 isRef
 * - 解构函数 unref
 * - 转换函数 toRefs
 */
import { track, trigger } from './effect'
import { TrackOpTypes, TriggerOpTypes } from './operations'
import { isObject } from '@vue/shared'
import { reactive, isReactive } from './reactive'
import { ComputedRef } from './computed'
import { CollectionTypes } from './collectionHandlers'

// 用于 TS 区分 Ref 和普通的包含 value 字段的对象
const isRefSymbol = Symbol()

export interface Ref<T = any> {
  // This field is necessary to allow TS to differentiate a Ref from a plain
  // object that happens to have a "value" field.
  // However, checking a symbol on an arbitrary object is much slower than
  // checking a plain property, so we use a _isRef plain property for isRef()
  // check in the actual implementation.
  // isRef() 方法通过 _isRef 属性来检查是否是 ref 对象类型
  // 不在接口里声明 _isRef，是因为不想将内部的字段泄露给用户编辑器的补全提示中
  // The reason for not just declaring _isRef in the interface is because we
  // don't want this internal field to leak into userland autocompletion -
  // a private symbol, on the other hand, achieves just that.
  [isRefSymbol]: true
  value: T
}

// 所以可以通过 reactive 方法来将普通的对象转换成 ref 对象？
const convert = <T extends unknown>(val: T): T =>
  isObject(val) ? reactive(val) : val

// 这是给 TS 做类型判断用的？
export function isRef<T>(r: Ref<T> | unknown): r is Ref<T>
// 这样能在静态编写阶段就知道调用 isRef 的结果
export function isRef(r: any): r is Ref {
  return r ? r._isRef === true : false
}

export function ref<T>(value: T): T extends Ref ? T : Ref<UnwrapRef<T>>
export function ref<T = any>(): Ref<T | undefined>
// 创建 Ref 类型
export function ref(value?: unknown) {
  return createRef(value)
}

export function shallowRef<T>(value: T): T extends Ref ? T : Ref<T>
export function shallowRef<T = any>(): Ref<T | undefined>
export function shallowRef(value?: unknown) {
  return createRef(value, true)
}
// 并没有告诉编译器返回的是 Ref 类型
// 而是通过 ref 和 shallowRef 再包装了一下
function createRef(value: unknown, shallow = false) {
  if (isRef(value)) {
    return value
  }
  // shallow 为 false 的话，会先将值转换为响应式对象
  if (!shallow) {
    value = convert(value)
  }
  const r = {
    _isRef: true,
    get value() {
      // 取值时，设置依赖？
      track(r, TrackOpTypes.GET, 'value')
      return value
    },
    set value(newVal) {
      // 设置时，如果 !shallow，会转换下新值
      value = shallow ? newVal : convert(newVal)
      // 这是做什么？
      trigger(
        r,
        TriggerOpTypes.SET,
        'value',
        __DEV__ ? { newValue: newVal } : void 0
      )
    }
  }
  return r
}

// 表面意思上是释放引用，获取 primitive value
export function unref<T>(ref: T): T extends Ref<infer V> ? V : T {
  return isRef(ref) ? (ref.value as any) : ref
}

// 接收一个响应式对象，将其所有属性转换为 ref 数组？
export function toRefs<T extends object>(
  object: T
): { [K in keyof T]: Ref<T[K]> } {
  if (__DEV__ && !isReactive(object)) {
    console.warn(`toRefs() expects a reactive object but received a plain one.`)
  }
  const ret: any = {}
  for (const key in object) {
    ret[key] = toProxyRef(object, key)
  }
  return ret
}

// 所以 ref 本质上是一个包含访问器属性的对象
function toProxyRef<T extends object, K extends keyof T>(
  object: T,
  key: K
): Ref<T[K]> {
  return {
    _isRef: true,
    get value(): any {
      return object[key]
    },
    set value(newVal) {
      object[key] = newVal
    }
  } as any
}

// corner case when use narrows type
// Ex. type RelativePath = string & { __brand: unknown }
// RelativePath extends object -> true
type BaseTypes = string | number | boolean

// 没太懂，递归地拆解嵌套的值绑定？
// infer 是什么？
// Recursively unwraps nested value bindings.
export type UnwrapRef<T> = {
  cRef: T extends ComputedRef<infer V> ? UnwrapRef<V> : T
  ref: T extends Ref<infer V> ? UnwrapRef<V> : T
  array: T
  object: { [K in keyof T]: UnwrapRef<T[K]> }
}[T extends ComputedRef<any>
  ? 'cRef'
  : T extends Array<any>
    ? 'array'
    : T extends Ref | Function | CollectionTypes | BaseTypes
      ? 'ref' // bail out on types that shouldn't be unwrapped
      : T extends object ? 'object' : 'ref']
