/**
 * 这个文件包含集合对象类型的代理所需要的 handlers
 * 暴露了两种：mutable, readonly
 */
import { toRaw, reactive, readonly } from './reactive'
import { track, trigger, ITERATE_KEY } from './effect'
import { TrackOpTypes, TriggerOpTypes } from './operations'
import { LOCKED } from './lock'
import { isObject, capitalize, hasOwn, hasChanged } from '@vue/shared'

export type CollectionTypes = IterableCollections | WeakCollections

type IterableCollections = Map<any, any> | Set<any>
type WeakCollections = WeakMap<any, any> | WeakSet<any>
type MapTypes = Map<any, any> | WeakMap<any, any>
type SetTypes = Set<any> | WeakSet<any>

const toReactive = <T extends unknown>(value: T): T =>
  isObject(value) ? reactive(value) : value

const toReadonly = <T extends unknown>(value: T): T =>
  isObject(value) ? readonly(value) : value

const getProto = <T extends CollectionTypes>(v: T): any =>
  Reflect.getPrototypeOf(v)

// 获取值
function get(
  target: MapTypes,
  key: unknown,
  wrap: typeof toReactive | typeof toReadonly
) {
  target = toRaw(target)
  const rawKey = toRaw(key)
  // 同样的也会进行跟踪操作
  track(target, TrackOpTypes.GET, rawKey)
  const { has, get } = getProto(target)
  // 什么时候会找不到 key 呢？
  // 为什么找不到的时候，要使用 rawKey？
  // 是不是 key 可能是响应式对象？
  if (has.call(target, key)) {
    return wrap(get.call(target, key))
  } else if (has.call(target, rawKey)) {
    return wrap(get.call(target, rawKey))
  }
}

// has 代理
function has(this: CollectionTypes, key: unknown): boolean {
  const target = toRaw(this)
  const rawKey = toRaw(key)
  track(target, TrackOpTypes.HAS, rawKey)
  const has = getProto(target).has
  // 如果 key 是响应式对象，保存的是 rawKey？
  return has.call(target, key) || has.call(target, rawKey)
}

// size 属性代理
function size(target: IterableCollections) {
  target = toRaw(target)
  // 任何影响长度的操作，都会改变 size
  // 所以任何影响长度的操作，都会触发响应式副作用执行
  track(target, TrackOpTypes.ITERATE, ITERATE_KEY)
  return Reflect.get(getProto(target), 'size', target)
}

// add 代理
function add(this: SetTypes, value: unknown) {
  value = toRaw(value)
  const target = toRaw(this)
  const proto = getProto(target)
  const hadKey = proto.has.call(target, value)
  const result = proto.add.call(target, value)
  if (!hadKey) {
    // 如果添加操作成功，触发依赖的副作用
    trigger(target, TriggerOpTypes.ADD, value, value)
  }
  return result
}

// set 代理
function set(this: MapTypes, key: unknown, value: unknown) {
  value = toRaw(value)
  key = toRaw(key)
  const target = toRaw(this)
  const proto = getProto(target)
  const hadKey = proto.has.call(target, key)
  const oldValue = proto.get.call(target, key)
  const result = proto.set.call(target, key, value)
  if (!hadKey) {
    // 原先没有值，触发 add 更新操作
    trigger(target, TriggerOpTypes.ADD, key, value)
  } else if (hasChanged(value, oldValue)) {
    // 如果原先有值，但发生了改变，触发 set 更新操作
    trigger(target, TriggerOpTypes.SET, key, value, oldValue)
  }
  return result
}

// deleteEntry 代理
function deleteEntry(this: CollectionTypes, key: unknown) {
  const target = toRaw(this)
  const { has, get, delete: del } = getProto(target)
  let hadKey = has.call(target, key)
  if (!hadKey) {
    key = toRaw(key)
    hadKey = has.call(target, key)
  }
  const oldValue = get ? get.call(target, key) : undefined
  // forward the operation before queueing reactions
  const result = del.call(target, key)
  if (hadKey) {
    // 如果更新成功，触发 del 更新操作
    trigger(target, TriggerOpTypes.DELETE, key, undefined, oldValue)
  }
  return result
}

// clear 代理
function clear(this: IterableCollections) {
  const target = toRaw(this)
  const hadItems = target.size !== 0
  const oldTarget = __DEV__
    ? target instanceof Map
      ? new Map(target)
      : new Set(target)
    : undefined
  // forward the operation before queueing reactions
  const result = getProto(target).clear.call(target)
  if (hadItems) {
    // 如果包含元素，触发 clear 操作，清空依赖
    trigger(target, TriggerOpTypes.CLEAR, undefined, undefined, oldTarget)
  }
  return result
}

function createForEach(isReadonly: boolean) {
  return function forEach(
    this: IterableCollections,
    callback: Function,
    thisArg?: unknown
  ) {
    const observed = this
    const target = toRaw(observed)
    const wrap = isReadonly ? toReadonly : toReactive
    // 跟踪依赖，ITERATE
    track(target, TrackOpTypes.ITERATE, ITERATE_KEY)
    // important: create sure the callback is
    // 1. invoked with the reactive map as `this` and 3rd arg
    // 2. the value received should be a corresponding reactive/readonly.
    function wrappedCallback(value: unknown, key: unknown) {
      // 包装后的回掉中，遍历的参数值会被包装成响应式对象
      return callback.call(observed, wrap(value), wrap(key), observed)
    }
    return getProto(target).forEach.call(target, wrappedCallback, thisArg)
  }
}

// 遍历的代理逻辑
function createIterableMethod(method: string | symbol, isReadonly: boolean) {
  return function(this: IterableCollections, ...args: unknown[]) {
    const target = toRaw(this)
    const isPair =
      method === 'entries' ||
      (method === Symbol.iterator && target instanceof Map)
    const innerIterator = getProto(target)[method].apply(target, args)
    const wrap = isReadonly ? toReadonly : toReactive
    // 执行遍历操作时会被跟踪
    track(target, TrackOpTypes.ITERATE, ITERATE_KEY)
    // return a wrapped iterator which returns observed versions of the
    // values emitted from the real iterator
    // 返回包装过的遍历器，遍历返回的值都会被包装成响应式属性
    return {
      // iterator protocol
      next() {
        const { value, done } = innerIterator.next()
        return done
          ? { value, done }
          : {
              value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
              done
            }
      },
      // iterable protocol
      [Symbol.iterator]() {
        return this
      }
    }
  }
}

// 创建只读版本的方法
function createReadonlyMethod(
  method: Function,
  type: TriggerOpTypes
): Function {
  return function(this: CollectionTypes, ...args: unknown[]) {
    // 只读对象，需要额外地判断 LOCKED 是否为 true
    // 如果 LOCKED，则不能进行修改或删除
    // 什么时候会设置 LOCKED 为 true？
    if (LOCKED) {
      if (__DEV__) {
        const key = args[0] ? `on key "${args[0]}" ` : ``
        console.warn(
          `${capitalize(type)} operation ${key}failed: target is readonly.`,
          toRaw(this)
        )
      }
      return type === TriggerOpTypes.DELETE ? false : this
    } else {
      return method.apply(this, args)
    }
  }
}

// 集合对象这几个方法会被代理
// get, has, add, set, delete, clear, forEach
const mutableInstrumentations: Record<string, Function> = {
  get(this: MapTypes, key: unknown) {
    return get(this, key, toReactive)
  },
  get size() {
    return size((this as unknown) as IterableCollections)
  },
  has,
  add,
  set,
  delete: deleteEntry,
  clear,
  forEach: createForEach(false)
}

// 只读版本的区别在于这四个操作，这四个操作不能进行
// add, set, delete, clear
const readonlyInstrumentations: Record<string, Function> = {
  get(this: MapTypes, key: unknown) {
    return get(this, key, toReadonly)
  },
  get size(this: IterableCollections) {
    return size(this)
  },
  has,
  add: createReadonlyMethod(add, TriggerOpTypes.ADD),
  set: createReadonlyMethod(set, TriggerOpTypes.SET),
  delete: createReadonlyMethod(deleteEntry, TriggerOpTypes.DELETE),
  clear: createReadonlyMethod(clear, TriggerOpTypes.CLEAR),
  forEach: createForEach(true)
}

// 这几个遍历方法也会被代理
// keys, values, entries, Symbol.iterator
const iteratorMethods = ['keys', 'values', 'entries', Symbol.iterator]
iteratorMethods.forEach(method => {
  mutableInstrumentations[method as string] = createIterableMethod(
    method,
    false
  )
  readonlyInstrumentations[method as string] = createIterableMethod(
    method,
    true
  )
})

function createInstrumentationGetter(
  instrumentations: Record<string, Function>
) {
  return (
    target: CollectionTypes,
    key: string | symbol,
    receiver: CollectionTypes
  ) =>
    Reflect.get(
      // 满足这两个条件才会执行代理的逻辑
      // 1. 属于需要被代理的操作
      // 2. target 包含 key 属性
      hasOwn(instrumentations, key) && key in target
        ? instrumentations
        : target,
      key,
      receiver
    )
}

export const mutableCollectionHandlers: ProxyHandler<CollectionTypes> = {
  get: createInstrumentationGetter(mutableInstrumentations)
}

export const readonlyCollectionHandlers: ProxyHandler<CollectionTypes> = {
  get: createInstrumentationGetter(readonlyInstrumentations)
}
