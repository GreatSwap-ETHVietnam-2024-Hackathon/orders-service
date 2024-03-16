import dotenv from "dotenv";
dotenv.config();
import { Wallet } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { RELAYER_NUMBER, getRelayer } from "./src/services/relayers";
import { Provider } from "./src/config/constants";

const fundWallet = new Wallet(process.env.FUND_PRIVATE_KEY!, Provider)

async function main() {
    const distribution = parseEther('1');
    for (let i = 0; i < RELAYER_NUMBER; i++) {
        const relayer = getRelayer(i).address
        const tx = await fundWallet.sendTransaction({
            to: relayer,
            value: distribution
        })
        tx.wait()
    }
}

main();