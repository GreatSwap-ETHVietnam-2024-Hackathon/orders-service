import dotenv from "dotenv";
dotenv.config();
import { formatEther } from "ethers/lib/utils";
import { RELAYER_NUMBER, getRelayer } from "./src/services/relayers";
import { Provider } from "./src/config/constants";

async function main() {
    for (let i = 0; i < RELAYER_NUMBER; i++) {
        const relayer = getRelayer(i).address
        const balance = await Provider.getBalance(relayer)
        console.log(`Relayer ${i}: ${formatEther(balance)}`)
    }
}

main();