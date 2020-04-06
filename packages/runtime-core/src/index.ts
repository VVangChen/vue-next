/**
 * 你可以学习到:
 * 1. runtime-core 包含哪些部分？
 * 2. 每个部分包含什么？
 * 3. 一些公共的 API 是如何实现的？比如生命周期、computed、watch 等
 */

// runtime-core 第一部分：公共 API
// Public API ------------------------------------------------------------------
// 所以 __VERSION__ 是在哪赋值的？
export const version = __VERSION__
export {
  ref,
  unref,
  shallowRef,
  isRef,
  toRefs,
  reactive,
  isReactive,
  readonly,
  isReadonly,
  shallowReactive,
  toRaw,
  markReadonly,
  markNonReactive
} from '@vue/reactivity'
export { computed } from './apiComputed'
export { watch, watchEffect } from './apiWatch'
export {
  onBeforeMount,
  onMounted,
  onBeforeUpdate,
  onUpdated,
  onBeforeUnmount,
  onUnmounted,
  onActivated,
  onDeactivated,
  onRenderTracked,
  onRenderTriggered,
  onErrorCaptured
} from './apiLifecycle'
export { provide, inject } from './apiInject'
export { nextTick } from './scheduler'
export { defineComponent } from './apiDefineComponent'

// runtime-core 第二部分：先进的？ API
// Advanced API ----------------------------------------------------------------

// 获取 setup() 执行时的组件实例，这里说可能被一些先进的插件所使用
// For getting a hold of the internal instance in setup() - useful for advanced
// plugins
export { getCurrentInstance } from './component'

// For raw render function users
export { h } from './h'
export {
  createVNode,
  cloneVNode,
  mergeProps,
  openBlock,
  createBlock
} from './vnode'
// Internal Components
export { Text, Comment, Fragment } from './vnode'
export { Portal, PortalProps } from './components/Portal'
export { Suspense, SuspenseProps } from './components/Suspense'
export { KeepAlive, KeepAliveProps } from './components/KeepAlive'
export {
  BaseTransition,
  BaseTransitionProps
} from './components/BaseTransition'

// SFC CSS Modules
export { useCSSModule } from './helpers/useCssModule'

// SSR context
export { useSSRContext, ssrContextKey } from './helpers/useSsrContext'

// runtime-core 第三部分：内部 API
// Internal API ----------------------------------------------------------------

// For custom renderers
export { createRenderer, createHydrationRenderer } from './renderer'
export { warn } from './warning'
export {
  handleError,
  callWithErrorHandling,
  callWithAsyncErrorHandling
} from './errorHandling'
export {
  useTransitionState,
  resolveTransitionHooks,
  setTransitionHooks
} from './components/BaseTransition'

// For compiler generated code
// should sync with '@vue/compiler-core/src/runtimeConstants.ts'
export { withDirectives } from './directives'
export {
  resolveComponent,
  resolveDirective,
  resolveDynamicComponent
} from './helpers/resolveAssets'
export { renderList } from './helpers/renderList'
export { toHandlers } from './helpers/toHandlers'
export { renderSlot } from './helpers/renderSlot'
export { createSlots } from './helpers/createSlots'
export { pushScopeId, popScopeId, withScopeId } from './helpers/scopeId'
export {
  setBlockTracking,
  createTextVNode,
  createCommentVNode,
  createStaticVNode
} from './vnode'
export { toDisplayString, camelize } from '@vue/shared'

// For integration with runtime compiler
export { registerRuntimeCompiler } from './component'

// runtime-core 第四部分：SSR Utils
// SSR -------------------------------------------------------------------------

import { createComponentInstance, setupComponent } from './component'
import {
  renderComponentRoot,
  setCurrentRenderingInstance
} from './componentRenderUtils'
import { isVNode, normalizeVNode } from './vnode'

// SSR utils are only exposed in cjs builds.
const _ssrUtils = {
  createComponentInstance,
  setupComponent,
  renderComponentRoot,
  setCurrentRenderingInstance,
  isVNode,
  normalizeVNode
}

export const ssrUtils = (__NODE_JS__ ? _ssrUtils : null) as typeof _ssrUtils

// runtime-core 第五部分：类型定义
// Types -----------------------------------------------------------------------

export {
  ReactiveEffect,
  ReactiveEffectOptions,
  DebuggerEvent,
  TrackOpTypes,
  TriggerOpTypes,
  Ref,
  ComputedRef,
  UnwrapRef,
  WritableComputedOptions
} from '@vue/reactivity'
export {
  // types
  WatchOptions,
  WatchCallback,
  WatchSource,
  StopHandle
} from './apiWatch'
export { InjectionKey } from './apiInject'
export {
  App,
  AppConfig,
  AppContext,
  Plugin,
  CreateAppFunction
} from './apiCreateApp'
export {
  VNode,
  VNodeTypes,
  VNodeProps,
  VNodeArrayChildren,
  VNodeNormalizedChildren
} from './vnode'
export {
  Component,
  FunctionalComponent,
  ComponentInternalInstance,
  RenderFunction,
  SetupContext
} from './component'
export {
  ComponentOptions,
  ComponentOptionsWithoutProps,
  ComponentOptionsWithObjectProps as ComponentOptionsWithProps,
  ComponentOptionsWithArrayProps
} from './apiOptions'
export { ComponentPublicInstance } from './componentProxy'
export {
  Renderer,
  HydrationRenderer,
  RendererOptions,
  RootRenderFunction
} from './renderer'
export { RootHydrateFunction } from './hydration'
export { Slot, Slots } from './componentSlots'
export {
  Prop,
  PropType,
  ComponentPropsOptions,
  ComponentObjectPropsOptions
} from './componentProps'
export {
  Directive,
  DirectiveBinding,
  DirectiveHook,
  ObjectDirective,
  FunctionDirective,
  DirectiveArguments
} from './directives'
export { SuspenseBoundary } from './components/Suspense'
export { TransitionState, TransitionHooks } from './components/BaseTransition'
export { HMRRuntime } from './hmr'
