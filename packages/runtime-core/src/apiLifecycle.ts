/**
 * 一共有哪些生命周期？（可以通过 component.ts - LifecycleHooks 的定义了解）
 * onActivated
 * onDeactivated
 * onErrorCaptured
 * onRenderTriggered
 * onRenderTracked
 * onBeforeMount
 * onMounted
 * onBeforeUpdate
 * onUpdated
 * onBeforeUnmount
 * onUnmounted
 *
 * created 和 beforeCreate 去哪了？
 * 搜了下，好像这两个 hook 没了？？？？？？？？？？？？？惊呆了，等等，让我仔细思考下还需要它们倆吗？
 * 首先要确定在 2.0 create 阶段发生了什么？
 *
 * 和 Vue 2.0 相比有哪些变化？
 * renderTriggered 和 tracked 是新增的，但不知道用户是否能够设置这两个 hook
 * onErrorCaptured，这个 2.0 就有吗？
 *
 * 这个文件包含用户可调用的组件生命周期注入函数
 * 可以学习到当你设置某个 hook 时，会发生什么？设置 hook 有哪些限制？
 * 比较重要的是，hook 不会被视为观察者或响应式属性的副作用
 */
import {
  ComponentInternalInstance,
  LifecycleHooks,
  currentInstance,
  setCurrentInstance,
  isInSSRComponentSetup
} from './component'
import { ComponentPublicInstance } from './componentProxy'
import { callWithAsyncErrorHandling, ErrorTypeStrings } from './errorHandling'
import { warn } from './warning'
import { capitalize } from '@vue/shared'
import { pauseTracking, resetTracking, DebuggerEvent } from '@vue/reactivity'

export { onActivated, onDeactivated } from './components/KeepAlive'

// 给组件实例注入 hook，应该所有 hook 都是调用这个方法来注入的吧？
// 参数解释：
// type: hook 的类型，对于每种 hook，组件都有一个 hooks 数组用于存放
// hook：注入的 hook 函数
// target：注入的目标对象，组件实例
// prepend：默认会将新注入的 hook，添加到 hooks 数组尾部，如果 prepend 为 true，则添加到数组头部
export function injectHook(
  type: LifecycleHooks,
  hook: Function & { __weh?: Function },
  target: ComponentInternalInstance | null = currentInstance,
  prepend: boolean = false
) {
  if (target) {
    const hooks = target[type] || (target[type] = [])
    // cache the error handling wrapper for injected hooks so the same hook
    // can be properly deduped by the scheduler. "__weh" stands for "with error
    // handling".
    // 每个 hook，都会被包装成 weh，进行错误处理
    const wrappedHook =
      hook.__weh ||
      (hook.__weh = (...args: unknown[]) => {
        // 如果未挂则，则返回
        if (target.isUnmounted) {
          return
        }
        // disable tracking inside all lifecycle hooks
        // since they can potentially be called inside effects.
        // 暂停跟踪，即收集依赖行为
        // 所以为什么呢？
        // 这样 hook 就不会被认为是观察者，或者说副作用
        // 否则在 hook 内部访问过的响应式属性，如果更新了值，都会调用 hook
        // 如何去验证？
        pauseTracking()
        // Set currentInstance during hook invocation.
        // This assumes the hook does not synchronously trigger other hooks, which
        // can only be false when the user does something really funky.
        // 设置触发的 target 为当前实例
        // 这个操作，意味着做出了一个假设，即不会同时触发两个 hook
        // 除非用户做了什么奇怪的行为
        setCurrentInstance(target)
        const res = callWithAsyncErrorHandling(hook, target, type, args)
        setCurrentInstance(null)
        resetTracking()
        return res
      })
    if (prepend) {
      hooks.unshift(wrappedHook)
    } else {
      hooks.push(wrappedHook)
    }
  } else if (__DEV__) {
    // 这块其实很有意思，有意思的在于什么时候回丢失 target？
    // 看底下的 warn，意思是“声明周期注入接口只能在 setup 方法中被调用
    // 所以是不是可以这么理解？在 setup 之外调用生命周期注入接口，将会丢失 target，其实就是上下文
    // 如果开启了 ”suspense“ 特性，会提示 ”如果你再使用 async setup，确认在第一次调用 await 声明前注册生命周期“
    // 我的理解是，setup 里注册生命周期，也必须在异步行为之前，因为组件的实例化是同步进行的，这里还待确认
    const apiName = `on${capitalize(
      ErrorTypeStrings[type].replace(/ hook$/, '')
    )}`
    warn(
      `${apiName} is called when there is no active component instance to be ` +
        `associated with. ` +
        `Lifecycle injection APIs can only be used during execution of setup().` +
        (__FEATURE_SUSPENSE__
          ? ` If you are using async setup(), make sure to register lifecycle ` +
            `hooks before the first await statement.`
          : ``)
    )
  }
}

// 创建 hook，比 injectHook 多了一个限制判断
// 只有是非 SSR 组件的 setup 中才会注入 hook
// 这个限制用于这些 hook：
// beforeMount, mounted, beforeUpdate, updated, beforeUnmount, unmounted, renderTriggered, renderTracked
export const createHook = <T extends Function = () => any>(
  lifecycle: LifecycleHooks
) => (hook: T, target: ComponentInternalInstance | null = currentInstance) =>
  // post-create lifecycle registrations are noops during SSR
  !isInSSRComponentSetup && injectHook(lifecycle, hook, target)

export const onBeforeMount = createHook(LifecycleHooks.BEFORE_MOUNT)
export const onMounted = createHook(LifecycleHooks.MOUNTED)
export const onBeforeUpdate = createHook(LifecycleHooks.BEFORE_UPDATE)
export const onUpdated = createHook(LifecycleHooks.UPDATED)
export const onBeforeUnmount = createHook(LifecycleHooks.BEFORE_UNMOUNT)
export const onUnmounted = createHook(LifecycleHooks.UNMOUNTED)

export type DebuggerHook = (e: DebuggerEvent) => void
export const onRenderTriggered = createHook<DebuggerHook>(
  LifecycleHooks.RENDER_TRIGGERED
)
export const onRenderTracked = createHook<DebuggerHook>(
  LifecycleHooks.RENDER_TRACKED
)

export type ErrorCapturedHook = (
  err: Error,
  instance: ComponentPublicInstance | null,
  info: string
) => boolean | void

export const onErrorCaptured = (
  hook: ErrorCapturedHook,
  target: ComponentInternalInstance | null = currentInstance
) => {
  injectHook(LifecycleHooks.ERROR_CAPTURED, hook, target)
}
