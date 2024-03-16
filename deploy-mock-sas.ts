import dotenv from "dotenv";
dotenv.config();
import { Wallet } from "ethers";
import { Provider } from "./src/config/constants";
import { deployFirstSAs, getFirstSAs } from "./src/services/user-operations/smart-account";
import { formatEther, parseEther } from "ethers/lib/utils";

const smartAccountOwnerWallet = new Wallet(process.env.MOCK_SA_OWNER_PRIVATE_KEY!, Provider)

const numWallet = 5;
async function main() {
    await deployFirstSAs(smartAccountOwnerWallet, numWallet);
    const sas = await getFirstSAs(smartAccountOwnerWallet.address, numWallet);
    for (let i = 0; i < numWallet; i++) {
        const tx = await smartAccountOwnerWallet.sendTransaction({
            to: sas[i],
            value: parseEther('1000')
        })
        await tx.wait();
    }

    for (let i = 0; i < numWallet; i++) {
        const balance = await Provider.getBalance(sas[i])
        const code = await Provider.getCode(sas[i])
        console.log(`SA ${i}: ${formatEther(balance)}`)
        console.log(`Code: ${code}`)
    }
}

main();