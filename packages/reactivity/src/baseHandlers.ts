import { reactive, readonly, toRaw } from './reactive'
import { TrackOpTypes, TriggerOpTypes } from './operations'
import { track, trigger, ITERATE_KEY } from './effect'
import { LOCKED } from './lock'
import { isObject, hasOwn, isSymbol, hasChanged, isArray } from '@vue/shared'
import { isRef } from './ref'

const builtInSymbols = new Set(
  Object.getOwnPropertyNames(Symbol)
    .map(key => (Symbol as any)[key])
    .filter(isSymbol)
)

const get = /*#__PURE__*/ createGetter()
const shallowReactiveGet = /*#__PURE__*/ createGetter(false, true)
const readonlyGet = /*#__PURE__*/ createGetter(true)
const shallowReadonlyGet = /*#__PURE__*/ createGetter(true, true)

// 记录类型是否通用？string => func
const arrayInstrumentations: Record<string, Function> = {}
;['includes', 'indexOf', 'lastIndexOf'].forEach(key => {
  arrayInstrumentations[key] = function(...args: any[]): any {
    const arr = toRaw(this) as any
    for (let i = 0, l = (this as any).length; i < l; i++) {
      track(arr, TrackOpTypes.GET, i + '')
    }
    // we run the method using the orignal args first (which may be reactive)
    const res = arr[key](...args)
    if (res === -1 || res === false) {
      // if that didn't work, run it again using raw values.
      return arr[key](...args.map(toRaw))
    } else {
      return res
    }
  }
})

// 这边的逻辑可以回答这么一个问题：访问 vue 响应对象，vue 会做什么？
function createGetter(isReadonly = false, shallow = false) {
  return function get(target: object, key: string | symbol, receiver: object) {
    // 如果对象是数组，并且访问的是 includes, indexOf, lastIndexOf，则直接返回
    // 反射和直接访问有什么区别？
    if (isArray(target) && hasOwn(arrayInstrumentations, key)) {
      return Reflect.get(arrayInstrumentations, key, receiver)
    }
    // 获取返回值
    const res = Reflect.get(target, key, receiver)
    // 如果 key 是内建的 symbol 类型
    // 内建的 synmbol 类型有哪些？
    if (isSymbol(key) && builtInSymbols.has(key)) {
      return res
    }
    // 其实很奇怪，shallow 为什么要到处传，而不是作为响应式对象的一个属性？
    // 如果是 shallow 对象，不会解构 ref 值，也不会递归地将属性对象转换为响应式对象
    if (shallow) {
      track(target, TrackOpTypes.GET, key)
      // TODO strict mode that returns a shallow-readonly version of the value
      return res
    }

    // 如果属性是 ref 类型，且对象不是数组类型，则返回 ref 的值
    // ref unwrapping, only for Objects, not for Arrays.
    if (isRef(res) && !isArray(target)) {
      return res.value
    }
    track(target, TrackOpTypes.GET, key)
    return isObject(res)
      // 什么时候会指定 readonly？
      // 原对象是不可变的，会创建只可读的响应式对象
      ? isReadonly
        ? // need to lazy access readonly and reactive here to avoid
          // circular dependency
          readonly(res)
          // 如果访问的是一个对象，现在会自动将其转换为响应式对象？
        : reactive(res)
      : res
  }
}

const set = /*#__PURE__*/ createSetter()
const shallowReactiveSet = /*#__PURE__*/ createSetter(false, true)
const readonlySet = /*#__PURE__*/ createSetter(true)
const shallowReadonlySet = /*#__PURE__*/ createSetter(true, true)

// 创建setter，主要是响应式对象更新值的逻辑，会触发依赖方的值更新
function createSetter(isReadonly = false, shallow = false) {
  return function set(
    target: object,
    key: string | symbol,
    value: unknown,
    receiver: object
  ): boolean {
    // LOCKED ?
    if (isReadonly && LOCKED) {
      if (__DEV__) {
        console.warn(
          `Set operation on key "${String(key)}" failed: target is readonly.`,
          target
        )
      }
      return true
    }

    const oldValue = (target as any)[key]
    if (!shallow) {
      // 这个 toRaw 是什么意思？转换成 raw 值？
      // 如果创建过响应式对象，确实可以通过 memo 取到原来的值，没有则直接返回，被视为原生值
      value = toRaw(value)
      // 如果对象不是数组，以前的值是 ref，但新值不是
      if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
        oldValue.value = value
        return true
      }
    } else {
      // in shallow mode, objects are set as-is regardless of reactive or not
    }

    const hadKey = hasOwn(target, key)
    // 为什么 set 也用反射？
    const result = Reflect.set(target, key, value, receiver)
    // don't trigger if target is something up in the prototype chain of original
    // 这判断什么意思？在什么情况下不会触发更新
    if (target === toRaw(receiver)) {

      // 区分触发add/set事件，更新依赖方的值
      if (!hadKey) {
        trigger(target, TriggerOpTypes.ADD, key, value)
      } else if (hasChanged(value, oldValue)) {
        trigger(target, TriggerOpTypes.SET, key, value, oldValue)
      }
    }
    return result
  }
}

function deleteProperty(target: object, key: string | symbol): boolean {
  const hadKey = hasOwn(target, key)
  const oldValue = (target as any)[key]
  const result = Reflect.deleteProperty(target, key)
  if (result && hadKey) {
    trigger(target, TriggerOpTypes.DELETE, key, undefined, oldValue)
  }
  return result
}

function has(target: object, key: string | symbol): boolean {
  const result = Reflect.has(target, key)
  track(target, TrackOpTypes.HAS, key)
  return result
}

function ownKeys(target: object): (string | number | symbol)[] {
  track(target, TrackOpTypes.ITERATE, ITERATE_KEY)
  return Reflect.ownKeys(target)
}

// 用于创建普通的响应式对象
export const mutableHandlers: ProxyHandler<object> = {
  get,
  set,
  deleteProperty,
  has,
  ownKeys
}

// 用于创建只读的响应式对象
export const readonlyHandlers: ProxyHandler<object> = {
  get: readonlyGet,
  set: readonlySet,
  has,
  ownKeys,
  deleteProperty(target: object, key: string | symbol): boolean {
    if (LOCKED) {
      if (__DEV__) {
        console.warn(
          `Delete operation on key "${String(
            key
          )}" failed: target is readonly.`,
          target
        )
      }
      return true
    } else {
      return deleteProperty(target, key)
    }
  }
}

// 用于创建浅的响应式对象
export const shallowReactiveHandlers: ProxyHandler<object> = {
  ...mutableHandlers,
  get: shallowReactiveGet,
  set: shallowReactiveSet
}

// 主要用于创建 props 响应式对象
// 如果 props 对象ref属性被解构会发生什么？
// 被组件继续下传，就会变成原生值类型，就不能被跟踪了
// 所以这里说是为了允许 refs 被显式的下传
// Props handlers are special in the sense that it should not unwrap top-level
// refs (in order to allow refs to be explicitly passed down), but should
// retain the reactivity of the normal readonly object.
export const shallowReadonlyHandlers: ProxyHandler<object> = {
  ...readonlyHandlers,
  get: shallowReadonlyGet,
  set: shallowReadonlySet
}
