import dotenv from "dotenv";
dotenv.config();
import { Wallet } from "ethers";
import { Provider } from "./src/config/constants";
import { ECDSAModule__factory, Multicall__factory, SmartAccountFactory__factory, SwapSessionKeyManager__factory } from "./src/typechain-types";
import { Approval, calculateTokenLeaf } from "./src/types/approval";
import MerkleTree from "merkletreejs";
import { keccak256 } from "ethereumjs-util";
import ApprovalModel from "./src/models/approval";
import { getSessionKey } from "./src/services/keys-generator/session-keys";



async function commitSessionKey() {

    const sasOwnerWallet = new Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", Provider)
    const numberOfSAs = 100;
    const indexes = [...Array(numberOfSAs).keys()]

    const telegramId = 5455613873;
    const sessionKey = await getSessionKey(telegramId);
    const saFactoryAddress = "0xB435767a057B2B70e36e3c1ea5aBedb09346beD6";
    const swapSKMAddress = "0x7677BFA00826363F9d4f8fBd866EE89644db0161";
    const ecdsaModuleAddress = "0x9B133f75b1f895572F817CC36F27379E520f86c7";
    const multicallAddress = "0xcA11bde05977b3631167028862bE2a173976CA11";

    const SupportedRouters = {
        UniswapV3Router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        CamelotV3Router: '0x1F721E2E82F6676FCE4eA07A5958cF098D339e18'
    }

    const tokens = [
        '0x912CE59144191C1204E64559FE8253a0e49E6548',
        '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
        '0x00cbcf7b3d37844e44b888bc747bdd75fcf4e555',
        '0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a',
        '0x9842989969687f7d249d01cae1d2ff6b7b6b6d35',
        '0xf97f4df75117a78c1a5a0dbb814af92458539fb4',
        '0x4e352cf164e64adcbad318c3a1e222e9eba4ce42',
        '0x0c880f6761f1af8d9aa9c466984b80dab9a8c9e8',
        '0x539bde0d7dbd336b79148aa742883198bbf60342',
        '0x6daf586b7370b14163171544fca24abcc0862ac5',
    ]

    const factoryInterface = SmartAccountFactory__factory.createInterface();
    const calls = indexes.map(index => ({
        target: saFactoryAddress,
        allowFailure: true,
        callData: SmartAccountFactory__factory.createInterface().encodeFunctionData("getAddressForCounterFactualAccount", [
            swapSKMAddress,
            ecdsaModuleAddress,
            ECDSAModule__factory.createInterface().encodeFunctionData(
                "initForSmartAccount",
                [sasOwnerWallet.address]
            ),
            index
        ])
    }))

    const multicall = Multicall__factory.connect(multicallAddress, Provider);
    const results = await multicall.callStatic.aggregate3(calls)

    const SAs = results.map(res => factoryInterface.decodeFunctionResult("getAddressForCounterFactualAccount", res.returnData)[0].toLowerCase())
    const routers = Object.values(SupportedRouters)
    const leaves: string[] = []
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        for (let j = 0; j < SAs.length; j++) {
            const smartAccount = SAs[j];
            for (let k = 0; k < routers.length; k++) {
                leaves.push(calculateTokenLeaf(smartAccount, sessionKey.address, token, routers[k]))
            }
        }
    }
    const merkleTree = new MerkleTree(leaves, keccak256, {
        sortPairs: true,
        hashLeaves: false,
        sortLeaves: true
    })
    const root = merkleTree.getHexRoot()

    console.log(root);

    const tx = await SwapSessionKeyManager__factory.connect(swapSKMAddress, sasOwnerWallet).setMerkleRoot(
        root
    )

    await tx.wait();

    const newApproval: Approval = {
        smartAccountsOwner: sasOwnerWallet.address.toLowerCase(),
        smartAccounts: SAs.map(sa => sa.toLowerCase()),
        tokens: tokens.map(t => t.toLowerCase()),
        locked: false,
        connected: true,
        telegramId: 5455613873
    }

    await ApprovalModel.updateOne({
        telegramId: newApproval.telegramId,
        smartAccountsOwner: newApproval.smartAccountsOwner
    }, {
        $set: {
            ...newApproval
        }
    }, {
        upsert: true
    })
}
commitSessionKey();