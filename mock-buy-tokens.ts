import dotenv from "dotenv";
dotenv.config();
import { Wallet } from "ethers";
import { Provider } from "./src/config/constants";
import ApprovalModel from "./src/models/approval";
import TokenMarketModel from "./src/models/token-market-info";
import { buyToken } from "./src/services/manual-orders/buy";
import { parseEther } from "ethers/lib/utils";
import { SupportedRouters } from "./src/config/contracts";



async function mockBuyTokens() {

    const sasOwnerWallet = new Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", Provider)
    const telegramId = 5455613873
    const smartAccountsOwner = sasOwnerWallet.address.toLowerCase();
    const approval = (await ApprovalModel.findOne({ telegramId, smartAccountsOwner }))!
    const token = approval.tokens[0]
    const marketInfo = (await TokenMarketModel.findOne({ address: token }))!
    const router = marketInfo.mostLiquidPool.name === "Pancake" ? SupportedRouters.UniswapV3Router : SupportedRouters.CamelotV3Router
    const fee = marketInfo.mostLiquidPool.fee ?? marketInfo.mostLiquidPool.feeOtz ?? marketInfo.mostLiquidPool.feeZto!
    const chunk = 1;
    const ethAmount = parseEther('0.01')
    let success = 0;
    const calls = approval.smartAccounts.length / chunk

    async function executeBuy(i: number) {
        const participatingSmartAccounts = approval.smartAccounts.slice(chunk * i, chunk * (i + 1));
        try {
            const res = await buyToken(
                telegramId,
                smartAccountsOwner,
                participatingSmartAccounts,
                token,
                ethAmount,
                router,
                0.1,
                fee,
                marketInfo.mostLiquidPool.sqrtPriceX96
            )
            if (res.txHash) {
                console.log(res);
                success++;
            }
        } catch (err) {
            console.log(err)
        }
    }
    const indexes = [...Array(calls).keys()]
    await Promise.all(indexes.map(i => executeBuy(i)))


    console.log("Successful calls: ", success);
}
mockBuyTokens();