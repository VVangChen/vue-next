/**
 * defineComponent 的实现很简单，我们也能够理解接受两种参数 - 函数和对象
 *
 * 这个文件最重要的部分是 defineComponent 的类型定义，值得我们学习
 * 定义了 defineComponent 四种重载方式：
 * 1. 参数为 setup 函数
 * 2. 参数为对象，且没有 props
 * 3. 参数为对象，且 props 为数组
 * 4. 参数为对象，且 props 为对象
 *
 * new () 在 TS 中代表什么？https://stackoverflow.com/questions/39622778/what-is-new-in-typescript
 *
 * 组件实例的定义可看 componentProxy 中的 ComponentPublicInstance
 */
import {
  ComputedOptions,
  MethodOptions,
  ComponentOptionsWithoutProps,
  ComponentOptionsWithArrayProps,
  ComponentOptionsWithObjectProps
} from './apiOptions'
import { SetupContext, RenderFunction } from './component'
import { ComponentPublicInstance } from './componentProxy'
import { ExtractPropTypes, ComponentPropsOptions } from './componentProps'
import { isFunction } from '@vue/shared'
import { VNodeProps } from './vnode'

// defineComponent is a utility that is primarily used for type inference
// when declaring components. Type inference is provided in the component
// options (provided as the argument). The returned value has artifical types
// for TSX / manual render function / IDE support.

// overload 1: direct setup function
// (uses user defined props interface)
export function defineComponent<Props, RawBindings = object>(
  setup: (
    props: Readonly<Props>,
    ctx: SetupContext
  ) => RawBindings | RenderFunction
): {
  new (): ComponentPublicInstance<
    Props,
    RawBindings,
    {},
    {},
    {},
    // public props
    VNodeProps & Props
  >
}

// overload 2: object format with no props
// (uses user defined props interface)
// return type is for Vetur and TSX support
export function defineComponent<
  Props,
  RawBindings,
  D,
  C extends ComputedOptions = {},
  M extends MethodOptions = {}
>(
  options: ComponentOptionsWithoutProps<Props, RawBindings, D, C, M>
): {
  new (): ComponentPublicInstance<
    Props,
    RawBindings,
    D,
    C,
    M,
    VNodeProps & Props
  >
}

// overload 3: object format with array props declaration
// props inferred as { [key in PropNames]?: any }
// return type is for Vetur and TSX support
export function defineComponent<
  PropNames extends string,
  RawBindings,
  D,
  C extends ComputedOptions = {},
  M extends MethodOptions = {}
>(
  options: ComponentOptionsWithArrayProps<PropNames, RawBindings, D, C, M>
): {
  // array props technically doesn't place any contraints on props in TSX
  new (): ComponentPublicInstance<VNodeProps, RawBindings, D, C, M>
}

// overload 4: object format with object props declaration
// see `ExtractPropTypes` in ./componentProps.ts
export function defineComponent<
  // the Readonly constraint allows TS to treat the type of { required: true }
  // as constant instead of boolean.
  PropsOptions extends Readonly<ComponentPropsOptions>,
  RawBindings,
  D,
  C extends ComputedOptions = {},
  M extends MethodOptions = {}
>(
  options: ComponentOptionsWithObjectProps<PropsOptions, RawBindings, D, C, M>
): {
  new (): ComponentPublicInstance<
    ExtractPropTypes<PropsOptions>,
    RawBindings,
    D,
    C,
    M,
    VNodeProps & ExtractPropTypes<PropsOptions, false>
  >
}

// implementation, close to no-op
// 定义组件
// 如果是函数，则赋给 setup
// 如果不是，则作为 options
export function defineComponent(options: unknown) {
  return isFunction(options) ? { setup: options } : options
}
