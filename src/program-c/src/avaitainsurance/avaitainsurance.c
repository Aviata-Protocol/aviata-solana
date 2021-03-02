/**
 * @brief C-based avaitainsurance BPF program
 */
#include <solana_sdk.h>

uint64_t avaitainsurance(SolParameters *params) {

  if (params->ka_num < 1) {
    sol_log("Aviata account not included in the instruction");
    return ERROR_NOT_ENOUGH_ACCOUNT_KEYS;
  }

  // Get the aviata account
  SolAccountInfo *aviata_account = &params->ka[0];

  // The account must be owned by the program in order to modify its data
  if (!SolPubkey_same(aviata_account->owner, params->program_id)) {
    sol_log("Aviata account does not have the correct program id");
    return ERROR_INCORRECT_PROGRAM_ID;
  }

  // The data must be large enough to hold an uint32_t value
  if (aviata_account->data_len < sizeof(uint32_t)) {
    sol_log("Aviata account data length too small to hold uint32_t value");
    return ERROR_INVALID_ACCOUNT_DATA;
  }

  // Increment and store the number of times the account has been aviata
  uint32_t *num_of_flights_insured = (uint32_t *)aviata_account->data;
  *num_of_flights_insured += 1;

  sol_log("Done!");

  return SUCCESS;
}

extern uint64_t entrypoint(const uint8_t *input) {
  sol_log("avaitainsurance C program entrypoint");

  SolAccountInfo accounts[1];
  SolParameters params = (SolParameters){.ka = accounts};

  if (!sol_deserialize(input, &params, SOL_ARRAY_SIZE(accounts))) {
    return ERROR_INVALID_ARGUMENT;
  }

  return avaitainsurance(&params);
}
