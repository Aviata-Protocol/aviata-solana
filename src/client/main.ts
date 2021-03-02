/**
 * Aviata Insurance
 */

import {
  establishConnection,
  establishUser,
  loadProgram,
  insureFlight,
  reportStatistics,
  reportUserBalance,
  selectInsurancePackage,
} from './avaita_insurance';

async function main() {
  console.log("Insure a flight for user using Solana account...");

  // Establish connection to the cluster
  await establishConnection();

  // Select insurance package - price = 1 Sol, refund = 10 Sol
  await selectInsurancePackage(1, 10);

  // Determine who is insuring the flight
  await establishUser();
  
  // Report user balance before insuring a flight
  await reportUserBalance();

  // Load the program if not already loaded
  await loadProgram();

  // Insure a flight
  const flightNumber="AA123456";
  await insureFlight(flightNumber);

  // Find out how many times flights have been insured on Aviata
  await reportStatistics();

  console.log('Success');
}

main().then(
  () => process.exit(),
  err => {
    console.error(err);
    process.exit(-1);
  },
);
