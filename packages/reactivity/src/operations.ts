// using literal strings instead of numbers so that it's easier to inspect
// debugger events

// 很奇怪，has 和 iterate 怎么收集？
// track 方法里没有对不同类型做区分，可能是 onTrack 回调中使用了
export const enum TrackOpTypes {
  GET = 'get',
  HAS = 'has',
  ITERATE = 'iterate'
}

export const enum TriggerOpTypes {
  SET = 'set',
  ADD = 'add',
  DELETE = 'delete',
  CLEAR = 'clear'
}
