/**
 * nextTick 在 2.0 中常常作为面试题，或者作为教科书般的实现，所以 3.0 是如何实现的？
 *
 * nextTick 的实现通过 promise 微任务来实现了，所以一行代码就搞定了
 * 这个文件能学习到的还有：
 * - 如何实现一个任务队列（调度器）？
 * - 出现递归可能的原因
 */
import { ErrorCodes, callWithErrorHandling } from './errorHandling'
import { isArray } from '@vue/shared'

const queue: (Function | null)[] = []
const postFlushCbs: Function[] = []
const p = Promise.resolve()

let isFlushing = false
let isFlushPending = false

const RECURSION_LIMIT = 100
type CountMap = Map<Function, number>

// 一行代码实现 nextTick ？
// promise 微任务来实现吗？
export function nextTick(fn?: () => void): Promise<void> {
  return fn ? p.then(fn) : p
}

// 用于将任务推进任务队列中，任务队列也是通过 nextTick 来实现的
export function queueJob(job: () => void) {
  if (!queue.includes(job)) {
    queue.push(job)
    queueFlush()
  }
}

// 取消队列任务的实现
export function invalidateJob(job: () => void) {
  const i = queue.indexOf(job)
  if (i > -1) {
    queue[i] = null
  }
}

// 没太懂这是干啥的？
// 安排刷完任务队列后执行的回调
// 什么时候回调用这个方法？
export function queuePostFlushCb(cb: Function | Function[]) {
  if (!isArray(cb)) {
    postFlushCbs.push(cb)
  } else {
    postFlushCbs.push(...cb)
  }
  queueFlush()
}

// flush queue
function queueFlush() {
  if (!isFlushing && !isFlushPending) {
    isFlushPending = true
    nextTick(flushJobs)
  }
}

// 删除重复任务
const dedupe = (cbs: Function[]): Function[] => [...new Set(cbs)]

// 刷 postFlushCbs
export function flushPostFlushCbs(seen?: CountMap) {
  if (postFlushCbs.length) {
    const cbs = dedupe(postFlushCbs)
    postFlushCbs.length = 0
    if (__DEV__) {
      seen = seen || new Map()
    }
    for (let i = 0; i < cbs.length; i++) {
      if (__DEV__) {
        checkRecursiveUpdates(seen!, cbs[i])
      }
      cbs[i]()
    }
  }
}

// 执行队列中所有任务
function flushJobs(seen?: CountMap) {
  isFlushPending = false
  isFlushing = true
  let job
  // 在开发环境，会进行递归检查
  if (__DEV__) {
    seen = seen || new Map()
  }
  while ((job = queue.shift()) !== undefined) {
    if (job === null) {
      continue
    }
    if (__DEV__) {
      // seen 是防止递归更新
      checkRecursiveUpdates(seen!, job)
    }
    callWithErrorHandling(job, null, ErrorCodes.SCHEDULER)
  }
  // 在 flush 完之后调用
  flushPostFlushCbs(seen)
  isFlushing = false
  // some postFlushCb queued jobs!
  // keep flushing until it drains.
  // 一些 postFlushCb 可能会排任务
  // 继续 flush 任务，直到刷完
  if (queue.length || postFlushCbs.length) {
    flushJobs(seen)
  }
}

// 递归检查很简单，就是用过一个计数map来实现
// 最大递归数为 100
function checkRecursiveUpdates(seen: CountMap, fn: Function) {
  if (!seen.has(fn)) {
    seen.set(fn, 1)
  } else {
    const count = seen.get(fn)!
    if (count > RECURSION_LIMIT) {
      // 可能出现递归的原因有：
      // 1. 在 render 函数中修改 state
      // 2. 在 updated hook 中修改 state
      // 3. 在 watcher 的 source 函数中修改了 state
      throw new Error(
        'Maximum recursive updates exceeded. ' +
          "You may have code that is mutating state in your component's " +
          'render function or updated hook or watcher source function.'
      )
    } else {
      seen.set(fn, count + 1)
    }
  }
}
