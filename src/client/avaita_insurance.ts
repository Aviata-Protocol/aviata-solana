/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/ban-ts-comment */

import {
  Account,
  Connection,
  BpfLoader,
  BPF_LOADER_PROGRAM_ID,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import fs from 'mz/fs';

// @ts-ignore
import BufferLayout from 'buffer-layout';

import {url, urlTls} from './util/url';
import {Store} from './util/store';
import {newAccountWithLamports} from './util/new-account-with-lamports';

/**
 * Connection to the network
 */
let connection: Connection;

/**
 * Connection to the network
 */
let userAccount: Account;

/**
 * Aviata insurance's program id
 */
let programId: PublicKey;

/**
 * The public key of the Aviata account
 */
let aviataPubkey: PublicKey;

const pathToProgram = 'dist/program/avaitainsurance.so';

/**
 * Layout of the aviata account data
 */
const aviataAccountDataLayout = BufferLayout.struct([
  BufferLayout.u32('numOfFlightsInsured'),
]);

let insurancePackagePrice: number;
let insurancePackageRefund: number;

/**
 * Establish a connection to the cluster
 */
export async function establishConnection(): Promise<void> {
  connection = new Connection(url, 'singleGossip');
  const version = await connection.getVersion();
  console.log('Connection to cluster established:', url, version);
}

/**
 * Transfer lamports to Sol.
 */
function lamportsToSol(lamports: number) {
  return lamports / LAMPORTS_PER_SOL
}

export function selectInsurancePackage(insurancePrice:number, refundAmount: number) {
  console.log("Insurance Plan: Price = ", insurancePrice, "Sol. Refund = ", refundAmount, "Sol");
  insurancePackagePrice = insurancePrice * LAMPORTS_PER_SOL;
  insurancePackageRefund = refundAmount * LAMPORTS_PER_SOL;
}

/**
 * Establish an account to pay for insurance
 */
export async function establishUser(): Promise<void> {
  if (!userAccount) {
    let fees = 0;
    const {feeCalculator} = await connection.getRecentBlockhash();

    // Calculate the cost to load the program
    const data = await fs.readFile(pathToProgram);
    const NUM_RETRIES = 500; // allow some number of retries
    fees +=
      feeCalculator.lamportsPerSignature *
        (BpfLoader.getMinNumSignatures(data.length) + NUM_RETRIES) +
      (await connection.getMinimumBalanceForRentExemption(data.length));

    // Calculate the cost to fund the aviata account
    fees += await connection.getMinimumBalanceForRentExemption(
      aviataAccountDataLayout.span,
    );
    fees += insurancePackagePrice;
    
    // Calculate the cost of sending the transactions
    fees += feeCalculator.lamportsPerSignature * 100; // wag
    
    // Create new account which will insure a flight
    userAccount = await newAccountWithLamports(connection, fees);
  }

  const lamports = await connection.getBalance(userAccount.publicKey);
  console.log(
    'Using account',
    userAccount.publicKey.toBase58(),
    'containing',
    lamports / LAMPORTS_PER_SOL,
    'Sol to pay for fees and insurenace',
    '(=',
    lamports,
    'lamports)'
  );
}

/**
 * Load the aviata insurance BPF program if not already loaded
 */
export async function loadProgram(): Promise<void> {
  const store = new Store();

  // Check if the program has already been loaded
  try {
    const config = await store.load('config.json');
    programId = new PublicKey(config.programId);
    aviataPubkey = new PublicKey(config.greetedPubkey);
    await connection.getAccountInfo(programId);
    console.log('Program already loaded to account', programId.toBase58());
    return;
  } catch (err) {
    // try to load the program
  }

  // Load the program
  console.log('Loading aviata insurance program...');
  const data = await fs.readFile(pathToProgram);
  const programAccount = new Account();
  await BpfLoader.load(
    connection,
    userAccount,
    programAccount,
    data,
    BPF_LOADER_PROGRAM_ID,
  );
  programId = programAccount.publicKey;
  console.log('Program loaded to account', programId.toBase58());

  // Create the aviata account
  const aviataAccount = new Account();
  aviataPubkey = aviataAccount.publicKey;
  console.log('Creating aviata account', aviataPubkey.toBase58(), 'to receive transaction');
  const space = aviataAccountDataLayout.span;
  let lamports = await connection.getMinimumBalanceForRentExemption(
    aviataAccountDataLayout.span,
  );
  lamports += insurancePackagePrice;
  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: userAccount.publicKey,
      newAccountPubkey: aviataPubkey,
      lamports,
      space,
      programId,
    }),
  );
  await sendAndConfirmTransaction(
    connection,
    transaction,
    [userAccount, aviataAccount],
    {
      commitment: 'singleGossip',
      preflightCommitment: 'singleGossip',
    },
  );

  // Save this info for next time
  await store.save('config.json', {
    url: urlTls,
    programId: programId.toBase58(),
    aviataPubkey: aviataPubkey.toBase58(),
  });
}

/**
 * Insure a flight
 */
export async function insureFlight(flightNumber: string): Promise<void> {
  console.log('Insuring a flight ', flightNumber);
  const instruction = new TransactionInstruction({
    keys: [{pubkey: aviataPubkey, isSigner: false, isWritable: true}],
    programId,
    data: Buffer.alloc(0), // All instructions are hellos
  });
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(instruction),
    [userAccount],
    {
      commitment: 'singleGossip',
      preflightCommitment: 'singleGossip',
    },
  );
}

/**
 * Report statistics and final balances of user and aviata
 */
export async function reportStatistics(): Promise<void> {
  const accountInfo = await connection.getAccountInfo(aviataPubkey);
  if (accountInfo === null) {
    throw 'Error: cannot find the aviata account';
  }
  const info = aviataAccountDataLayout.decode(Buffer.from(accountInfo.data));
  console.log(
    'Total of ',
    info.numOfFlightsInsured.toString(),
    'flights have been insured on Aviata',
  );
  console.log(
    'User balance in the end',
    lamportsToSol(await connection.getBalance(userAccount.publicKey)),
    ' Sol'
  );
  console.log(
    'aviata balance in the end ',
    lamportsToSol(await connection.getBalance(aviataPubkey)),
    'Sol'
  );
  console.log(
    'Total transaction fees ',
    lamportsToSol(await connection.getBalance(programId)),
    'Sol'
    );
}

/**
 * Report the number of times the greeted account has been said hello to
 */
export async function reportUserBalance(): Promise<void> {
  console.log('user balance in the beggining', lamportsToSol(await connection.getBalance(userAccount.publicKey)));
}
