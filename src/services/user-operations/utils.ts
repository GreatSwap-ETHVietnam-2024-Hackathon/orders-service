import { ethers } from "ethers";

const DefaultGasOverheads = {
    fixed: 21000,
    perUserOp: 18300,
    perUserOpWord: 4,
    zeroByte: 4,
    nonZeroByte: 16,
    bundleSize: 1,
    sigSize: 65
}

export function callDataCost(data: string): number {
    const callDataCost = ethers.utils
        .arrayify(data)
        .map((x: any) => (x === 0 ? DefaultGasOverheads.zeroByte : DefaultGasOverheads.nonZeroByte))
        .reduce((sum: any, x: any) => sum + x);
    const lengthInWord = (data.length + 31) / 32
    const ret = Math.round(
        callDataCost +
        DefaultGasOverheads.fixed +
        DefaultGasOverheads.perUserOp +
        DefaultGasOverheads.perUserOpWord * lengthInWord
    )
    return ret
}