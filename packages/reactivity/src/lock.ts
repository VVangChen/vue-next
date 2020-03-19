// 不太清楚这在什么时候回被设为 false
// 只读一开始就是 LOCKED 吧？
// global immutability lock
export let LOCKED = true

export function lock() {
  LOCKED = true
}

export function unlock() {
  LOCKED = false
}
