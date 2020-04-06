/**
 * 想查看运行时会处理的所有错误，可以参考：ErrorTypeStrings
 * 错误处理的方法无非两种：
 * 1. try...catch
 * 2. promise.catch
 * 分别用于同步和异步的逻辑
 * 所以如果明白以上两点，就没必要花时间看这个文件
 * 因为代码里会大量调用 callWithErrorHandling 和 callWithAsyncErrorHandling
 * 所以只要知道它们做了什么就够了，具体实现没什么好学习的
 *
 * callWithErrorHandling：= 直接调用 + try...catch
 * callWithAsyncErrorHandling = callWithErrorHandling + promise.catch
 * callWithAsyncErrorHandling：第一个参数可以是数组，如果是数组，则会遍历递归
 */
import { VNode } from './vnode'
import { ComponentInternalInstance, LifecycleHooks } from './component'
import { warn, pushWarningContext, popWarningContext } from './warning'
import { isPromise, isFunction } from '@vue/shared'

// contexts where user provided function may be executed, in addition to
// lifecycle hooks.
export const enum ErrorCodes {
  SETUP_FUNCTION,
  RENDER_FUNCTION,
  WATCH_GETTER,
  WATCH_CALLBACK,
  WATCH_CLEANUP,
  NATIVE_EVENT_HANDLER,
  COMPONENT_EVENT_HANDLER,
  DIRECTIVE_HOOK,
  TRANSITION_HOOK,
  APP_ERROR_HANDLER,
  APP_WARN_HANDLER,
  FUNCTION_REF,
  SCHEDULER
}

export const ErrorTypeStrings: Record<number | string, string> = {
  [LifecycleHooks.BEFORE_CREATE]: 'beforeCreate hook',
  [LifecycleHooks.CREATED]: 'created hook',
  [LifecycleHooks.BEFORE_MOUNT]: 'beforeMount hook',
  [LifecycleHooks.MOUNTED]: 'mounted hook',
  [LifecycleHooks.BEFORE_UPDATE]: 'beforeUpdate hook',
  [LifecycleHooks.UPDATED]: 'updated',
  [LifecycleHooks.BEFORE_UNMOUNT]: 'beforeUnmount hook',
  [LifecycleHooks.UNMOUNTED]: 'unmounted hook',
  [LifecycleHooks.ACTIVATED]: 'activated hook',
  [LifecycleHooks.DEACTIVATED]: 'deactivated hook',
  [LifecycleHooks.ERROR_CAPTURED]: 'errorCaptured hook',
  [LifecycleHooks.RENDER_TRACKED]: 'renderTracked hook',
  [LifecycleHooks.RENDER_TRIGGERED]: 'renderTriggered hook',
  [ErrorCodes.SETUP_FUNCTION]: 'setup function',
  [ErrorCodes.RENDER_FUNCTION]: 'render function',
  [ErrorCodes.WATCH_GETTER]: 'watcher getter',
  [ErrorCodes.WATCH_CALLBACK]: 'watcher callback',
  [ErrorCodes.WATCH_CLEANUP]: 'watcher cleanup function',
  [ErrorCodes.NATIVE_EVENT_HANDLER]: 'native event handler',
  [ErrorCodes.COMPONENT_EVENT_HANDLER]: 'component event handler',
  [ErrorCodes.DIRECTIVE_HOOK]: 'directive hook',
  [ErrorCodes.TRANSITION_HOOK]: 'transition hook',
  [ErrorCodes.APP_ERROR_HANDLER]: 'app errorHandler',
  [ErrorCodes.APP_WARN_HANDLER]: 'app warnHandler',
  [ErrorCodes.FUNCTION_REF]: 'ref function',
  [ErrorCodes.SCHEDULER]:
    'scheduler flush. This is likely a Vue internals bug. ' +
    'Please open an issue at https://new-issue.vuejs.org/?repo=vuejs/vue-next'
}

export type ErrorTypes = LifecycleHooks | ErrorCodes

// 核心逻辑就是用 try...catch 包了一下
// 如果抛错，就用 handleError 处理一下
// 有个意味是，它在哪些地方被使用了？
export function callWithErrorHandling(
  fn: Function,
  instance: ComponentInternalInstance | null,
  type: ErrorTypes,
  args?: unknown[]
) {
  let res
  try {
    res = args ? fn(...args) : fn()
  } catch (err) {
    handleError(err, instance, type)
  }
  return res
}

export function callWithAsyncErrorHandling(
  fn: Function | Function[],
  instance: ComponentInternalInstance | null,
  type: ErrorTypes,
  args?: unknown[]
): any[] {
  if (isFunction(fn)) {
    const res = callWithErrorHandling(fn, instance, type, args)
    // 如果函数返回值是 promise，则用 catch 方法处理错误
    if (res != null && !res._isVue && isPromise(res)) {
      res.catch((err: Error) => {
        handleError(err, instance, type)
      })
    }
    return res
  }

  const values = []
  for (let i = 0; i < fn.length; i++) {
    values.push(callWithAsyncErrorHandling(fn[i], instance, type, args))
  }
  return values
}

// 不管是同步或异步方法，都会使用这个函数来处理错误
// 错误类型可以参考：ErrorTypeStrings
export function handleError(
  err: Error,
  instance: ComponentInternalInstance | null,
  type: ErrorTypes
) {
  const contextVNode = instance ? instance.vnode : null
  if (instance) {
    let cur = instance.parent
    // the exposed instance is the render proxy to keep it consistent with 2.x
    const exposedInstance = instance.proxy
    // in production the hook receives only the error code
    const errorInfo = __DEV__ ? ErrorTypeStrings[type] : type
    while (cur) {
      const errorCapturedHooks = cur.ec
      if (errorCapturedHooks !== null) {
        for (let i = 0; i < errorCapturedHooks.length; i++) {
          if (errorCapturedHooks[i](err, exposedInstance, errorInfo)) {
            return
          }
        }
      }
      cur = cur.parent
    }
    // app-level handling
    const appErrorHandler = instance.appContext.config.errorHandler
    if (appErrorHandler) {
      callWithErrorHandling(
        appErrorHandler,
        null,
        ErrorCodes.APP_ERROR_HANDLER,
        [err, exposedInstance, errorInfo]
      )
      return
    }
  }
  logError(err, type, contextVNode)
}

// Test-only toggle for testing the unhandled warning behavior
let forceRecover = false
export function setErrorRecovery(value: boolean) {
  forceRecover = value
}

// 打印错误？
function logError(err: Error, type: ErrorTypes, contextVNode: VNode | null) {
  // default behavior is crash in prod & test, recover in dev.
  if (__DEV__ && (forceRecover || !__TEST__)) {
    const info = ErrorTypeStrings[type]
    // 这是干啥？
    if (contextVNode) {
      pushWarningContext(contextVNode)
    }
    warn(`Unhandled error${info ? ` during execution of ${info}` : ``}`)
    console.error(err)
    if (contextVNode) {
      popWarningContext()
    }
  } else {
    // 生产或测试环境就直接抛错了
    throw err
  }
}
