export const EventNames = {
  CREATE_CHANNEL_EVENT: "CREATE_CHANNEL_EVENT",
  DEPOSIT_CONFIRMED_EVENT: "DEPOSIT_CONFIRMED_EVENT",
  DEPOSIT_FAILED_EVENT: "DEPOSIT_FAILED_EVENT",
  DEPOSIT_STARTED_EVENT: "DEPOSIT_STARTED_EVENT",
  INSTALL_EVENT: "INSTALL_EVENT",
  INSTALL_VIRTUAL_EVENT: "INSTALL_VIRTUAL_EVENT",
  REJECT_INSTALL_EVENT: "REJECT_INSTALL_EVENT",
  UNINSTALL_EVENT: "UNINSTALL_EVENT",
  UNINSTALL_VIRTUAL_EVENT: "UNINSTALL_VIRTUAL_EVENT",
  UPDATE_STATE_EVENT: "UPDATE_STATE_EVENT",
  WITHDRAWAL_CONFIRMED_EVENT: "WITHDRAWAL_CONFIRMED_EVENT",
  WITHDRAWAL_FAILED_EVENT: "WITHDRAWAL_FAILED_EVENT",
  WITHDRAWAL_STARTED_EVENT: "WITHDRAWAL_STARTED_EVENT",
  PROPOSE_INSTALL_EVENT: "PROPOSE_INSTALL_EVENT",
  PROTOCOL_MESSAGE_EVENT: "PROTOCOL_MESSAGE_EVENT"
};
export type EventName = keyof typeof EventNames;

// TODO: merge these?

export const ConnextEvents = {
  ...EventNames,
  RECIEVE_TRANSFER_FAILED_EVENT: "RECIEVE_TRANSFER_FAILED_EVENT",
  RECIEVE_TRANSFER_FINISHED_EVENT: "RECIEVE_TRANSFER_FINISHED_EVENT",
  RECIEVE_TRANSFER_STARTED_EVENT: "RECIEVE_TRANSFER_STARTED_EVENT",
};
export type ConnextEvent = keyof typeof ConnextEvents;

export type NodeEvent = EventName;
export const NODE_EVENTS = EventNames;