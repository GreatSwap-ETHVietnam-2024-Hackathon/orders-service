import BigNumber from "bignumber.js";
import ContractAddress from "../../config/contracts";

const Q96 = new BigNumber(2).pow(96);
export function calculateSqrtPriceLimitX96(token: string, slippage: number, sqrtPriceX96Value: string, isSellOrder: boolean) {

    const sqrtPriceX96 = new BigNumber(sqrtPriceX96Value);
    const isToken0 = token.toLowerCase() < ContractAddress.WETH.toLowerCase()

    const ratio = isSellOrder ?
        Math.sqrt(1 - slippage)
        : Math.sqrt(1 + slippage)

    const result = isToken0 ? sqrtPriceX96.multipliedBy(ratio) : sqrtPriceX96.dividedBy(ratio)

    return result.toFixed(0);
}

export function calculatePriceImpact(token: string, preSqrtPriceX96Value: string, postSqrtPriceX96Value: string) {

    const preSqrtPriceX96 = new BigNumber(preSqrtPriceX96Value);
    const postSqrtPriceX96 = new BigNumber(postSqrtPriceX96Value);
    const isToken0 = token.toLowerCase() < ContractAddress.WETH.toLowerCase()

    const priceImpact = isToken0 ?
        postSqrtPriceX96.minus(preSqrtPriceX96)
            .multipliedBy(postSqrtPriceX96.plus(preSqrtPriceX96))
            .dividedBy(preSqrtPriceX96.pow(2))
        : preSqrtPriceX96.minus(postSqrtPriceX96)
            .multipliedBy(preSqrtPriceX96.plus(postSqrtPriceX96))
            .dividedBy(postSqrtPriceX96.pow(2))
    return priceImpact.multipliedBy(100).toFixed(4);
}

export function calculateUniV3Threshold(token: string, isBuyOrder: boolean, amountInValue: string, sqrtPriceLimitX96: string) {
    const amountIn = new BigNumber(amountInValue);
    const isToken0 = token.toLowerCase() < ContractAddress.WETH.toLowerCase()
    const zeroToOne = isToken0 !== isBuyOrder;
    const ratio = new BigNumber(sqrtPriceLimitX96).dividedBy(Q96).pow(2);
    if (zeroToOne) {
        return amountIn.multipliedBy(ratio).toFixed(0)
    }
    return amountIn.dividedBy(ratio).toFixed(0)
}