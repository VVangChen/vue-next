/**
 * this.$watch 的实现
 * watch 方法有两种重载方式：
 * 1. simple watch
 * 2. vue 暴露的 watch 接口
 *
 * 问题：
 * - simple watch 在什么时候会被使用？
 * - 它和普通的 watch 区别在哪？如果区别很大，为什么还叫 watch ？
 */
import {
  effect,
  stop,
  isRef,
  Ref,
  ComputedRef,
  ReactiveEffectOptions
} from '@vue/reactivity'
import { queueJob } from './scheduler'
import {
  EMPTY_OBJ,
  isObject,
  isArray,
  isFunction,
  isString,
  hasChanged,
  NOOP,
  remove
} from '@vue/shared'
import {
  currentInstance,
  ComponentInternalInstance,
  currentSuspense,
  Data,
  isInSSRComponentSetup,
  recordInstanceBoundEffect
} from './component'
import {
  ErrorCodes,
  callWithErrorHandling,
  callWithAsyncErrorHandling
} from './errorHandling'
import { onBeforeUnmount } from './apiLifecycle'
import { queuePostRenderEffect } from './renderer'
import { warn } from './warning'

export type WatchEffect = (onInvalidate: InvalidateCbRegistrator) => void

export type WatchSource<T = any> = Ref<T> | ComputedRef<T> | (() => T)

export type WatchCallback<V = any, OV = any> = (
  value: V,
  oldValue: OV,
  onInvalidate: InvalidateCbRegistrator
) => any

type MapSources<T> = {
  [K in keyof T]: T[K] extends WatchSource<infer V> ? V : never
}

type MapOldSources<T, Immediate> = {
  [K in keyof T]: T[K] extends WatchSource<infer V>
    ? Immediate extends true ? (V | undefined) : V
    : never
}

type InvalidateCbRegistrator = (cb: () => void) => void

export interface BaseWatchOptions {
  flush?: 'pre' | 'post' | 'sync'
  onTrack?: ReactiveEffectOptions['onTrack']
  onTrigger?: ReactiveEffectOptions['onTrigger']
}

export interface WatchOptions<Immediate = boolean> extends BaseWatchOptions {
  immediate?: Immediate
  deep?: boolean
}

export type StopHandle = () => void

const invoke = (fn: Function) => fn()

// 创建 watch 副作用？
// 这个什么时候回被调用
// Simple effect.
export function watchEffect(
  effect: WatchEffect,
  options?: BaseWatchOptions
): StopHandle {
  // 不设置回调？
  // 直接观察 watchEffct？
  return doWatch(effect, null, options)
}

// initial value for watchers to trigger on undefined initial values
const INITIAL_WATCHER_VALUE = {}

// 两种 watch 重载
// overload #1: single source + cb
export function watch<T, Immediate extends Readonly<boolean> = false>(
  source: WatchSource<T>,
  cb: WatchCallback<T, Immediate extends true ? (T | undefined) : T>,
  options?: WatchOptions<Immediate>
): StopHandle

// overload #2: array of multiple sources + cb
// Readonly constraint helps the callback to correctly infer value types based
// on position in the source array. Otherwise the values will get a union type
// of all possible value types.
export function watch<
  T extends Readonly<WatchSource<unknown>[]>,
  Immediate extends Readonly<boolean> = false
>(
  sources: T,
  cb: WatchCallback<MapSources<T>, MapOldSources<T, Immediate>>,
  options?: WatchOptions<Immediate>
): StopHandle

// implementation
export function watch<T = any>(
  source: WatchSource<T> | WatchSource<T>[],
  cb: WatchCallback<T>,
  options?: WatchOptions
): StopHandle {
  if (__DEV__ && !isFunction(cb)) {
    warn(
      `\`watch(fn, options?)\` signature has been moved to a separate API. ` +
        `Use \`watchEffect(fn, options?)\` instead. \`watch\` now only ` +
        `supports \`watch(source, cb, options?) signature.`
    )
  }
  return doWatch(source, cb, options)
}

// watch 的内部实现
// source 表示观察的对象
// cb 表示观察的回调
// options...
function doWatch(
  source: WatchSource | WatchSource[] | WatchEffect,
  cb: WatchCallback | null,
  { immediate, deep, flush, onTrack, onTrigger }: WatchOptions = EMPTY_OBJ
): StopHandle {
  // cb 不传会是什么效果？
  // 在什么时候不传 cb ？
  if (__DEV__ && !cb) {
    if (immediate !== undefined) {
      // immediate 和 deep 希望被用于传了 cb 的情况
      warn(
        `watch() "immediate" option is only respected when using the ` +
          `watch(source, callback, options?) signature.`
      )
    }
    if (deep !== undefined) {
      warn(
        `watch() "deep" option is only respected when using the ` +
          `watch(source, callback, options?) signature.`
      )
    }
  }

  const instance = currentInstance
  const suspense = currentSuspense // 挂起的？这是什么？

  // 分情况给 getter 赋值
  // getter 是什么？
  let getter: () => any
  // 观察源是个数组
  if (isArray(source)) {
    getter = () =>
      source.map(
        s =>
          // 观察源数组中的元素必须是 ref 类型？
          isRef(s)
            ? s.value
            : callWithErrorHandling(s, instance, ErrorCodes.WATCH_GETTER)
      )
  } else if (isRef(source)) { // 观察源是 ref
    getter = () => source.value
  } else if (cb) { // 都不是但有 cb 直接调用 source ？这和兜底逻辑有什么区别？
    // getter with cb
    getter = () =>
      callWithErrorHandling(source, instance, ErrorCodes.WATCH_GETTER)
  } else {
    // 没有 cb，被认为是简单的副作用？估计得看到下面才能理解
    // no cb -> simple effect
    getter = () => {
      // 如果未挂载直接返回
      if (instance && instance.isUnmounted) {
        return
      }
      // 如果 cleanup 有值，直接执行？
      // 它是干嘛的？
      if (cleanup) {
        cleanup()
      }
      // 如果没有设置回调会直接调用
      return callWithErrorHandling(
        source,
        instance,
        ErrorCodes.WATCH_CALLBACK,
        [onInvalidate]
      )
    }
  }

  // 如果是 deep，且传了 cb
  if (cb && deep) {
    const baseGetter = getter
    getter = () => traverse(baseGetter())
  }
  // getter 初始化/赋值结束

  let cleanup: Function
  // cleanup 只有在 invalidate 时被赋值
  // 失效事件的 handler
  const onInvalidate: InvalidateCbRegistrator = (fn: () => void) => {
    // cleanup 调用了注册 invalidate 事件是，传的回调
    cleanup = runner.options.onStop = () => {
      callWithErrorHandling(fn, instance, ErrorCodes.WATCH_CLEANUP)
    }
  }

  // 在 node SSR 中，不会被设置 effect，返回 noop
  // 如果是 simple watch / immediate 为 true，直接调用 source 或 cb
  // in SSR there is no need to setup an actual effect, and it should be noop
  // unless it's eager
  // 有挺多全局变量的，得记下来
  if (__NODE_JS__ && isInSSRComponentSetup) {
    if (!cb) {
      getter()
    } else if (immediate) {
      callWithAsyncErrorHandling(cb, instance, ErrorCodes.WATCH_CALLBACK, [
        getter(),
        undefined,
        onInvalidate
      ])
    }
    return NOOP
  }

  let oldValue = isArray(source) ? [] : INITIAL_WATCHER_VALUE
  // 这是干什么用的？
  // watch 更新值时执行逻辑
  const applyCb = cb
    ? () => {
        if (instance && instance.isUnmounted) {
          return
        }
        const newValue = runner()
        if (deep || hasChanged(newValue, oldValue)) {
          // cleanup before running cb again
          if (cleanup) {
            cleanup()
          }
          callWithAsyncErrorHandling(cb, instance, ErrorCodes.WATCH_CALLBACK, [
            newValue,
            // pass undefined as the old value when it's changed for the first time
            oldValue === INITIAL_WATCHER_VALUE ? undefined : oldValue,
            onInvalidate
          ])
          oldValue = newValue
        }
      }
    : void 0

  // 分情况设置调度器
  let scheduler: (job: () => any) => void
  // 什么时候会设置 flush 为 sync / pre
  if (flush === 'sync') {
    // 同步就是直接调用
    scheduler = invoke
  } else if (flush === 'pre') {
    // 没太看懂 pre 目的是什么？
    scheduler = job => {
      if (!instance || instance.vnode.el != null) {
        queueJob(job)
      } else {
        // with 'pre' option, the first call must happen before
        // the component is mounted so it is called synchronously.
        job()
      }
    }
  } else {
    // 大部分情况？
    // 会安排任务在渲染副作用之后？
    scheduler = job => {
      queuePostRenderEffect(job, suspense)
    }
  }

  const runner = effect(getter, {
    lazy: true,
    // so it runs before component update effects in pre flush mode
    computed: true,
    onTrack,
    onTrigger,
    scheduler: applyCb ? () => scheduler(applyCb) : scheduler
  })

  recordInstanceBoundEffect(runner)

  // 如果有传 cb，且 immdiate 为 true，立即执行回调
  // 如果没传 cb，则立即执行副作用
  // 这一步主要是为了注册依赖
  // initial run
  if (applyCb) {
    if (immediate) {
      applyCb()
    } else {
      oldValue = runner()
    }
  } else {
    runner()
  }

  // stop handle 执行逻辑
  // 设置 runner 为 !active
  // 移除实例所有副作用
  return () => {
    stop(runner)
    if (instance) {
      remove(instance.effects!, runner)
    }
  }
}

// this.$watch
export function instanceWatch(
  this: ComponentInternalInstance,
  source: string | Function,
  cb: Function,
  options?: WatchOptions
): StopHandle {
  // 上下文是组件实例的 proxy
  const ctx = this.proxy as Data
  const getter = isString(source) ? () => ctx[source] : source.bind(ctx)
  const stop = watch(getter, cb.bind(ctx), options)
  // 会在组件 beforeUnmount 时自动停止
  onBeforeUnmount(stop, this)
  return stop
}

// 不知道遍历是做什么？
// 这个函数的逻辑就是递归遍历传入的对象/数组/map/set参数
// 把所有值都塞到 seen 里，问题是 seen 没被任何地方用到
// traverse 只在指定了 deep 时被使用，在 deep 的 getter 中被调用，但并没有传入 seen 值
// 没看懂作者想做什么
// -------
// 懂了，如果 source 是深层对象，需要递归的进行访问，以便能注册依赖
function traverse(value: unknown, seen: Set<unknown> = new Set()) {
  if (!isObject(value) || seen.has(value)) {
    return
  }
  seen.add(value)
  if (isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      traverse(value[i], seen)
    }
  } else if (value instanceof Map) {
    value.forEach((v, key) => {
      // to register mutation dep for existing keys
      traverse(value.get(key), seen)
    })
  } else if (value instanceof Set) {
    value.forEach(v => {
      traverse(v, seen)
    })
  } else {
    for (const key in value) {
      traverse(value[key], seen)
    }
  }
  return value
}
