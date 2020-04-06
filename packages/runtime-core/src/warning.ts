/**
 * 主要是实现了 warn 函数，用于打印发生的错误
 * 如果不是想自己实现一个 warn 函数，就没必要花时间看这个文件的代码
 */
import { VNode } from './vnode'
import { Data, ComponentInternalInstance, Component } from './component'
import { isString, isFunction } from '@vue/shared'
import { toRaw, isRef, pauseTracking, resetTracking } from '@vue/reactivity'
import { callWithErrorHandling, ErrorCodes } from './errorHandling'

type ComponentVNode = VNode & {
  type: Component
}

const stack: VNode[] = []

type TraceEntry = {
  vnode: ComponentVNode
  recurseCount: number
}

type ComponentTraceStack = TraceEntry[]

export function pushWarningContext(vnode: VNode) {
  stack.push(vnode)
}

export function popWarningContext() {
  stack.pop()
}

// 运行时抛错都是通过这个来的
// 其实没啥好看的，就是打印错误
// 能学习到的东西有：
// 1. 可以通过 config 的 warnHandler 设置错误处理器
// 2. 如何获取错误栈，以及如何格式化错误栈
export function warn(msg: string, ...args: any[]) {
  // avoid props formatting or warn handler tracking deps that might be mutated
  // during patch, leading to infinite recursion.
  // 避免 props 格式化或者 warn 处理器跟踪依赖，导致无限递归
  pauseTracking()

  const instance = stack.length ? stack[stack.length - 1].component : null
  // 所以可以通过 config 的 warnHandler 设置警告处理器
  const appWarnHandler = instance && instance.appContext.config.warnHandler
  const trace = getComponentTrace()

  if (appWarnHandler) {
    callWithErrorHandling(
      appWarnHandler,
      instance,
      ErrorCodes.APP_WARN_HANDLER,
      [
        msg + args.join(''),
        instance && instance.proxy,
        trace
          .map(({ vnode }) => `at <${formatComponentName(vnode)}>`)
          .join('\n'),
        trace
      ]
    )
  } else {
    const warnArgs = [`[Vue warn]: ${msg}`, ...args]
    if (
      trace.length &&
      // avoid spamming console during tests
      !__TEST__
    ) {
      warnArgs.push(`\n`, ...formatTrace(trace))
    }
    console.warn(...warnArgs)
  }

  resetTracking()
}

// 获取组件错误栈
// 其实就是返回了发生错误的虚拟节点树分支
// 有个特殊的处理就是如果发生错误的 vnode，它的父级和它相同，被视为递归掉用？
// 但我想不出来什么时候会发生这种事？
function getComponentTrace(): ComponentTraceStack {
  let currentVNode: VNode | null = stack[stack.length - 1]
  if (!currentVNode) {
    return []
  }

  // we can't just use the stack because it will be incomplete during updates
  // that did not start from the root. Re-construct the parent chain using
  // instance parent pointers.
  const normalizedStack: ComponentTraceStack = []

  while (currentVNode) {
    const last = normalizedStack[0]
    if (last && last.vnode === currentVNode) {
      last.recurseCount++
    } else {
      normalizedStack.push({
        vnode: currentVNode as ComponentVNode,
        recurseCount: 0
      })
    }
    const parentInstance: ComponentInternalInstance | null = currentVNode.component!
      .parent
    currentVNode = parentInstance && parentInstance.vnode
  }

  return normalizedStack
}

function formatTrace(trace: ComponentTraceStack): any[] {
  const logs: any[] = []
  trace.forEach((entry, i) => {
    logs.push(...(i === 0 ? [] : [`\n`]), ...formatTraceEntry(entry))
  })
  return logs
}

function formatTraceEntry({ vnode, recurseCount }: TraceEntry): any[] {
  const postfix =
    recurseCount > 0 ? `... (${recurseCount} recursive calls)` : ``
  const open = ` at <${formatComponentName(vnode)}`
  const close = `>` + postfix
  const rootLabel = vnode.component!.parent == null ? `(Root)` : ``
  return vnode.props
    ? [open, ...formatProps(vnode.props), close, rootLabel]
    : [open + close, rootLabel]
}

const classifyRE = /(?:^|[-_])(\w)/g
const classify = (str: string): string =>
  str.replace(classifyRE, c => c.toUpperCase()).replace(/[-_]/g, '')

function formatComponentName(vnode: ComponentVNode, file?: string): string {
  const Component = vnode.type as Component
  let name = isFunction(Component)
    ? Component.displayName || Component.name
    : Component.name
  if (!name && file) {
    const match = file.match(/([^/\\]+)\.vue$/)
    if (match) {
      name = match[1]
    }
  }
  return name ? classify(name) : 'Anonymous'
}

function formatProps(props: Data): any[] {
  const res: any[] = []
  const keys = Object.keys(props)
  keys.slice(0, 3).forEach(key => {
    res.push(...formatProp(key, props[key]))
  })
  if (keys.length > 3) {
    res.push(` ...`)
  }
  return res
}

function formatProp(key: string, value: unknown): any[]
function formatProp(key: string, value: unknown, raw: true): any
function formatProp(key: string, value: unknown, raw?: boolean): any {
  if (isString(value)) {
    value = JSON.stringify(value)
    return raw ? value : [`${key}=${value}`]
  } else if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value == null
  ) {
    return raw ? value : [`${key}=${value}`]
  } else if (isRef(value)) {
    value = formatProp(key, toRaw(value.value), true)
    return raw ? value : [`${key}=Ref<`, value, `>`]
  } else if (isFunction(value)) {
    return [`${key}=fn${value.name ? `<${value.name}>` : ``}`]
  } else {
    value = toRaw(value)
    return raw ? value : [`${key}=`, value]
  }
}
