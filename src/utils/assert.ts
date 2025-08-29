import {log} from './log'

export function logAssert(condition:any, msg?:string): asserts condition {
    if (!condition) {
        log(msg || "Assertion failed");
        throw new Error(msg || "Assertion failed");
    }
}

export function assert(condition: any, msg?: string): asserts condition {
    if (!condition) {
        throw new Error(msg || "Assertion failed");
    }
}