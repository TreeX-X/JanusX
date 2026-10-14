import { app } from 'electron'
import { join } from 'node:path'
import { MemoStore } from './store'

let store: MemoStore | undefined
export function memoStore(): MemoStore { return store ??= new MemoStore(join(app.getPath('userData'), 'janusx', 'memos')) }
