import dotenv from 'dotenv';
dotenv.config();
import { checkAndExecuteOrders } from './src/services/limit-orders';
import rmqManager from './src/amqp';

async function main() {
  await rmqManager.init();
  console.log('RMQ is ready!!!');
  checkAndExecuteOrders();
}

main();
