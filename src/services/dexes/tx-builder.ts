import { BigNumber, BigNumberish } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { FEE_RATE, FEE_RATE_PRECISION, FEE_RECIPIENT } from "../../config/constants";
import ContractAddress, { SupportedRouters } from "../../config/contracts";
import { AlgebraRouter__factory, ERC20__factory, UniV3Router__factory, WrappedETH__factory } from "../../typechain-types";
import { Transaction } from "../../types/transaction";
import { ISwapRouter as IUniV3SwapRouter } from "../../typechain-types/UniV3Router";
import { ISwapRouter as IAlgebraSwapRouter } from "../../typechain-types/AlgebraRouter";

const WETHInterface = WrappedETH__factory.createInterface();
const UniV3RouterInterface = UniV3Router__factory.createInterface();
const AlgebraRouterInterface = AlgebraRouter__factory.createInterface();

export function calculatePaymentAndAmountIn(spentAmount: BigNumber) {
    const payment = spentAmount.mul(FEE_RATE).div(FEE_RATE_PRECISION)
    const amountIn = spentAmount.sub(payment);
    return { payment, amountIn };
}
export function buildWrapETHTx(amount: BigNumberish): Transaction {
    return {
        to: ContractAddress.WETH,
        value: amount,
        data: WETHInterface.encodeFunctionData("deposit")
    }
}
export function buildApprovalTx(tokenAddress: string, amount: BigNumberish, router: string): Transaction {
    return {
        data: ERC20__factory.createInterface().encodeFunctionData("approve", [router, amount]),
        to: tokenAddress,
        value: parseEther('0')
    }
}
export function buildBuyPaymentTx(
    payment: BigNumberish
): Transaction {
    return {
        to: FEE_RECIPIENT,
        value: payment,
        data: '0x'
    }
}

export function buildSellPaymentTx(
    token: string,
    payment: BigNumberish
): Transaction {
    return {
        to: token,
        value: parseEther('0'),
        data: ERC20__factory.createInterface().encodeFunctionData("transfer", [FEE_RECIPIENT, payment])
    }
}
export function buildUniV3ExactInputSingleTx(
    callValue: BigNumber,
    params: IUniV3SwapRouter.ExactInputSingleParamsStruct
): Transaction {

    const calldata = UniV3RouterInterface.encodeFunctionData("exactInputSingle", [params])

    return {
        data: calldata,
        to: SupportedRouters.UniswapV3Router,
        value: callValue
    }
}
export function buildAlgebraExactInputSingleTx(
    callValue: BigNumber,
    params: IAlgebraSwapRouter.ExactInputSingleParamsStruct
): Transaction {

    const calldata = AlgebraRouterInterface.encodeFunctionData("exactInputSingle", [params])

    return {
        data: calldata,
        to: SupportedRouters.CamelotV3Router,
        value: callValue
    }
}