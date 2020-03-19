/**
 * Effect 定义了响应式属性的副作用 -> 依赖方的值更新
 * 这个文件包含 Effect 相关函数：
 * 1. 创建 Effect
 * 2. track 跟踪依赖
 * 3. trigger 触发 Effect 执行
 * 4. 其他类型定义和判断方法
 */
import { TrackOpTypes, TriggerOpTypes } from './operations'
import { EMPTY_OBJ, extend, isArray } from '@vue/shared'

// 忘了 vue 2 是怎么关联依赖方和被依赖方
// vue 3 使用了 weakMap 储存了 target -> key -> dep 这样一个映射
// 目的是为了降低内存负担
// The main WeakMap that stores {target -> key -> dep} connections.
// Conceptually, it's easier to think of a dependency as a Dep class
// which maintains a Set of subscribers, but we simply store them as
// raw Sets to reduce memory overhead.
type Dep = Set<ReactiveEffect>
type KeyToDepMap = Map<any, Dep>
// 这里有个疑问是为什么用了 weak map ？
const targetMap = new WeakMap<any, KeyToDepMap>()

export interface ReactiveEffect<T = any> {
  (): T
  _isEffect: true
  active: boolean
  raw: () => T
  deps: Array<Dep> // 副作用包含 deps，记录自己的依赖
  options: ReactiveEffectOptions
}

export interface ReactiveEffectOptions {
  lazy?: boolean // 对应于 !immediate?
  computed?: boolean
  scheduler?: (run: Function) => void // 执行副作用时，如果有scheduler，通过 scheduler 执行
  onTrack?: (event: DebuggerEvent) => void // dev
  onTrigger?: (event: DebuggerEvent) => void // dev
  onStop?: () => void
}

export type DebuggerEvent = {
  effect: ReactiveEffect
  target: object
  type: TrackOpTypes | TriggerOpTypes
  key: any
} & DebuggerEventExtraInfo

export interface DebuggerEventExtraInfo {
  newValue?: any
  oldValue?: any
  oldTarget?: Map<any, any> | Set<any>
}

// 这个栈是做什么用的？
const effectStack: ReactiveEffect[] = []
export let activeEffect: ReactiveEffect | undefined

export const ITERATE_KEY = Symbol('iterate')

// 副作用函数包含属性 _isEffect
export function isEffect(fn: any): fn is ReactiveEffect {
  return fn != null && fn._isEffect === true
}

// 暴露出去的接口，用于创建副作用
export function effect<T = any>(
  fn: () => T,
  options: ReactiveEffectOptions = EMPTY_OBJ
): ReactiveEffect<T> {
  if (isEffect(fn)) {
    fn = fn.raw
  }
  const effect = createReactiveEffect(fn, options)
  if (!options.lazy) {
    effect()
  }
  return effect
}

// 不知道什么时候回调？
export function stop(effect: ReactiveEffect) {
  if (effect.active) {
    cleanup(effect)
    if (effect.options.onStop) {
      effect.options.onStop()
    }
    effect.active = false
  }
}

// 创建响应式副作用
function createReactiveEffect<T = any>(
  fn: () => T,
  options: ReactiveEffectOptions
): ReactiveEffect<T> {
  const effect = function reactiveEffect(...args: unknown[]): unknown {
    return run(effect, fn, args)
  } as ReactiveEffect
  effect._isEffect = true
  effect.active = true
  effect.raw = fn
  effect.deps = []
  effect.options = options
  return effect
}

// effect 的执行逻辑，创建 effect 时会指定一个函数，用于依赖更新时执行，比如 computed，watcher 等
function run(effect: ReactiveEffect, fn: Function, args: unknown[]): unknown {
  // effect 处于非活跃状态
  if (!effect.active) {
    return fn(...args)
  }

  // 这里没看明白？
  // 如果 effect 处于活跃状态
  // effect 栈又不包含 effect，栈是干嘛的？
  // 使用栈应该是为了模拟嵌套的依赖，比如一个 computed 里依赖了另外一个 computed
  if (!effectStack.includes(effect)) {
    // 清理 effect 依赖
    // 重新进行计算和收集依赖
    cleanup(effect)
    try {
      enableTracking()
      effectStack.push(effect)
      activeEffect = effect
      return fn(...args)
    } finally {
      effectStack.pop()
      resetTracking()
      // 如果执行完了，设置栈中上一个元素作为当前活跃的副作用
      activeEffect = effectStack[effectStack.length - 1]
    }
  }
}

// 清理 effect 的依赖
function cleanup(effect: ReactiveEffect) {
  const { deps } = effect
  if (deps.length) {
    for (let i = 0; i < deps.length; i++) {
      deps[i].delete(effect)
    }
    deps.length = 0
  }
}

// shouldTrack 表示当前执行的副作用是否需要收集依赖
let shouldTrack = true
// trackStack 是干嘛用的？在哪被用到？
const trackStack: boolean[] = []

export function pauseTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = false
}

// 其实没太看明白的是为什么要先推入，再设值？
// shouldTrack 表示当前执行的副作用是否需要收集依赖
// 所以设值，设的是当前副作用
// 推入的是上一个被执行的副作用，就是调用栈的上层副作用
export function enableTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = true
}

export function resetTracking() {
  const last = trackStack.pop()
  shouldTrack = last === undefined ? true : last
}

/**
 * !important
 * 为响应式副作用收集依赖
 *
 * @param target 被访问的对象
 * @param type 跟踪类型
 * @param key 被访问的key
 */
// 现在“跟踪“被视为一个副作用，确实
// 在 2.0 这叫 ”收集依赖“ ？
export function track(target: object, type: TrackOpTypes, key: unknown) {
  // 两种情况不进行跟踪
  // 1. 不应该跟踪？
  // 2. activeEffect === undefined ？activeEffect 是什么？
  if (!shouldTrack || activeEffect === undefined) {
    return
  }
  // reactive key => Set<Effect>
  // depsMap 通过对象的 key 值，返回 key 的依赖方，就是副作用集合
  let depsMap = targetMap.get(target)
  if (depsMap === void 0) {
    targetMap.set(target, (depsMap = new Map()))
  }
  let dep = depsMap.get(key)
  if (dep === void 0) {
    depsMap.set(key, (dep = new Set()))
  }
  // activeEffect 在哪里被创建？
  // 首先需要明确的是，dep依赖这里是指谁的依赖？谁依赖这个 dep
  // 在 vue3 中，依赖方被称作 Effect，比如 computed
  // 在 vue2 中，被称作 observer？
  if (!dep.has(activeEffect)) {
    dep.add(activeEffect)
    activeEffect.deps.push(dep)

    // 当依赖被跟踪，在开发环境会调用 effect 的 onTrack，是给 devTools 用的吗？
    if (__DEV__ && activeEffect.options.onTrack) {
      activeEffect.options.onTrack({
        effect: activeEffect,
        target,
        type,
        key
      })
    }
  }
}

// 更新依赖方的值？
// 收集依赖当前变化的响应式属性的依赖方，依赖方是一个响应式副作用
// 安排并执行这些副作用
export function trigger(
  target: object,
  type: TriggerOpTypes,
  key?: unknown,
  newValue?: unknown,
  oldValue?: unknown,
  oldTarget?: Map<unknown, unknown> | Set<unknown>
) {
  const depsMap = targetMap.get(target)
  if (depsMap === void 0) {
    // never been tracked
    return
  }
  const effects = new Set<ReactiveEffect>()
  const computedRunners = new Set<ReactiveEffect>()
  // 开始收集需要执行的更新副作用？
  if (type === TriggerOpTypes.CLEAR) {
    // 集合被清理，会轮询添加所有元素的依赖方
    // collection being cleared
    // trigger all effects for target
    depsMap.forEach(dep => { // 这个 dep 是 set<effect>，不太懂为什么叫 dep？
      addRunners(effects, computedRunners, dep)
    })
  } else if (key === 'length' && isArray(target)) {
    // 数组的长度发生改变时，或者数组长度增加时，会执行依赖数组长度属性的副作用
    depsMap.forEach((dep, key) => {
      if (key === 'length' || key >= (newValue as number)) {
        addRunners(effects, computedRunners, dep)
      }
    })
  } else {
    // 安排 set/add/delete 三种操作的 runners
    // schedule runs for SET | ADD | DELETE
    if (key !== void 0) {
      addRunners(effects, computedRunners, depsMap.get(key))
    }
    // 这里没太看明白
    // 是说一些操作可能会影响 length 这种迭代相关的 key 值
    // 所以需要添加相应的副作用？
    // also run for iteration key on ADD | DELETE | Map.SET
    // 是不是意味着，可以通过依赖 length 或者 ITERATE_KEY 来实现下面这三种操作的强制更新？
    if (
      type === TriggerOpTypes.ADD ||
      (type === TriggerOpTypes.DELETE && !isArray(target)) ||
      (type === TriggerOpTypes.SET && target instanceof Map)
    ) {
      const iterationKey = isArray(target) ? 'length' : ITERATE_KEY
      addRunners(effects, computedRunners, depsMap.get(iterationKey))
    }
  }
  // 看看副作用具体是怎么执行的
  const run = (effect: ReactiveEffect) => {
    scheduleRun(
      effect,
      target,
      type,
      key,
      __DEV__
        ? {
            newValue,
            oldValue,
            oldTarget
          }
        : undefined
    )
  }
  // computed Effect 优先级高于其他对象，因为 computed 本身也可能是一个依赖
  // Important: computed effects must be run first so that computed getters
  // can be invalidated before any normal effects that depend on them are run.
  computedRunners.forEach(run)
  effects.forEach(run)
}

// 遍历安排多个副作用
function addRunners(
  effects: Set<ReactiveEffect>,
  computedRunners: Set<ReactiveEffect>,
  effectsToAdd: Set<ReactiveEffect> | undefined
) {
  if (effectsToAdd !== void 0) {
    effectsToAdd.forEach(effect => {
      if (effect !== activeEffect || !shouldTrack) {
        if (effect.options.computed) {
          computedRunners.add(effect)
        } else {
          effects.add(effect)
        }
      } else {
        // the effect mutated its own dependency during its execution.
        // this can be caused by operations like foo.value++
        // do not trigger or we end in an infinite loop
      }
    })
  }
}

// 副作用的安排执行逻辑，实际调用的是 run 方法
function scheduleRun(
  effect: ReactiveEffect,
  target: object,
  type: TriggerOpTypes,
  key: unknown,
  extraInfo?: DebuggerEventExtraInfo
) {
  if (__DEV__ && effect.options.onTrigger) {
    const event: DebuggerEvent = {
      effect,
      target,
      key,
      type
    }
    effect.options.onTrigger(extraInfo ? extend(event, extraInfo) : event)
  }
  // 如果副作用有设置 scheduler，则通过 scheduler 执行，比如 wacher？
  if (effect.options.scheduler !== void 0) {
    effect.options.scheduler(effect)
  } else {
    // 所以副作用本质是个函数？？？
    effect()
  }
}
