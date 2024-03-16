import { Schema } from "mongoose";
import { TelegramSalt } from "../types/salt";
import { approvalDB } from "../../db";

const TelegramSaltSchema = new Schema<TelegramSalt>(
    {
        telegramId: {
            type: Number,
            required: true,
            unique: true,
            index: true
        },
        salt: {
            type: Number,
            required: true,
            default: 0
        }
    }
)

const TelegramSaltModel = approvalDB.model("TelegramSalt", TelegramSaltSchema)

export default TelegramSaltModel;